// Restore a pbn-schema backup produced by db-backup.mjs.
//
// This is the break-glass DR operation. By default it restores INTO the
// database named by DATABASE_URL — which OVERWRITES current data — so it is
// guarded: you must pass --confirm. For restoring to a fresh/replacement DB,
// point RESTORE_DATABASE_URL at it.
//
// FK handling: we wrap the load in `SET session_replication_role = replica`,
// which disables FK/trigger enforcement during bulk insert (standard pg restore
// trick) so table order doesn't matter. Requires a role allowed to set it
// (Supabase service role / a self-managed superuser both work). If that SET is
// rejected, the script falls back to plain inserts and reports any FK errors.
//
// Usage:
//   node scripts/db-restore.mjs --file=<path.ndjson.gz> --confirm
//   RESTORE_DATABASE_URL=... node scripts/db-restore.mjs --file=... --confirm
//   add --truncate to wipe each table before loading (default: ON CONFLICT DO NOTHING)

import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";

const { Client } = pg;

const fileArg = process.argv.find((a) => a.startsWith("--file="));
const FILE = fileArg ? fileArg.split("=")[1] : null;
const CONFIRM = process.argv.includes("--confirm");
const TRUNCATE = process.argv.includes("--truncate");
const TARGET_URL = process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL;

if (!FILE) { console.error("Missing --file=<backup.ndjson.gz>"); process.exit(2); }
if (!fs.existsSync(FILE)) { console.error(`File not found: ${FILE}`); process.exit(2); }
if (!CONFIRM) {
  console.error("Refusing to restore without --confirm (this OVERWRITES the target DB).");
  process.exit(2);
}

async function insertBatch(c, table, rows) {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const colSql = cols.map((k) => `"${k}"`).join(", ");
  // Build a multi-row VALUES list with positional params.
  const params = [];
  const tuples = rows.map((row) => {
    const ph = cols.map((k) => {
      params.push(row[k] === undefined ? null : row[k]);
      return `$${params.length}`;
    });
    return `(${ph.join(", ")})`;
  });
  const conflict = ` ON CONFLICT DO NOTHING`;
  await c.query(
    `INSERT INTO "pbn"."${table}" (${colSql}) VALUES ${tuples.join(", ")}${conflict}`,
    params,
  );
  return rows.length;
}

async function main() {
  const c = new Client({ connectionString: TARGET_URL });
  await c.connect();

  let replicaMode = false;
  try {
    await c.query("SET session_replication_role = replica");
    replicaMode = true;
  } catch {
    console.warn("Could not set session_replication_role=replica — FK checks stay ON (table order may matter).");
  }

  const stream = fs.createReadStream(FILE).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let curTable = null;
  let buffer = [];
  const BATCH = 500;
  const restored = {};
  let truncated = new Set();

  async function flush() {
    if (curTable && buffer.length) {
      restored[curTable] = (restored[curTable] || 0) + (await insertBatch(c, curTable, buffer));
      buffer = [];
    }
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.__meta__) {
      console.log(`Restoring ${obj.__meta__.tables.length} tables from snapshot ${obj.__meta__.createdAt}`);
      continue;
    }
    if (obj.__table__) {
      await flush();
      curTable = obj.__table__;
      if (TRUNCATE && !truncated.has(curTable)) {
        await c.query(`TRUNCATE "pbn"."${curTable}" CASCADE`).catch((e) =>
          console.warn(`  truncate ${curTable} skipped: ${e.message}`),
        );
        truncated.add(curTable);
      }
      console.log(`  -> ${curTable} (${obj.__count__} rows)`);
      continue;
    }
    // data row
    buffer.push(obj);
    if (buffer.length >= BATCH) await flush();
  }
  await flush();

  if (replicaMode) await c.query("SET session_replication_role = DEFAULT").catch(() => {});

  const total = Object.values(restored).reduce((a, b) => a + b, 0);
  console.log(`\nRESTORE_OK tables=${Object.keys(restored).length} rows=${total} target=${TARGET_URL.replace(/:[^:@/]+@/, ":***@")}`);
  await c.end();
}

main().catch((e) => { console.error("RESTORE_FAIL", e?.message || e); process.exit(1); });
