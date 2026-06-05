// Bulk-create DomainSchedule rows for every non-adult domain that doesn't
// have one yet. Without this row the server-side scheduler skips the domain
// entirely — currently 1350 domains are idle for this reason.
//
// Idempotent: only inserts where no row exists. Existing rows are left
// untouched (operator-tuned settings preserved).

import "dotenv/config";
import pg from "pg";
import crypto from "crypto";

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const before = await client.query(
    `SELECT COUNT(*) FILTER (WHERE "isActive" = true)::int AS active,
            COUNT(*)::int AS total
     FROM "pbn"."DomainSchedule"`,
  );
  console.log("BEFORE — DomainSchedule active/total:", before.rows[0].active + "/" + before.rows[0].total);

  // Fetch every non-adult Domain that does NOT yet have a DomainSchedule row.
  const orphans = await client.query(
    `SELECT d.id, d.url
     FROM "pbn"."Domain" d
     WHERE d."isAdult" = false
       AND NOT EXISTS (SELECT 1 FROM "pbn"."DomainSchedule" ds WHERE ds."domainId" = d.id)
     ORDER BY d."createdAt" DESC`,
  );
  console.log(`Idle domains needing activation: ${orphans.rows.length}`);

  if (orphans.rows.length === 0) {
    console.log("Nothing to do.");
    await client.end();
    return;
  }

  // Single transaction so the table stays consistent. Per-row INSERT keeps
  // the cuid prefix matching the rest of the codebase ('ds_').
  await client.query("BEGIN");
  let inserted = 0;
  try {
    for (const row of orphans.rows) {
      const id = `ds_${crypto.randomBytes(8).toString("hex")}`;
      await client.query(
        `INSERT INTO "pbn"."DomainSchedule"
           ("id","domainId","isActive","totalGenerated","createdAt","updatedAt")
         VALUES ($1, $2, true, 0, NOW(), NOW())
         ON CONFLICT ("domainId") DO NOTHING`,
        [id, row.id],
      );
      inserted += 1;
      if (inserted % 200 === 0) console.log(`  inserted ${inserted}/${orphans.rows.length}`);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Failed, rolled back:", e.message);
    throw e;
  }

  const after = await client.query(
    `SELECT COUNT(*) FILTER (WHERE "isActive" = true)::int AS active,
            COUNT(*)::int AS total
     FROM "pbn"."DomainSchedule"`,
  );
  console.log(`\nDONE inserted ${inserted} rows.`);
  console.log("AFTER  — DomainSchedule active/total:", after.rows[0].active + "/" + after.rows[0].total);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
