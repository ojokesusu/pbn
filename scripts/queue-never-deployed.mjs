// Bulk-queue all non-adult domains that have never been deployed AND have
// no DeployQueueItem row yet. Pace + server-id picked up automatically by
// the daemon as it drains them. Per Sandi 2026-06-07 target: 99% alive.
//
// Idempotent: only inserts where no row exists. Existing queue rows stay
// untouched so paused / dead / failed status preserved (separate workstream).

import "dotenv/config";
import pg from "pg";
import crypto from "crypto";

const { Client } = pg;
const DRY = process.argv.includes("--dry-run");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const candidates = await c.query(
    `SELECT d.id, d.url, d."serverId"
     FROM "pbn"."Domain" d
     WHERE d."isAlive" = false AND d."isAdult" = false
       AND d."lastDeployed" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "pbn"."DeployQueueItem" q WHERE q."domainId" = d.id)
     ORDER BY d."createdAt" DESC`,
  );
  console.log(`Found ${candidates.rows.length} never-deployed AND not-yet-queued domains.`);
  if (candidates.rows.length === 0) { await c.end(); return; }

  if (DRY) {
    console.log("DRY RUN — nothing written.");
    candidates.rows.slice(0, 10).forEach((r) => console.log(`  ${r.url}`));
    if (candidates.rows.length > 10) console.log(`  ... +${candidates.rows.length - 10} more`);
    await c.end();
    return;
  }

  await c.query("BEGIN");
  let inserted = 0;
  try {
    for (const row of candidates.rows) {
      const id = `dq_${crypto.randomBytes(8).toString("hex")}`;
      // Match existing convention: integer priority (0=highest urgency, 50=normal,
      // 100=low). Use 50 so new entries don't jump ahead of existing 314 queued
      // backlog at higher priorities.
      await c.query(
        `INSERT INTO "pbn"."DeployQueueItem"
           ("id","domainId","serverId","status","priority","createdAt")
         VALUES ($1, $2, $3, 'queued', 50, NOW())
         ON CONFLICT ("domainId") DO NOTHING`,
        [id, row.id, row.serverId],
      );
      inserted++;
      if (inserted % 100 === 0) console.log(`  inserted ${inserted}/${candidates.rows.length}`);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("Rolled back:", e.message);
    throw e;
  }

  const after = await c.query(
    `SELECT COUNT(*)::int AS n FROM "pbn"."DeployQueueItem" WHERE status = 'queued'`,
  );
  console.log(`\nDONE — ${inserted} DeployQueueItem rows added.`);
  console.log(`Total queued items now: ${after.rows[0].n}`);
  console.log(`At daemon pace 93/day, full drain ETA ~${Math.ceil(after.rows[0].n / 93)} days.`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
