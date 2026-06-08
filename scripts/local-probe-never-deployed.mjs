// Same probe logic as local-probe-dead but targets the never-deployed pool.
// Many of these might have live legacy content already (imports, prior WP)
// and would respond 200 to a real probe. If so, they're not "dead" — they
// just never went through our deploy worker yet.

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const DRY = process.argv.includes("--dry-run");
const applyDnsWriteoff = process.argv.includes("--writeoff-dns");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

const CONCURRENCY = 30;
const TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 PBN-HealthProbe/1.0";

async function probeOne(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET", signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow",
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      });
      const ms = Date.now() - t0;
      const ok = res.status >= 200 && res.status < 400;
      return { ok, httpStatus: res.status, ms, reason: ok ? null : `http_${res.status}` };
    } catch (err) {
      const e = err;
      const code = e?.cause?.code || e?.code || "";
      const transient = code === "UND_ERR_SOCKET" || code === "ECONNRESET";
      if (transient && attempt === 0) continue;
      const ms = Date.now() - t0;
      let reason = "unknown";
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") reason = "dns";
      else if (code === "ECONNREFUSED") reason = "refused";
      else if (code.includes("CERT")) reason = "ssl";
      else if (code === "UND_ERR_CONNECT_TIMEOUT" || e?.name === "TimeoutError") reason = "timeout";
      return { ok: false, httpStatus: 0, ms, reason };
    }
  }
  return { ok: false, httpStatus: 0, ms: 0, reason: "unknown" };
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

  const targets = await c.query(
    `SELECT id, url
     FROM "pbn"."Domain"
     WHERE "isAlive" = false AND "isAdult" = false AND "writeOff" = false AND "lastDeployed" IS NULL
     ORDER BY id`,
  );
  const all = LIMIT === Infinity ? targets.rows : targets.rows.slice(0, LIMIT);
  console.log(`Probing ${all.length} of ${targets.rows.length} never-deployed dead.`);
  console.log(`Concurrency: ${CONCURRENCY}, timeout: ${TIMEOUT_MS}ms.\n`);

  const startT = Date.now();
  let completed = 0;
  const results = await promisePool(all, CONCURRENCY, async (d) => {
    const r = await probeOne(d.url);
    completed++;
    if (completed % 100 === 0) console.log(`  ${completed}/${all.length} probed (${Math.round((completed / all.length) * 100)}%)`);
    return { ...d, ...r };
  });
  const elapsed = ((Date.now() - startT) / 1000).toFixed(1);
  console.log(`\nProbe pass done in ${elapsed}s.\n`);

  const summary = { alive: 0, dns: 0, refused: 0, ssl: 0, timeout: 0, unknown: 0, http_4xx: 0, http_5xx: 0 };
  for (const r of results) {
    if (r.ok) summary.alive++;
    else if (/^http_4/.test(r.reason)) summary.http_4xx++;
    else if (/^http_5/.test(r.reason)) summary.http_5xx++;
    else summary[r.reason]++;
  }
  console.log("Outcome:");
  for (const [k, v] of Object.entries(summary)) if (v > 0) console.log(`  ${k.padEnd(10)} ${v}`);

  if (DRY) { console.log("\n[DRY] Nothing written."); await c.end(); return; }

  // Only flip alive — never-deployed domains that respond have legacy live
  // content. Keep the rest as-is (they need daemon deploy).
  const aliveOnes = results.filter((r) => r.ok);
  console.log(`\nFlipping ${aliveOnes.length} responding never-deployed to alive...`);
  const BATCH = 100;
  for (let i = 0; i < aliveOnes.length; i += BATCH) {
    const slice = aliveOnes.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const r of slice) {
        await c.query(
          `UPDATE "pbn"."Domain" SET
             "isAlive" = true, "httpStatus" = $1, "lastChecked" = NOW(),
             "firstFailureAt" = NULL, "lastWafBlock" = NULL, "avgResponseMs" = $2
           WHERE id = $3`,
          [r.httpStatus, r.ms, r.id],
        );
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }

  let dnsWriteOffCount = 0;
  if (applyDnsWriteoff) {
    const dnsDead = results.filter((r) => !r.ok && r.reason === "dns");
    console.log(`\nWriting off ${dnsDead.length} DNS-dead (NXDOMAIN/EAI_AGAIN) never-deployed domains...`);
    for (let i = 0; i < dnsDead.length; i += BATCH) {
      const slice = dnsDead.slice(i, i + BATCH);
      await c.query("BEGIN");
      try {
        for (const r of slice) {
          await c.query(
            `UPDATE "pbn"."Domain" SET "writeOff" = true, "lastChecked" = NOW() WHERE id = $1`,
            [r.id],
          );
          dnsWriteOffCount++;
        }
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
    console.log(`DNS writeOff'd: ${dnsWriteOffCount}`);
  }

  const stats = await c.query(
    `SELECT
       COUNT(*) FILTER (WHERE "isAlive" = true)::int AS alive,
       COUNT(*) FILTER (WHERE "isAlive" = false)::int AS dead,
       COUNT(*)::int AS total
     FROM "pbn"."Domain" WHERE "isAdult" = false AND "writeOff" = false`,
  );
  const { alive, dead, total } = stats.rows[0];
  console.log(`\nDONE. New stats: ${alive} alive / ${dead} dead / ${total} total = ${((alive/total)*100).toFixed(1)}% alive.`);

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
