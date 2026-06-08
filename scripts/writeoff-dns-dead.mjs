// DNS-only probe of undeployed-dead non-writeOff Domain pool.
// For each candidate, do a single dns.resolve() lookup. If it resolves to
// ENOTFOUND / NOTFOUND / no_data, mark Domain.writeOff=true with reason.
// MUCH faster than HTTP probe (no port connect, just DNS roundtrip).
//
// Default: --dry-run. Pass --apply to actually flip writeOff.

import "dotenv/config";
import pg from "pg";
import dns from "node:dns/promises";

const { Client } = pg;
const DRY = !process.argv.includes("--apply");
const CONCURRENCY = 50;
const DNS_TIMEOUT_MS = 5000;

async function resolveOne(domain) {
  // Strip protocol + path if present, keep host only
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  try {
    await Promise.race([
      dns.resolve4(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("dns_timeout")), DNS_TIMEOUT_MS)),
    ]);
    return { host, resolved: true, reason: null };
  } catch (err) {
    const code = err.code || err.message || "unknown";
    const isNxdomain = code === "ENOTFOUND" || code === "NOTFOUND" || code === "ENODATA";
    return { host, resolved: false, reason: code, isNxdomain };
  }
}

async function pool(items, concurrency, worker) {
  let cursor = 0;
  const out = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const candidates = await c.query(`
    SELECT id, url FROM "pbn"."Domain"
    WHERE "isAlive" = false AND "isAdult" = false AND "writeOff" = false
      AND "lastDeployed" IS NULL
    ORDER BY id
  `);
  console.log(`Pool: ${candidates.rows.length} undeployed-dead non-writeOff candidates.`);

  let completed = 0;
  const results = await pool(candidates.rows, CONCURRENCY, async (r) => {
    const dnsResult = await resolveOne(r.url);
    completed++;
    if (completed % 100 === 0) {
      console.log(`  ${completed}/${candidates.rows.length} resolved`);
    }
    return { ...r, ...dnsResult };
  });

  const nxdomain = results.filter((r) => r.isNxdomain);
  const otherDead = results.filter((r) => !r.resolved && !r.isNxdomain);
  const resolved = results.filter((r) => r.resolved);

  console.log(`\nClassification:`);
  console.log(`  NXDOMAIN/NOTFOUND: ${nxdomain.length}`);
  console.log(`  Other DNS error:  ${otherDead.length}`);
  console.log(`  Resolved OK:      ${resolved.length} (DNS works, but Domain.isAlive=false — could be HTTP-level dead)`);

  if (DRY) {
    console.log(`\n[DRY-RUN] No writes. Sample 10 NXDOMAIN candidates:`);
    nxdomain.slice(0, 10).forEach((r) => console.log(`  ${r.url} → ${r.reason}`));
    console.log(`\nRe-run with --apply to writeOff ${nxdomain.length} NXDOMAIN candidates.`);
    await c.end();
    return;
  }

  console.log(`\n[APPLY] WriteOff ${nxdomain.length} NXDOMAIN domains...`);
  const BATCH = 200;
  let written = 0;
  for (let i = 0; i < nxdomain.length; i += BATCH) {
    const slice = nxdomain.slice(i, i + BATCH);
    const ids = slice.map((r) => r.id);
    await c.query(
      `UPDATE "pbn"."Domain" SET "writeOff" = true, "lastChecked" = NOW() WHERE id = ANY($1::text[])`,
      [ids],
    );
    written += slice.length;
    console.log(`  written ${written}/${nxdomain.length}`);
  }

  const stats = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE "isAlive"=true AND "writeOff"=false AND "isAdult"=false)::int AS alive,
      COUNT(*) FILTER (WHERE "writeOff"=true)::int AS write_off,
      COUNT(*) FILTER (WHERE "isAdult"=false)::int AS total_non_adult
    FROM "pbn"."Domain"
  `);
  const { alive, write_off, total_non_adult } = stats.rows[0];
  const active = total_non_adult - write_off;
  console.log(`\nDONE. New stats:`);
  console.log(`  alive=${alive}, writeOff=${write_off}, total_non_adult=${total_non_adult}`);
  console.log(`  Active inventory: ${active}. Alive %: ${((alive/active)*100).toFixed(1)}%`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
