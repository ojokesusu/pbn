// Logical DB backup — dumps the entire `pbn` schema to a single compressed
// NDJSON file. No pg_dump dependency (not installed on the RDP); uses the `pg`
// lib that ships with the dashboard. The RDP daemon invokes this for each
// queued BackupRecord; it can also be run standalone.
//
// Output format (gzipped NDJSON), one JSON object per line:
//   {"__meta__":{"createdAt":"...","schema":"pbn","tables":[...]}}
//   {"__table__":"Server","__count__":35}
//   {<row>} ... (35 lines)
//   {"__table__":"Domain","__count__":712}
//   {<row>} ...
// Restore: scripts/db-restore.mjs reads this back.
//
// Tables are discovered dynamically from information_schema, so models added
// later are picked up automatically.
//
// Usage:
//   node scripts/db-backup.mjs --id=<backupRecordId>   (daemon mode: updates the row)
//   node scripts/db-backup.mjs                         (standalone: just writes a file)
//   BACKUP_DIR overrides the output dir (default D:/Users/user16/pbn/backups/db).

import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const { Client } = pg;

const idArg = process.argv.find((a) => a.startsWith("--id="));
const BACKUP_ID = idArg ? idArg.split("=")[1] : null;
const tsArg = process.argv.find((a) => a.startsWith("--ts="));
// Date.now()/new Date() are fine in a plain script (not a workflow), but accept
// an injected timestamp for deterministic filenames when the daemon supplies one.
const STAMP = tsArg ? tsArg.split("=")[1] : new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP_DIR = process.env.BACKUP_DIR || "D:/Users/user16/pbn/backups/db";

async function updateRecord(c, fields) {
  if (!BACKUP_ID) return;
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
  await c.query(
    `UPDATE "pbn"."BackupRecord" SET ${sets}, "updatedAt" = NOW() WHERE id = $1`,
    [BACKUP_ID, ...keys.map((k) => fields[k])],
  );
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  try {
    await updateRecord(c, { status: "running", progress: 1, currentStep: "discovering tables", startedAt: new Date() });

    // Discover all base tables in the pbn schema.
    const tablesRes = await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'pbn' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const tables = tablesRes.rows.map((r) => r.table_name)
      // Never back up the backup-bookkeeping tables themselves — circular + noisy.
      .filter((t) => t !== "BackupRecord" && t !== "EvacuationJob");

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const fileName = `pbn-backup-${STAMP}.ndjson.gz`;
    const outPath = path.join(BACKUP_DIR, fileName);

    const gzip = zlib.createGzip({ level: 6 });
    const out = fs.createWriteStream(outPath);
    const gzipDone = pipeline(gzip, out);

    const write = (obj) =>
      new Promise((resolve, reject) => {
        gzip.write(JSON.stringify(obj) + "\n", (err) => (err ? reject(err) : resolve()));
      });

    const counts = {};
    await write({ __meta__: { createdAt: new Date().toISOString(), schema: "pbn", tables } });

    let done = 0;
    for (const table of tables) {
      const cntRes = await c.query(`SELECT COUNT(*)::int AS n FROM "pbn"."${table}"`);
      const n = cntRes.rows[0].n;
      counts[table] = n;
      await write({ __table__: table, __count__: n });

      // Page through rows so a huge table (Article ~31k with Text) doesn't blow memory.
      const PAGE = 1000;
      for (let offset = 0; offset < n; offset += PAGE) {
        const rows = await c.query(`SELECT * FROM "pbn"."${table}" ORDER BY 1 LIMIT ${PAGE} OFFSET ${offset}`);
        for (const row of rows.rows) await write(row);
      }
      done++;
      const progress = Math.min(95, Math.round((done / tables.length) * 90) + 5);
      await updateRecord(c, { progress, currentStep: `dumped ${table} (${n} rows)` });
      console.log(`  [${done}/${tables.length}] ${table}: ${n} rows`);
    }

    gzip.end();
    await gzipDone;

    const sizeBytes = fs.statSync(outPath).size;
    const sizeMb = Math.round((sizeBytes / 1024 / 1024) * 100) / 100;
    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

    await updateRecord(c, {
      status: "success",
      progress: 100,
      currentStep: "done",
      sizeMb,
      tableCounts: JSON.stringify(counts),
      localPath: outPath,
      completedAt: new Date(),
    });

    console.log(`\nBACKUP_OK path=${outPath} sizeMb=${sizeMb} tables=${tables.length} rows=${totalRows}`);
    // Machine-readable last line for the daemon to parse.
    console.log(JSON.stringify({ ok: true, path: outPath, fileName, sizeMb, tables: tables.length, rows: totalRows }));
  } catch (err) {
    const msg = `${err?.name || "Error"}: ${String(err?.message || err).slice(0, 300)}`;
    await updateRecord(c, { status: "failed", currentStep: "error", errorMessage: msg }).catch(() => {});
    console.error("BACKUP_FAIL", msg);
    await c.end();
    process.exit(1);
  }

  await c.end();
}

main();
