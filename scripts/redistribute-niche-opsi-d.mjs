// Opsi D — round-robin redistribute fallback 'news' domains across 18 niches.
// Keeps the 411 domains that were keyword-detected (non-news).
// Idempotent: rerunning is safe (will just keep cycling the same set).

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

// 18 target niches per the chat thread. Operator can override later via the
// /content/niches Redistribute modal that lands in this same commit.
const TARGET_NICHES = [
  "news", "politik", "kriminal", "hukum", "ekonomi", "hiburan",
  "otomotif", "bola", "gaming", "properti", "karir", "parenting",
  "fashion", "beauty", "religion", "tech", "health", "food",
];

// Which niche to PULL FROM. After detector-v2 backfill the giant lifestyle
// bucket collapsed into 'news' — that's now the redistribute source.
const FALLBACK_NICHE = "news";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const before = await client.query(
    `SELECT "niche", COUNT(*)::int AS c
     FROM "pbn"."NicheMapping"
     GROUP BY "niche" ORDER BY c DESC`,
  );
  console.log("BEFORE distribution:");
  for (const r of before.rows) {
    console.log(`  ${(r.niche || "(empty)").padEnd(15)} ${r.c}`);
  }

  // Pull rows ordered by domainId for deterministic round-robin.
  const rowsRes = await client.query(
    `SELECT nm."domainId", d."url"
     FROM "pbn"."NicheMapping" nm
     JOIN "pbn"."Domain" d ON d."id" = nm."domainId"
     WHERE nm."niche" = $1 AND d."isAdult" = false
     ORDER BY nm."domainId"`,
    [FALLBACK_NICHE],
  );
  console.log(`\nFallback bucket size: ${rowsRes.rows.length} rows`);

  const perNiche = {};
  for (const n of TARGET_NICHES) perNiche[n] = 0;

  const BATCH = 50;
  let processed = 0;

  for (let i = 0; i < rowsRes.rows.length; i += BATCH) {
    const slice = rowsRes.rows.slice(i, i + BATCH);
    await client.query("BEGIN");
    try {
      for (let j = 0; j < slice.length; j++) {
        const row = slice[j];
        const newNiche = TARGET_NICHES[(i + j) % TARGET_NICHES.length];
        await client.query(
          `UPDATE "pbn"."NicheMapping"
           SET "niche" = $1, "updatedAt" = NOW()
           WHERE "domainId" = $2`,
          [newNiche, row.domainId],
        );
        perNiche[newNiche]++;
        processed++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Batch ${i}-${i + BATCH} failed:`, err.message);
      throw err;
    }
    if (processed % 500 === 0 || processed === rowsRes.rows.length) {
      console.log(`  redistributed ${processed} / ${rowsRes.rows.length}`);
    }
  }

  console.log("\nPer-niche assignments (from fallback bucket):");
  for (const [niche, count] of Object.entries(perNiche)) {
    console.log(`  ${niche.padEnd(15)} +${count}`);
  }

  const after = await client.query(
    `SELECT "niche", COUNT(*)::int AS c
     FROM "pbn"."NicheMapping"
     GROUP BY "niche" ORDER BY c DESC`,
  );
  console.log("\nAFTER distribution:");
  for (const r of after.rows) {
    console.log(`  ${(r.niche || "(empty)").padEnd(15)} ${r.c}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
