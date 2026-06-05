// Auto-suggest backfill for Domain.strategy. Runs the URL-pattern detector
// from src/lib/strategy-autosuggest over every domain (excluding adult
// quarantine) and bulk-updates Domain.strategy.

import "dotenv/config";
import pg from "pg";
import { detectStrategy } from "../src/lib/strategy-autosuggest";

const { Client } = pg;

interface Row {
  id: string;
  url: string;
  name: string | null;
  current_strategy: string;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rows = await client.query<Row>(
    `SELECT "id", "url", "name", "strategy" AS current_strategy
     FROM "pbn"."Domain"
     WHERE "isAdult" = false`,
  );
  console.log(`Loaded ${rows.rows.length} non-adult domains.`);

  const before = await client.query<{ s: string; c: number }>(
    `SELECT "strategy" AS s, COUNT(*)::int AS c
     FROM "pbn"."Domain" GROUP BY "strategy" ORDER BY c DESC`,
  );
  console.log("\nBEFORE:");
  for (const r of before.rows) console.log(`  ${r.s.padEnd(10)} ${r.c}`);

  let changed = 0;
  let unchanged = 0;
  const transitions: Record<string, number> = {};
  const reasons: Record<string, number> = {};

  for (const row of rows.rows) {
    const hint = detectStrategy({ url: row.url, name: row.name ?? undefined });
    reasons[hint.reason] = (reasons[hint.reason] || 0) + 1;
    if (hint.strategy === row.current_strategy) {
      unchanged++;
      continue;
    }
    const k = `${row.current_strategy} -> ${hint.strategy}`;
    transitions[k] = (transitions[k] || 0) + 1;
    await client.query(
      `UPDATE "pbn"."Domain" SET "strategy" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [hint.strategy, row.id],
    );
    changed++;
  }

  console.log(`\nChanged: ${changed}, unchanged: ${unchanged}`);
  console.log("\nTop transitions:");
  for (const [k, v] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log("\nDetector reason hits (top 10):");
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }

  const after = await client.query<{ s: string; c: number }>(
    `SELECT "strategy" AS s, COUNT(*)::int AS c
     FROM "pbn"."Domain" GROUP BY "strategy" ORDER BY c DESC`,
  );
  console.log("\nAFTER:");
  for (const r of after.rows) console.log(`  ${r.s.padEnd(10)} ${r.c}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
