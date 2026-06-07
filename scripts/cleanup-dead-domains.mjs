// Two-part cleanup after the 2026-06-07 local-probe sweep:
//
// 1. Retry transient failed queue items (timeout / SSH banner reads).
//    These weren't auth or config problems — daemon hit a network blip
//    and gave up. Reset to 'queued' so the next poll cycle picks them up.
//
// 2. Write-off the 693 truly-NXDOMAIN never-deployed domains. The DNS no
//    longer resolves anywhere, so no amount of redeploy or health probe
//    will revive them — the domain literally points to nothing. We mark
//    them in DeployQueueItem with status='dead' + errorMessage prefix so
//    they:
//      - stay reversible (filter on the errorMessage prefix to undo)
//      - show up in operator audit lists separately from active inventory
//      - stop being treated as "we'll deploy them eventually" by the daemon

import "dotenv/config";
import pg from "pg";
import crypto from "crypto";
const { Client } = pg;

const DRY = process.argv.includes("--dry-run");
const WRITEOFF_TAG = "writeoff_dns_dead_2026-06-07_local_probe";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // ── Part 1: Retry transient failed queue items ──────────────────────────
  const transientCandidates = await c.query(
    `SELECT id, "domainId", status, SUBSTRING("errorMessage", 1, 80) AS err
     FROM "pbn"."DeployQueueItem"
     WHERE status IN ('failed')
       AND ("errorMessage" ILIKE '%Timeout (control socket)%'
            OR "errorMessage" ILIKE '%SSHException%'
            OR "errorMessage" ILIKE '%WinError 10060%'
            OR "errorMessage" ILIKE '%WinError 10054%')`,
  );
  console.log(`Part 1: ${transientCandidates.rows.length} transient failed queue items to retry.`);

  if (!DRY && transientCandidates.rows.length > 0) {
    await c.query(
      `UPDATE "pbn"."DeployQueueItem"
       SET status = 'queued', "errorMessage" = '', "attemptedAt" = NULL
       WHERE id = ANY($1::text[])`,
      [transientCandidates.rows.map((r) => r.id)],
    );
    console.log(`  ${transientCandidates.rows.length} reset to queued.`);
  } else if (DRY) {
    console.log("  [DRY] Would reset to queued.");
  }

  // ── Part 2: Write-off truly-DNS-dead never-deployed domains ─────────────
  // Probe the never-deployed pool again, this time INLINE classify them by
  // current DNS resolution so we only write off the genuinely-NXDOMAIN ones,
  // not transient DNS issues that could come back.
  const candidatesQ = await c.query(
    `SELECT d.id, d.url
     FROM "pbn"."Domain" d
     WHERE d."isAlive" = false AND d."isAdult" = false AND d."lastDeployed" IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM "pbn"."DeployQueueItem" q
         WHERE q."domainId" = d.id AND q."errorMessage" LIKE 'writeoff_%'
       )
     ORDER BY d.id`,
  );
  console.log(`\nPart 2: ${candidatesQ.rows.length} never-deployed dead to re-classify.`);

  // Quick DNS check via fetch — we only mark for write-off domains that
  // FAIL with DNS reason (ENOTFOUND / EAI_AGAIN) on this fresh probe.
  // Concurrency 30, fast 6s timeout because we only care about DNS state.
  const candidates = candidatesQ.rows;
  let cursor = 0;
  const dnsDead = [];
  const TIMEOUT_MS = 6000;
  let completed = 0;

  await Promise.all(
    Array.from({ length: 30 }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= candidates.length) return;
        const d = candidates[i];
        try {
          await fetch(d.url, {
            method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow",
            headers: { "User-Agent": "PBN-DNS-Check/1.0" },
          });
        } catch (err) {
          const code = err?.cause?.code || err?.code || "";
          if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
            dnsDead.push(d);
          }
        }
        completed++;
        if (completed % 100 === 0) console.log(`  classified ${completed}/${candidates.length}`);
      }
    }),
  );

  console.log(`\nIdentified ${dnsDead.length} truly-DNS-dead domains.`);

  if (DRY) {
    console.log("[DRY] Would write off these in DeployQueueItem with status='dead'.");
    dnsDead.slice(0, 10).forEach((d) => console.log(`  ${d.url}`));
    await c.end();
    return;
  }

  // Insert write-off marker rows
  const BATCH = 100;
  let written = 0;
  for (let i = 0; i < dnsDead.length; i += BATCH) {
    const slice = dnsDead.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const d of slice) {
        const id = `dq_${crypto.randomBytes(8).toString("hex")}`;
        await c.query(
          `INSERT INTO "pbn"."DeployQueueItem"
             ("id","domainId","status","priority","errorMessage","createdAt")
           VALUES ($1, $2, 'dead', 100, $3, NOW())
           ON CONFLICT ("domainId") DO UPDATE SET
             status = 'dead', "errorMessage" = $3`,
          [id, d.id, WRITEOFF_TAG],
        );
        written++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("batch rollback:", e.message);
      throw e;
    }
  }
  console.log(`Written off ${written} domains with tag ${WRITEOFF_TAG}.`);

  // Final stats
  const stats = await c.query(
    `SELECT
       COUNT(*) FILTER (WHERE d."isAlive" = true)::int AS alive,
       COUNT(*) FILTER (WHERE d."isAlive" = false)::int AS dead,
       COUNT(*) FILTER (WHERE d."isAlive" = false AND q.status = 'dead' AND q."errorMessage" LIKE 'writeoff_%')::int AS writeoff,
       COUNT(*)::int AS total
     FROM "pbn"."Domain" d
     LEFT JOIN "pbn"."DeployQueueItem" q ON q."domainId" = d.id
     WHERE d."isAdult" = false`,
  );
  const { alive, dead, writeoff, total } = stats.rows[0];
  const active = total - writeoff;
  console.log(`\nFinal stats:`);
  console.log(`  Total non-adult: ${total}`);
  console.log(`  Write-off (NXDOMAIN/dead-marked): ${writeoff}`);
  console.log(`  Active inventory: ${active}`);
  console.log(`  Alive: ${alive} (${((alive / active) * 100).toFixed(1)}% of active, ${((alive / total) * 100).toFixed(1)}% of total)`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
