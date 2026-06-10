// RDP-side health recovery sweep.
//
// THE PROBLEM this fixes: domain health-check runs on Railway (US-East), whose
// egress can't reliably reach Indonesian VPS (biznet / idcloudhost / rumahweb)
// nor sometimes https on bare OLS origins. So Railway HC mass-marks live domains
// dead. We confirmed 15/15 sampled "dead" domains return 200 on http://.
//
// This sweep runs from the RDP (residential ISP, reaches Indo VPS) and probes
// each deployed-but-dead domain. Key difference vs local-probe-dead.mjs: it
// tries https:// then FALLS BACK to http:// — OLS origins listen on :80 and the
// proxy path here can't always negotiate TLS to them, so http is the reliable
// alive signal. If EITHER scheme answers 2xx/3xx, the domain is alive.
//
// Default: --dry-run. Pass --apply to write back isAlive=true.
//   node scripts/local-probe-recover.mjs --apply
//   node scripts/local-probe-recover.mjs --dry-run --limit=20

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const DRY = !process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

const CONCURRENCY = 24;
const TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 PBN-HealthProbe/1.0";

async function probeScheme(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    const ms = Date.now() - t0;
    const ok = res.status >= 200 && res.status < 400;
    return { ok, httpStatus: res.status, ms, reason: ok ? null : `http_${res.status}` };
  } catch (err) {
    const code = err?.cause?.code || err?.code || "";
    const ms = Date.now() - t0;
    let reason = "unknown";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") reason = "dns";
    else if (code === "ECONNREFUSED") reason = "refused";
    else if (String(code).includes("CERT")) reason = "ssl";
    else if (code === "UND_ERR_CONNECT_TIMEOUT" || err?.name === "TimeoutError") reason = "timeout";
    return { ok: false, httpStatus: 0, ms, reason, code };
  }
}

async function probeOne(rawUrl) {
  // Normalise: try the url as-stored (usually https://) then the http:// variant.
  const bare = rawUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const httpsUrl = `https://${bare}`;
  const httpUrl = `http://${bare}`;

  const a = await probeScheme(httpsUrl);
  if (a.ok) return { ...a, scheme: "https" };

  // Fall back to http:// when https failed on a network/TLS reason (not a real 4xx/5xx).
  if (!a.ok && (a.reason === "ssl" || a.reason === "timeout" || a.reason === "refused" || a.reason === "dns" || a.reason === "unknown")) {
    const b = await probeScheme(httpUrl);
    if (b.ok) return { ...b, scheme: "http" };
    // Prefer the more-informative of the two failures (a real http_4xx/5xx beats a network error).
    const pick = /^http_/.test(b.reason) ? b : a;
    return { ...pick, scheme: "both_failed" };
  }
  return { ...a, scheme: "https" };
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

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Deployed-but-dead, on a live (non-archived) server, not write-off, not adult.
  const targets = await c.query(
    `SELECT d.id, d.url
     FROM "pbn"."Domain" d
     LEFT JOIN "pbn"."Server" s ON s.id = d."serverId"
     WHERE d."isAlive" = false
       AND d."isAdult" = false
       AND d."writeOff" = false
       AND d."lastDeployed" IS NOT NULL
       AND (s.status IS NULL OR s.status NOT IN ('archived'))
     ORDER BY d."lastDeployed" DESC`,
  );
  const all = LIMIT === Infinity ? targets.rows : targets.rows.slice(0, LIMIT);
  console.log(`Probing ${all.length} of ${targets.rows.length} deployed-but-dead domains.`);
  console.log(`Mode: ${DRY ? "DRY-RUN" : "APPLY"}, concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS}ms, https→http fallback.\n`);

  const startT = Date.now();
  let completed = 0;
  const results = await promisePool(all, CONCURRENCY, async (d) => {
    const r = await probeOne(d.url);
    completed++;
    if (completed % 50 === 0) console.log(`  ${completed}/${all.length} probed (${Math.round((completed / all.length) * 100)}%)`);
    return { ...d, ...r };
  });
  const elapsed = ((Date.now() - startT) / 1000).toFixed(1);
  console.log(`\nProbe pass done in ${elapsed}s.\n`);

  const summary = { alive_https: 0, alive_http: 0, http_4xx: 0, http_5xx: 0, dns: 0, refused: 0, ssl: 0, timeout: 0, unknown: 0 };
  for (const r of results) {
    if (r.ok && r.scheme === "https") summary.alive_https++;
    else if (r.ok && r.scheme === "http") summary.alive_http++;
    else if (/^http_4/.test(r.reason)) summary.http_4xx++;
    else if (/^http_5/.test(r.reason)) summary.http_5xx++;
    else summary[r.reason] = (summary[r.reason] || 0) + 1;
  }
  const aliveTotal = summary.alive_https + summary.alive_http;
  console.log("Probe outcome:");
  for (const [k, v] of Object.entries(summary)) if (v > 0) console.log(`  ${k.padEnd(12)} ${v}`);
  console.log(`  ${"ALIVE total".padEnd(12)} ${aliveTotal} / ${all.length} (${((aliveTotal / all.length) * 100).toFixed(1)}%)`);

  if (DRY) { console.log("\n[DRY] Nothing written. Re-run with --apply to recover alive ones."); await c.end(); return; }

  const BATCH = 100;
  let recovered = 0;
  for (let i = 0; i < results.length; i += BATCH) {
    const slice = results.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const r of slice) {
        if (r.ok) {
          await c.query(
            `UPDATE "pbn"."Domain" SET
               "isAlive" = true, "httpStatus" = $1, "lastChecked" = NOW(),
               "firstFailureAt" = NULL, "lastWafBlock" = NULL, "avgResponseMs" = $2
             WHERE id = $3`,
            [r.httpStatus, r.ms, r.id],
          );
          recovered++;
        } else {
          // Stay dead but record the TRUE httpStatus so the diagnose UI is useful.
          await c.query(
            `UPDATE "pbn"."Domain" SET "httpStatus" = $1, "lastChecked" = NOW(), "avgResponseMs" = $2 WHERE id = $3`,
            [r.httpStatus, r.ms, r.id],
          );
        }
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("batch rollback:", e.message);
      throw e;
    }
  }

  const stats = await c.query(
    `SELECT
       COUNT(*) FILTER (WHERE d."isAlive" = true)::int AS alive,
       COUNT(*) FILTER (WHERE d."isAlive" = false)::int AS dead,
       COUNT(*)::int AS total
     FROM "pbn"."Domain" d LEFT JOIN "pbn"."Server" s ON s.id = d."serverId"
     WHERE d."isAdult" = false AND d."writeOff" = false AND (s.status IS NULL OR s.status NOT IN ('archived'))`,
  );
  const { alive, dead, total } = stats.rows[0];
  console.log(`\nDONE. Recovered ${recovered} domains → alive.`);
  console.log(`New inventory: ${alive} alive / ${dead} dead / ${total} active = ${((alive / total) * 100).toFixed(1)}% alive.`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
