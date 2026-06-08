// Reconcile DeployQueueItem.status vs Domain.isAlive / lastDeployed reality.
//
// Background: queue and domain truths can drift —
//   - queue says 'dead' but local-probe flipped Domain.isAlive=true (recoverable)
//   - queue says 'failed' but the attempt is ancient (stuck/orphaned)
//   - queue says 'paused' but it's been >24h (someone forgot to resume)
//   - 42 domains are alive yet never deployed (lost backlog)
//   - 848 undeployed-dead NXDOMAIN noise should be write-off'd
//
// This script is READ-ONLY by default. Flags:
//   --apply               re-enqueue the false-dead mismatches (queue=dead, isAlive=true)
//   --writeoff-nxdomain   mark undeployed-dead as Domain.writeOff=true
//                          (safeguard: only if last DomainHealthLog was a local-probe
//                           and gave errorReason='dns')
//
// Output is grouped per bucket so the operator can eyeball mismatches fast.

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const APPLY = process.argv.includes("--apply");
const WRITEOFF_NX = process.argv.includes("--writeoff-nxdomain");

const SECTION = (title) => {
  const bar = "=".repeat(72);
  console.log(`\n${bar}\n${title}\n${bar}`);
};

const SUB = (title) => {
  console.log(`\n--- ${title} ---`);
};

function fmtRow(r) {
  return Object.entries(r)
    .map(([k, v]) => `${k}=${v === null ? "null" : v}`)
    .join("  ");
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // ──────────────────────────────────────────────────────────────────────
  // 1. Decompose queue=dead by Domain.isAlive + never_deployed
  // ──────────────────────────────────────────────────────────────────────
  SECTION("1. Decompose queue.status='dead' by Domain.isAlive + never_deployed");
  const decomp = await c.query(
    `SELECT q.status,
            d."isAlive"                       AS is_alive,
            (d."lastDeployed" IS NULL)        AS never_deployed,
            COUNT(*)::int                     AS n
       FROM "pbn"."DeployQueueItem" q
       JOIN "pbn"."Domain" d ON q."domainId" = d.id
      WHERE q.status = 'dead'
      GROUP BY 1, 2, 3
      ORDER BY n DESC`,
  );
  if (decomp.rows.length === 0) {
    console.log("(no queue=dead rows)");
  } else {
    for (const r of decomp.rows) console.log("  " + fmtRow(r));
  }
  const totalDead = decomp.rows.reduce((s, r) => s + r.n, 0);
  console.log(`  TOTAL queue=dead: ${totalDead}`);

  // ──────────────────────────────────────────────────────────────────────
  // 2. False-dead: queue=dead AND Domain.isAlive=true → recoverable
  // ──────────────────────────────────────────────────────────────────────
  SECTION("2. False-dead mismatches  (queue=dead AND Domain.isAlive=true)");
  const falseDead = await c.query(
    `SELECT q.id           AS queue_id,
            d.id           AS domain_id,
            d.url,
            d."isAlive"    AS is_alive,
            d."httpStatus" AS http,
            d."lastChecked",
            d."lastDeployed",
            q."attemptedAt"
       FROM "pbn"."DeployQueueItem" q
       JOIN "pbn"."Domain" d ON q."domainId" = d.id
      WHERE q.status = 'dead' AND d."isAlive" = true
      ORDER BY d."lastChecked" DESC NULLS LAST`,
  );
  console.log(`  Count: ${falseDead.rows.length}`);
  SUB("sample 10");
  for (const r of falseDead.rows.slice(0, 10)) console.log("  " + fmtRow(r));

  // ──────────────────────────────────────────────────────────────────────
  // 3. Stuck failures: queue=failed AND attemptedAt > 7d ago
  // ──────────────────────────────────────────────────────────────────────
  SECTION("3. Stuck failures  (queue=failed AND attemptedAt > 7 days ago)");
  const stuck = await c.query(
    `SELECT q.id          AS queue_id,
            d.id          AS domain_id,
            d.url,
            d."isAlive"   AS is_alive,
            q."attemptedAt",
            q."errorMessage"
       FROM "pbn"."DeployQueueItem" q
       JOIN "pbn"."Domain" d ON q."domainId" = d.id
      WHERE q.status = 'failed'
        AND q."attemptedAt" IS NOT NULL
        AND q."attemptedAt" < NOW() - INTERVAL '7 days'
      ORDER BY q."attemptedAt" ASC`,
  );
  console.log(`  Count: ${stuck.rows.length}`);
  SUB("sample 10");
  for (const r of stuck.rows.slice(0, 10)) {
    const msg = (r.errorMessage || "").slice(0, 60);
    console.log("  " + fmtRow({ ...r, errorMessage: msg }));
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4. Long-paused: queue=paused AND createdAt > 24h ago
  // ──────────────────────────────────────────────────────────────────────
  SECTION("4. Long-paused  (queue=paused AND createdAt > 24h ago)");
  const paused = await c.query(
    `SELECT q.id          AS queue_id,
            d.id          AS domain_id,
            d.url,
            d."isAlive"   AS is_alive,
            q."createdAt",
            q."scheduledAt"
       FROM "pbn"."DeployQueueItem" q
       JOIN "pbn"."Domain" d ON q."domainId" = d.id
      WHERE q.status = 'paused'
        AND q."createdAt" < NOW() - INTERVAL '24 hours'
      ORDER BY q."createdAt" ASC`,
  );
  console.log(`  Count: ${paused.rows.length}`);
  SUB("sample 10");
  for (const r of paused.rows.slice(0, 10)) console.log("  " + fmtRow(r));

  // ──────────────────────────────────────────────────────────────────────
  // 5. Backfill: undeployed-alive (Domain lastDeployed IS NULL AND isAlive=true)
  // ──────────────────────────────────────────────────────────────────────
  SECTION("5. Undeployed-alive backfill  (lastDeployed IS NULL AND isAlive=true)");
  const undeployedAlive = await c.query(
    `SELECT d.id,
            d.url,
            d."httpStatus",
            d."lastChecked",
            d."isAdult",
            d."writeOff",
            (q.id IS NOT NULL)  AS in_queue,
            q.status            AS queue_status
       FROM "pbn"."Domain" d
       LEFT JOIN "pbn"."DeployQueueItem" q ON q."domainId" = d.id
      WHERE d."lastDeployed" IS NULL
        AND d."isAlive" = true
      ORDER BY d."lastChecked" DESC NULLS LAST`,
  );
  const total = undeployedAlive.rows.length;
  const inQueue = undeployedAlive.rows.filter((r) => r.in_queue).length;
  const notInQueue = total - inQueue;
  const byQueueStatus = {};
  for (const r of undeployedAlive.rows) {
    if (!r.in_queue) continue;
    byQueueStatus[r.queue_status] = (byQueueStatus[r.queue_status] || 0) + 1;
  }
  console.log(`  Total undeployed-alive domains: ${total}`);
  console.log(`    in DeployQueueItem:     ${inQueue}`);
  console.log(`    NOT in DeployQueueItem: ${notInQueue}  (= true orphan backlog)`);
  if (Object.keys(byQueueStatus).length) {
    console.log(`  Breakdown of in-queue rows by current queue status:`);
    for (const [k, v] of Object.entries(byQueueStatus)) console.log(`    ${k.padEnd(12)} ${v}`);
  }
  SUB("sample 10 orphan backlog (not in queue)");
  const orphans = undeployedAlive.rows.filter((r) => !r.in_queue).slice(0, 10);
  for (const r of orphans) console.log("  " + fmtRow(r));

  // ──────────────────────────────────────────────────────────────────────
  // 6. Undeployed-dead writeOff candidates
  //    Safeguard: must have last DomainHealthLog row with errorReason='dns'
  // ──────────────────────────────────────────────────────────────────────
  SECTION("6. Undeployed-dead NXDOMAIN write-off candidates");
  const nxCandidates = await c.query(
    `WITH last_log AS (
       SELECT DISTINCT ON ("domainId")
              "domainId", "checkedAt", "errorReason", "isAlive"
         FROM "pbn"."DomainHealthLog"
        ORDER BY "domainId", "checkedAt" DESC
     )
     SELECT d.id,
            d.url,
            d."writeOff",
            d."isAdult",
            l."errorReason"   AS last_reason,
            l."checkedAt"     AS last_checked_at
       FROM "pbn"."Domain" d
       LEFT JOIN last_log l ON l."domainId" = d.id
      WHERE d."lastDeployed" IS NULL
        AND d."isAlive" = false
        AND d."writeOff" = false
      ORDER BY l."checkedAt" DESC NULLS LAST`,
  );
  const dnsBacked = nxCandidates.rows.filter((r) => r.last_reason === "dns");
  const noProbe = nxCandidates.rows.filter((r) => !r.last_reason);
  const otherReason = nxCandidates.rows.filter((r) => r.last_reason && r.last_reason !== "dns");
  console.log(`  Total undeployed-dead (not yet writeOff): ${nxCandidates.rows.length}`);
  console.log(`    safe to write-off (last probe = dns):  ${dnsBacked.length}`);
  console.log(`    has probe but other reason:            ${otherReason.length}`);
  console.log(`    never locally probed (SKIP):           ${noProbe.length}`);
  SUB("sample 10 dns-backed candidates");
  for (const r of dnsBacked.slice(0, 10)) console.log("  " + fmtRow(r));

  // ──────────────────────────────────────────────────────────────────────
  // WRITES (only with explicit flags)
  // ──────────────────────────────────────────────────────────────────────
  if (!APPLY && !WRITEOFF_NX) {
    SECTION("DRY RUN — no writes performed. Pass --apply / --writeoff-nxdomain to act.");
    await c.end();
    return;
  }

  if (APPLY && falseDead.rows.length > 0) {
    SECTION(`APPLY: re-enqueue ${falseDead.rows.length} false-dead items → status='queued'`);
    await c.query("BEGIN");
    try {
      const ids = falseDead.rows.map((r) => r.queue_id);
      const res = await c.query(
        `UPDATE "pbn"."DeployQueueItem"
            SET status = 'queued',
                "errorMessage" = '',
                "attemptedAt" = NULL
          WHERE id = ANY($1::text[])`,
        [ids],
      );
      await c.query("COMMIT");
      console.log(`  Updated ${res.rowCount} rows.`);
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("  ROLLBACK:", e.message);
      throw e;
    }
  } else if (APPLY) {
    console.log("\n[APPLY] No false-dead rows to re-enqueue.");
  }

  if (WRITEOFF_NX && dnsBacked.length > 0) {
    SECTION(`APPLY: writeOff=true for ${dnsBacked.length} dns-backed undeployed-dead`);
    await c.query("BEGIN");
    try {
      const ids = dnsBacked.map((r) => r.id);
      const res = await c.query(
        `UPDATE "pbn"."Domain"
            SET "writeOff" = true
          WHERE id = ANY($1::text[])`,
        [ids],
      );
      await c.query("COMMIT");
      console.log(`  Updated ${res.rowCount} rows.`);
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("  ROLLBACK:", e.message);
      throw e;
    }
  } else if (WRITEOFF_NX) {
    console.log("\n[WRITEOFF-NX] No dns-backed candidates to mark.");
  }

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
