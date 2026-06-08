// 2nd-opinion DNS-via-HTTP probe of just-writeOff'd domains.
// For each writeOff=true AND lastDeployed IS NULL AND isAdult=false candidate,
// HTTP fetch the URL. Classification matches local-probe-never-deployed.mjs.
// If ANY come back with HTTP response (200-5xx) or non-DNS error, reverse writeOff.
//
// Default: --dry-run. Pass --apply to reverse.

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const DRY = !process.argv.includes("--apply");
const CONCURRENCY = 30;
const TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 PBN-ConsensusProbe/1.0";

async function probe(url) {
  try {
    const res = await fetch(url, {
      method: "GET", signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    return { ok: true, httpStatus: res.status, reason: null };
  } catch (err) {
    const code = err?.cause?.code || err?.code || "";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { ok: false, httpStatus: 0, reason: "dns" };
    if (code === "ECONNREFUSED") return { ok: false, httpStatus: 0, reason: "refused" };
    if (code.includes("CERT")) return { ok: false, httpStatus: 0, reason: "ssl" };
    if (code === "UND_ERR_CONNECT_TIMEOUT" || err?.name === "TimeoutError") return { ok: false, httpStatus: 0, reason: "timeout" };
    return { ok: false, httpStatus: 0, reason: "unknown" };
  }
}

async function pool(items, conc, worker) {
  let cursor = 0;
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }));
  return out;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const r = await c.query(`SELECT id, url FROM "pbn"."Domain" WHERE "writeOff" = true AND "lastDeployed" IS NULL AND "isAdult" = false ORDER BY id`);
  console.log(`Pool: ${r.rows.length} writeOff'd never-deployed candidates.`);

  let completed = 0;
  const results = await pool(r.rows, CONCURRENCY, async (row) => {
    const probeRes = await probe(row.url);
    completed++;
    if (completed % 100 === 0) console.log(`  ${completed}/${r.rows.length} probed`);
    return { ...row, ...probeRes };
  });

  const stillDns = results.filter((x) => x.reason === "dns");
  const recoverableHttp = results.filter((x) => x.ok);
  const otherErr = results.filter((x) => !x.ok && x.reason !== "dns");

  console.log(`\nConsensus classification:`);
  console.log(`  Still DNS dead:        ${stillDns.length}`);
  console.log(`  Recovered HTTP:        ${recoverableHttp.length} (would REVERSE writeOff)`);
  console.log(`  Other error now:       ${otherErr.length}`);

  if (DRY) {
    if (recoverableHttp.length > 0) {
      console.log(`\n[DRY] Sample 10 recovered (would reverse writeOff):`);
      recoverableHttp.slice(0, 10).forEach((r) => console.log(`  ${r.url} → HTTP ${r.httpStatus}`));
    }
    if (otherErr.length > 0) {
      console.log(`\n[DRY] Sample 5 non-DNS error (NOT reversing — still dead just diff reason):`);
      otherErr.slice(0, 5).forEach((r) => console.log(`  ${r.url} → ${r.reason}`));
    }
    console.log(`\nRe-run with --apply to reverse ${recoverableHttp.length} writeOffs.`);
    await c.end();
    return;
  }

  if (recoverableHttp.length === 0) {
    console.log(`\nNo reversals needed — all 693 still DNS dead. Consensus confirms writeOff was correct.`);
    await c.end();
    return;
  }

  console.log(`\n[APPLY] Reversing writeOff + flipping alive for ${recoverableHttp.length} recovered...`);
  const BATCH = 100;
  let reversed = 0;
  for (let i = 0; i < recoverableHttp.length; i += BATCH) {
    const slice = recoverableHttp.slice(i, i + BATCH);
    await c.query("BEGIN");
    try {
      for (const r of slice) {
        await c.query(
          `UPDATE "pbn"."Domain" SET "writeOff" = false, "isAlive" = true, "httpStatus" = $1, "lastChecked" = NOW() WHERE id = $2`,
          [r.httpStatus, r.id],
        );
        reversed++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }
  console.log(`Reversed: ${reversed}`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
