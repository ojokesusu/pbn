// DNS-confirmed NXDOMAIN write-off sweep.
//
// The dead pool is polluted by domains whose registrar/DNS expired — they have
// no A record at all, so they can never serve until re-registered. A 12/12
// sample of Contabo deployed-dead were all NXDOMAIN. These should be writeOff
// (a reversible flag, NOT a delete) so the dashboard "dead" count reflects
// fixable problems, not dead registrations.
//
// CONSERVATIVE BY DESIGN:
//   - Only writes off on a CONFIRMED no-A-record answer (NXDOMAIN / NODATA),
//     and only after 2 attempts across two resolvers (8.8.8.8 then 1.1.1.1).
//   - Any transient/uncertain DNS error (SERVFAIL, timeout, ESERVFAIL) is left
//     ALONE — never written off on doubt.
//   - Domains that resolve to an IP are never touched (they may be reachable).
//
// Earlier custom dns.resolve scripts mis-fired with UDP/53 quirks; we use an
// explicit Resolver with setServers + a second-resolver retry, which matched
// nslookup ground truth in testing.
//
// Default: --dry-run. Pass --apply to write back.
//   node scripts/writeoff-nxdomain.mjs --dry-run
//   node scripts/writeoff-nxdomain.mjs --apply

import "dotenv/config";
import pg from "pg";
import { Resolver } from "node:dns/promises";
const { Client } = pg;

const DRY = !process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

const CONCURRENCY = 20;
const QUERY_TIMEOUT_MS = 5000;

function makeResolver(server) {
  const r = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 2 });
  r.setServers([server]);
  return r;
}
const resolverA = makeResolver("8.8.8.8");
const resolverB = makeResolver("1.1.1.1");

// Returns one of: "resolves" | "nxdomain" | "uncertain"
async function classifyDns(host) {
  // NXDOMAIN/NODATA codes mean "no A record exists". Everything else (SERVFAIL,
  // TIMEOUT, REFUSED, connection issues) is uncertain — we do NOT write those off.
  const NO_RECORD = new Set(["ENOTFOUND", "ENODATA"]);

  async function tryResolve(resolver) {
    try {
      const addrs = await resolver.resolve4(host);
      if (addrs && addrs.length) return "resolves";
      return "nxdomain"; // empty answer = NODATA
    } catch (err) {
      const code = err?.code || "";
      if (NO_RECORD.has(code)) return "nxdomain";
      return "uncertain";
    }
  }

  // First resolver
  const a = await tryResolve(resolverA);
  if (a === "resolves") return "resolves";
  // Confirm with second resolver before committing to nxdomain.
  const b = await tryResolve(resolverB);
  if (b === "resolves") return "resolves";
  if (a === "nxdomain" && b === "nxdomain") return "nxdomain";
  return "uncertain";
}

async function promisePool(items, concurrency, worker) {
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

function hostOf(url) {
  return (url || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Whole dead pool: not alive, not already written off, not adult, not on an
  // archived server. Covers both deployed-dead AND never-deployed-dead.
  const targets = await c.query(
    `SELECT d.id, d.url
     FROM "pbn"."Domain" d
     LEFT JOIN "pbn"."Server" s ON s.id = d."serverId"
     WHERE d."isAlive" = false
       AND d."writeOff" = false
       AND d."isAdult" = false
       AND (s.status IS NULL OR s.status NOT IN ('archived'))
     ORDER BY d.id`,
  );
  const all = LIMIT === Infinity ? targets.rows : targets.rows.slice(0, LIMIT);
  console.log(`DNS-classifying ${all.length} of ${targets.rows.length} dead domains.`);
  console.log(`Mode: ${DRY ? "DRY-RUN" : "APPLY"}, concurrency ${CONCURRENCY}, resolvers 8.8.8.8→1.1.1.1, 2 tries each.\n`);

  let done = 0;
  const results = await promisePool(all, CONCURRENCY, async (d) => {
    const verdict = await classifyDns(hostOf(d.url));
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${all.length} classified (${Math.round((done / all.length) * 100)}%)`);
    return { ...d, verdict };
  });

  const summary = { resolves: 0, nxdomain: 0, uncertain: 0 };
  for (const r of results) summary[r.verdict]++;
  console.log("\nDNS verdict:");
  console.log(`  resolves   ${summary.resolves}  (keep — may be reachable / deploy candidate)`);
  console.log(`  nxdomain   ${summary.nxdomain}  (write-off candidate — no A record)`);
  console.log(`  uncertain  ${summary.uncertain}  (left alone — transient DNS error)`);

  const toWriteoff = results.filter((r) => r.verdict === "nxdomain");

  if (DRY) {
    console.log(`\n[DRY] Would write off ${toWriteoff.length} confirmed-NXDOMAIN domains. Re-run with --apply.`);
    toWriteoff.slice(0, 12).forEach((r) => console.log(`    - ${hostOf(r.url)}`));
    if (toWriteoff.length > 12) console.log(`    ... +${toWriteoff.length - 12} more`);
    await c.end();
    return;
  }

  const BATCH = 100;
  let written = 0;
  for (let i = 0; i < toWriteoff.length; i += BATCH) {
    const slice = toWriteoff.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const r of slice) {
        await c.query(
          `UPDATE "pbn"."Domain" SET "writeOff" = true, "lastChecked" = NOW() WHERE id = $1`,
          [r.id],
        );
        written++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("batch rollback:", e.message);
      throw e;
    }
  }
  console.log(`\nDONE. Wrote off ${written} confirmed-NXDOMAIN domains.`);

  const stats = await c.query(
    `SELECT
       COUNT(*) FILTER (WHERE d."isAlive" = true)::int AS alive,
       COUNT(*) FILTER (WHERE d."isAlive" = false AND d."writeOff" = false)::int AS dead,
       COUNT(*) FILTER (WHERE d."writeOff" = true)::int AS writeoff,
       COUNT(*)::int AS active_total
     FROM "pbn"."Domain" d LEFT JOIN "pbn"."Server" s ON s.id = d."serverId"
     WHERE d."isAdult" = false AND d."writeOff" = false AND (s.status IS NULL OR s.status NOT IN ('archived'))`,
  );
  const { alive, dead, active_total } = stats.rows[0];
  console.log(`New active inventory: ${alive} alive / ${dead} dead / ${active_total} total = ${((alive / active_total) * 100).toFixed(1)}% alive.`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
