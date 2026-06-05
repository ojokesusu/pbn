// Opsi 2 — quota-based strategy redistribute (Sandi 2026-06-05).
//
// The strategy auto-detect from URL patterns yielded a very lopsided result:
//   whitehat 1829 (98%) — fallback for brand-random PBN domains with no
//                          money keyword in the URL
//   greyhat    13 (0.7%) — caught crypto/invest/forex/etc.
//   blackhat   31 (1.7%) — caught slot/casino/poker/etc.
//
// Sandi wants a 50 / 20 / 30 split white / grey / black:
//   ~915 whitehat, ~366 greyhat, ~547 blackhat
//
// Approach (mirrors Opsi D for niche redistribution):
//   1. Keep the 31 specifically-detected blackhat + 13 greyhat — they were
//      caught by URL pattern, that signal is real.
//   2. Pick the FALLBACK whitehat pool (the 1829) and round-robin assign a
//      target strategy across them according to the quota.
//   3. Adult-quarantined domains are excluded from redistribution.
//   4. Idempotent on re-run: it just keeps cycling, no rows added/removed.

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

// Target distribution per Sandi 2026-06-05.
const TARGET = {
  whitehat: 0.50,
  greyhat: 0.20,
  blackhat: 0.30,
};
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const before = await client.query(
    `SELECT "strategy", COUNT(*)::int AS c
     FROM "pbn"."Domain" WHERE "isAdult"=false
     GROUP BY "strategy" ORDER BY c DESC`,
  );
  console.log("BEFORE strategy distribution:");
  for (const r of before.rows) console.log(`  ${r.strategy.padEnd(10)} ${r.c}`);

  // Candidates for redistribution = the current whitehat fallback pool.
  // Detected greyhat / blackhat domains are preserved.
  const candidates = await client.query(
    `SELECT id FROM "pbn"."Domain"
     WHERE "isAdult"=false AND "strategy"='whitehat'
     ORDER BY random()`,
  );
  console.log(`\nWhitehat fallback pool to redistribute: ${candidates.rows.length}`);

  // Compute target counts per strategy from the pool size.
  const poolSize = candidates.rows.length;
  const target = {
    whitehat: Math.round(poolSize * TARGET.whitehat),
    greyhat: Math.round(poolSize * TARGET.greyhat),
    blackhat: poolSize, // will be corrected to fill remainder below
  };
  target.blackhat = poolSize - target.whitehat - target.greyhat;
  console.log("Target slice of fallback pool:");
  console.log(`  whitehat: ${target.whitehat}`);
  console.log(`  greyhat:  ${target.greyhat}`);
  console.log(`  blackhat: ${target.blackhat}`);

  // Round-robin: slice the shuffled pool by the target counts. The first
  // target.whitehat rows stay whitehat (no-op), next target.greyhat become
  // greyhat, last target.blackhat become blackhat.
  const assignments = [];
  let i = 0;
  for (; i < target.whitehat; i++) assignments.push({ id: candidates.rows[i].id, to: "whitehat" });
  for (let j = 0; j < target.greyhat; j++, i++) assignments.push({ id: candidates.rows[i].id, to: "greyhat" });
  for (let j = 0; j < target.blackhat; j++, i++) assignments.push({ id: candidates.rows[i].id, to: "blackhat" });

  const perChange = { whitehat: 0, greyhat: 0, blackhat: 0 };
  for (const a of assignments) perChange[a.to]++;
  console.log(`\nPer-strategy assignments (whitehat=no-op, others write):`);
  for (const [k, v] of Object.entries(perChange)) console.log(`  ${k.padEnd(10)} ${v}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Nothing written.");
    await client.end();
    return;
  }

  // Write only the changes (skip whitehat→whitehat no-ops). Batch in transactions of 100.
  const toWrite = assignments.filter(a => a.to !== "whitehat");
  console.log(`\nWriting ${toWrite.length} updates...`);

  const BATCH = 100;
  let written = 0;
  for (let k = 0; k < toWrite.length; k += BATCH) {
    const slice = toWrite.slice(k, k + BATCH);
    await client.query("BEGIN");
    try {
      for (const a of slice) {
        await client.query(
          `UPDATE "pbn"."Domain" SET "strategy"=$1, "updatedAt"=NOW() WHERE id=$2`,
          [a.to, a.id],
        );
        written++;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("batch fail:", e.message);
      throw e;
    }
    if (written % 500 === 0 || written === toWrite.length) console.log(`  written ${written}/${toWrite.length}`);
  }

  const after = await client.query(
    `SELECT "strategy", COUNT(*)::int AS c
     FROM "pbn"."Domain" WHERE "isAdult"=false
     GROUP BY "strategy" ORDER BY c DESC`,
  );
  console.log("\nAFTER strategy distribution:");
  for (const r of after.rows) console.log(`  ${r.strategy.padEnd(10)} ${r.c}`);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
