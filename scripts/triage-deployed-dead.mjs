// Triage the 158 deployed-dead pool: domains marked dead (isAlive=false) that
// have been deployed >7 days ago. Railway probe egress is unreliable to Indo
// VPS, so we re-probe from THIS machine (RDP, Indonesian residential ISP) which
// is much closer to ground truth, then classify and emit suggested actions.
//
// Classifications:
//   alive_now   → HTTP 200..399  → flip isAlive=true (Railway false-negative)
//   dns_dead    → ENOTFOUND      → writeOff (NXDOMAIN, no recovery)
//   refused     → ECONNREFUSED   → re-queue (server issue)
//   timeout     → AbortTimeout   → re-queue (server issue)
//   http_5xx    → 5xx response   → re-queue (server issue)
//   ssl_err     → cert problem   → flag for cert renewal
//   http_4xx    → 4xx response   → manual review (WAF/content gap)
//   unknown     → other          → manual review
//
// Default: DRY (no writes). Pass --apply to actually execute suggested actions.
// CSV always written to scripts/.archive/triage-deployed-dead-<isoTs>.csv.
//
// Concurrency 20, per-request timeout 12s, redirect follow, UA PBN-Triage/1.0.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const { Client } = pg;

const APPLY = process.argv.includes("--apply");
const CONCURRENCY = 20;
const TIMEOUT_MS = 12_000;
const UA = "PBN-Triage/1.0";

function classify(res, err) {
  if (res) {
    if (res.status >= 200 && res.status < 400) return { c: "alive_now", status: res.status };
    if (res.status >= 400 && res.status < 500) return { c: "http_4xx", status: res.status };
    if (res.status >= 500 && res.status < 600) return { c: "http_5xx", status: res.status };
    return { c: "unknown", status: res.status };
  }
  const code = err?.cause?.code || err?.code || "";
  const name = err?.name || "";
  const msg = (err?.message || "") + " " + (err?.cause?.message || "");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { c: "dns_dead", status: 0 };
  if (code === "ECONNREFUSED") return { c: "refused", status: 0 };
  if (name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") return { c: "timeout", status: 0 };
  if (code.includes("CERT") || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "ERR_TLS_CERT_ALTNAME_INVALID" || /certificate|ssl|tls/i.test(msg)) return { c: "ssl_err", status: 0 };
  return { c: "unknown", status: 0 };
}

const ACTION_BY_CLASS = {
  alive_now: "flip_alive",
  dns_dead: "write_off",
  refused: "re_queue",
  timeout: "re_queue",
  http_5xx: "re_queue",
  ssl_err: "flag_cert_renewal",
  http_4xx: "manual_review",
  unknown: "manual_review",
};

async function probeOne(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    const ms = Date.now() - t0;
    const { c, status } = classify(res, null);
    return { classification: c, httpStatus: status, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    const { c, status } = classify(null, err);
    return { classification: c, httpStatus: status, ms };
  }
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

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const q = await c.query(
    `SELECT id, url, "serverId", "lastDeployed", "lastChecked", "httpStatus"
     FROM "pbn"."Domain"
     WHERE "isAlive" = false
       AND "isAdult" = false
       AND "lastDeployed" IS NOT NULL
       AND "lastDeployed" < NOW() - INTERVAL '7 days'
     ORDER BY "lastDeployed" DESC`,
  );
  const all = q.rows;
  console.log(`Triaging ${all.length} deployed-dead (>7d) domains.`);
  console.log(`Concurrency: ${CONCURRENCY}, timeout: ${TIMEOUT_MS}ms, apply: ${APPLY}.\n`);

  const startT = Date.now();
  let completed = 0;
  const results = await promisePool(all, CONCURRENCY, async (d) => {
    const r = await probeOne(d.url);
    completed++;
    if (completed % 25 === 0 || completed === all.length) {
      console.log(`  ${completed}/${all.length} probed (${Math.round((completed / all.length) * 100)}%)`);
    }
    return { ...d, ...r, suggestedAction: ACTION_BY_CLASS[r.classification] || "manual_review" };
  });
  const elapsed = ((Date.now() - startT) / 1000).toFixed(1);
  console.log(`\nProbe pass done in ${elapsed}s.\n`);

  // Summary counts
  const summary = {};
  for (const r of results) summary[r.classification] = (summary[r.classification] || 0) + 1;
  console.log("Classification summary:");
  for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }

  const actionSummary = {};
  for (const r of results) actionSummary[r.suggestedAction] = (actionSummary[r.suggestedAction] || 0) + 1;
  console.log("\nSuggested action summary:");
  for (const [k, v] of Object.entries(actionSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  // Write CSV
  const isoTs = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveDir = path.join(process.cwd(), "scripts", ".archive");
  fs.mkdirSync(archiveDir, { recursive: true });
  const csvPath = path.join(archiveDir, `triage-deployed-dead-${isoTs}.csv`);
  const header = "domain_id,url,classification,http_status,server_id,last_deployed,suggested_action\n";
  const lines = results.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.url),
      csvEscape(r.classification),
      csvEscape(r.httpStatus),
      csvEscape(r.serverId),
      csvEscape(r.lastDeployed ? new Date(r.lastDeployed).toISOString() : ""),
      csvEscape(r.suggestedAction),
    ].join(","),
  );
  fs.writeFileSync(csvPath, header + lines.join("\n") + "\n");
  console.log(`\nCSV written: ${csvPath}`);

  if (!APPLY) {
    console.log("\n[DRY] No DB writes. Re-run with --apply to execute suggested actions.");
    await c.end();
    return;
  }

  // Apply suggested actions
  console.log("\n[APPLY] Executing suggested actions...");
  const BATCH = 100;
  let written = 0;
  const actionCounts = { flip_alive: 0, write_off: 0, re_queue: 0, flag_cert_renewal: 0, manual_review: 0 };

  for (let i = 0; i < results.length; i += BATCH) {
    const slice = results.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const r of slice) {
        const action = r.suggestedAction;
        if (action === "flip_alive") {
          await c.query(
            `UPDATE "pbn"."Domain" SET
               "isAlive" = true, "httpStatus" = $1, "lastChecked" = NOW(),
               "firstFailureAt" = NULL, "lastWafBlock" = NULL,
               "avgResponseMs" = $2
             WHERE id = $3`,
            [r.httpStatus, r.ms, r.id],
          );
        } else if (action === "write_off") {
          await c.query(
            `UPDATE "pbn"."Domain" SET
               "isAlive" = false, "httpStatus" = $1, "lastChecked" = NOW(),
               "writeOff" = true
             WHERE id = $2`,
            [r.httpStatus, r.id],
          );
        } else if (action === "re_queue") {
          await c.query(
            `UPDATE "pbn"."Domain" SET
               "httpStatus" = $1, "lastChecked" = NOW()
             WHERE id = $2`,
            [r.httpStatus, r.id],
          );
        } else if (action === "flag_cert_renewal" || action === "manual_review") {
          // No dedicated needsCertRenewal/needsManualReview column in schema —
          // just record the real httpStatus + lastChecked so the operator can
          // filter on httpStatus in the dashboard.
          await c.query(
            `UPDATE "pbn"."Domain" SET
               "httpStatus" = $1, "lastChecked" = NOW()
             WHERE id = $2`,
            [r.httpStatus, r.id],
          );
        }
        actionCounts[action] = (actionCounts[action] || 0) + 1;
        written++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      console.error(`batch rollback at ${i}:`, e.message);
      throw e;
    }
    console.log(`  applied ${written}/${results.length}`);
  }

  console.log("\nApplied action counts:");
  for (const [k, v] of Object.entries(actionCounts)) if (v > 0) console.log(`  ${k.padEnd(20)} ${v}`);

  await c.end();
  console.log("\nDONE.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
