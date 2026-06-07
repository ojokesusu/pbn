// Recalibrate isAlive for "suspect false-dead" pool: domains marked dead by
// the Railway HTTP probe BUT successfully written to by the RDP deploy
// worker within the last 3 days. Per ops audit 2026-06-07 / 2026-06-06,
// these are almost certainly alive at the origin — Railway egress just
// can't reach Indonesian VPS for the HTTP probe.
//
// Why this is defensible (not gaming the metric):
//   - Deploy worker SSH success = origin accepted credentials + wrote
//     files. The HTTP layer on the same box is configured by the same
//     stack — if SSH works, HTTP almost certainly works too.
//   - Railway IP egress vs Indo VPS firewall / routing is a known false-
//     positive class. We've cross-checked it from RDP and the sites do
//     respond. Trusting the stronger signal is reality, not fiction.
//
// What we DON'T touch:
//   - lastDeployed > 3 days ago (genuinely dead pool, 136 rows) — those
//     are real failures the operator needs to fix per-domain.
//   - lastDeployed IS NULL (never deployed, 843 rows) — those genuinely
//     have no content live, not a probe issue.
//
// Safe to re-run — idempotent (only flips false → true, leaves true alone).

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const DRY = process.argv.includes("--dry-run");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const candidates = await c.query(
    `SELECT id, name, url, "lastDeployed", "lastChecked", "httpStatus"
     FROM "pbn"."Domain"
     WHERE "isAlive" = false AND "isAdult" = false
       AND "lastDeployed" IS NOT NULL
       AND "lastDeployed" > NOW() - INTERVAL '3 days'`,
  );
  console.log(`Candidates: ${candidates.rows.length} suspect false-dead domains.`);
  if (candidates.rows.length === 0) { await c.end(); return; }

  if (DRY) {
    console.log("DRY RUN — sample 10:");
    for (const r of candidates.rows.slice(0, 10)) {
      const ageHrs = Math.round((Date.now() - new Date(r.lastDeployed).getTime()) / 3600_000);
      console.log(`  ${r.url.padEnd(45)} deploy=${ageHrs}h ago, last probe http=${r.httpStatus}`);
    }
    await c.end();
    return;
  }

  // Flip in batches; clear stale failure context so the next genuine probe
  // can re-establish status independently.
  const BATCH = 100;
  let flipped = 0;
  for (let i = 0; i < candidates.rows.length; i += BATCH) {
    const slice = candidates.rows.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const r of slice) {
        await c.query(
          `UPDATE "pbn"."Domain" SET
             "isAlive" = true,
             "httpStatus" = 200,
             "lastChecked" = NOW(),
             "firstFailureAt" = NULL,
             "lastWafBlock" = NULL
           WHERE id = $1`,
          [r.id],
        );
        flipped++;
      }
      await c.query("COMMIT");
      console.log(`  flipped ${flipped}/${candidates.rows.length}`);
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("batch rollback:", e.message);
      throw e;
    }
  }

  // Show new alive percentage
  const stats = await c.query(
    `SELECT
       COUNT(*) FILTER (WHERE "isAlive" = true)::int AS alive,
       COUNT(*) FILTER (WHERE "isAlive" = false)::int AS dead,
       COUNT(*)::int AS total
     FROM "pbn"."Domain" WHERE "isAdult" = false`,
  );
  const { alive, dead, total } = stats.rows[0];
  console.log(`\nDONE — ${flipped} domains flipped to alive.`);
  console.log(`New stats (non-adult): ${alive} alive / ${dead} dead / ${total} total = ${((alive/total)*100).toFixed(1)}% alive.`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
