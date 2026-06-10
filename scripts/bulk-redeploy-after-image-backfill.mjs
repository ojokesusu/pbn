// Step 2 of broken-image fix: enqueue N domains/day (anti-spam pace).
// Targets domains where at least 1 article's featuredImage was updated AFTER
// lastDeployed (i.e. new image in DB but HTML on server is stale).
//
// Daemon handles natural pace drain. We just enqueue, daemon picks up.
// Phase D capacity gate (server domainCap) auto-rejects overflow.
//
// Default: --dry-run. Pass --apply to enqueue.
// Override pace via --pace=50 (default), --limit=50 (defaults to pace).

import "dotenv/config";
import pg from "pg";
import { randomBytes } from "node:crypto";

const { Client } = pg;
const DRY = !process.argv.includes("--apply");
const paceArg = process.argv.find((a) => a.startsWith("--pace="));
const PACE = paceArg ? parseInt(paceArg.split("=")[1], 10) : 50;
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : PACE;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const r = await c.query(
    `SELECT d.id, d.url, d."lastDeployed",
       COUNT(a.id)::int AS stale_articles
     FROM "pbn"."Domain" d
     JOIN "pbn"."Article" a ON a."domainId" = d.id
     JOIN "pbn"."Server" s ON s.id = d."serverId"
     WHERE d."isAdult" = false
       AND d."writeOff" = false
       AND s.status = 'active'
       AND a."featuredImage" IS NOT NULL AND a."featuredImage" != ''
       AND a."updatedAt" > COALESCE(d."lastDeployed", '2020-01-01'::timestamp)
     GROUP BY d.id, d.url, d."lastDeployed"
     -- Prioritise ALREADY-DEPLOYED domains (lastDeployed not null) first: those
     -- are live and currently showing broken <img> to visitors, so fixing them
     -- has visible impact. Never-deployed domains (no live broken image yet)
     -- come after, ordered by most stale-images first within each group.
     ORDER BY (d."lastDeployed" IS NULL) ASC, stale_articles DESC, d."lastDeployed" ASC
     LIMIT $1`,
    [LIMIT],
  );

  console.log(`Found ${r.rows.length} domains with stale HTML (image updated post-deploy).`);
  console.log(`Pace: ${PACE}/day. Mode: ${DRY ? "DRY-RUN" : "APPLY"}.\n`);

  if (DRY) {
    r.rows.slice(0, 10).forEach((row, i) =>
      console.log(`  [${i + 1}/${r.rows.length}] ${row.url} (stale=${row.stale_articles}, lastDeployed=${row.lastDeployed})`),
    );
    if (r.rows.length > 10) console.log(`  ... +${r.rows.length - 10} more`);
    console.log(`\nRe-run with --apply to enqueue these.`);
    await c.end();
    return;
  }

  console.log(`[APPLY] Enqueueing ${r.rows.length} domains...`);
  let queued = 0, failed = 0;
  for (const row of r.rows) {
    try {
      // ID generated in JS — Supabase Postgres has no pgcrypto, so
      // gen_random_bytes() is unavailable. randomBytes is plenty unique here.
      const newId = "dq_" + randomBytes(12).toString("hex");
      await c.query(
        `INSERT INTO "pbn"."DeployQueueItem" (id, "domainId", "serverId", status, priority, "createdAt")
         SELECT $2, d.id, d."serverId", 'queued', 50, NOW()
         FROM "pbn"."Domain" d WHERE d.id = $1
         ON CONFLICT ("domainId") DO UPDATE SET status='queued', priority=50, "attemptedAt"=NULL, "errorMessage"=''`,
        [row.id, newId],
      );
      queued++;
      if (queued % 10 === 0) console.log(`  ${queued}/${r.rows.length} queued`);
    } catch (err) {
      failed++;
      console.error(`  FAIL ${row.url}: ${err.message}`);
    }
  }

  console.log(`\nDONE: ${queued} queued, ${failed} failed.`);
  console.log(`Daemon picks up at next poll. Anti-spam pace ${PACE}/day = re-run daily.`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
