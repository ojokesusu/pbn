// Backfill NicheMapping using niche-autosuggest v2 (33 niches + news fallback).
//
// Reads every NicheMapping row, runs detectNiche() against the linked domain's
// URL, and UPDATEs the niche if it changed. Prints a before/after distribution
// snapshot so the niche-shift impact is obvious.
//
// Idempotent: re-running after the rules stabilize is a no-op.

import "dotenv/config";
import pg from "pg";
import { detectNiche } from "../src/lib/niche-autosuggest";

const { Client } = pg;

interface Row {
  domain_id: string;
  url: string;
  name: string | null;
  current_niche: string;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rowsRes = await client.query<Row>(
    `SELECT nm."domainId" AS domain_id,
            d."url",
            d."name",
            nm."niche" AS current_niche
     FROM "pbn"."NicheMapping" nm
     JOIN "pbn"."Domain" d ON d."id" = nm."domainId"
     WHERE d."isAdult" = false`,
  );
  console.log(`Loaded ${rowsRes.rows.length} mappings (excluding adult-quarantined).`);

  const before = await client.query<{ niche: string; c: number }>(
    `SELECT "niche", COUNT(*)::int AS c
     FROM "pbn"."NicheMapping"
     GROUP BY "niche"
     ORDER BY c DESC`,
  );
  console.log("\nBEFORE distribution:");
  for (const r of before.rows) {
    console.log(`  ${(r.niche || "(empty)").padEnd(15)} ${r.c}`);
  }

  let changed = 0;
  let unchanged = 0;
  const changes: Record<string, number> = {};

  for (const row of rowsRes.rows) {
    const detected = detectNiche({ url: row.url, name: row.name });
    if (detected.niche === row.current_niche) {
      unchanged++;
      continue;
    }
    const transition = `${row.current_niche || "(empty)"} -> ${detected.niche}`;
    changes[transition] = (changes[transition] || 0) + 1;
    await client.query(
      `UPDATE "pbn"."NicheMapping"
       SET "niche" = $1, "keywords" = $2, "updatedAt" = NOW()
       WHERE "domainId" = $3`,
      [detected.niche, detected.keywords, row.domain_id],
    );
    changed++;
  }

  console.log(`\nChanged: ${changed}, unchanged: ${unchanged}`);
  console.log("\nTop transitions:");
  const sorted = Object.entries(changes).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [k, v] of sorted) {
    console.log(`  ${k.padEnd(30)} ${v}`);
  }

  const after = await client.query<{ niche: string; c: number }>(
    `SELECT "niche", COUNT(*)::int AS c
     FROM "pbn"."NicheMapping"
     GROUP BY "niche"
     ORDER BY c DESC`,
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
