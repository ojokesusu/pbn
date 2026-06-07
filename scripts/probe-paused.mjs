import "dotenv/config";
import pg from "pg";
const { Client } = pg;
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Probe paused queue items — see which ones respond now
const r = await c.query(`
  SELECT d.id, d.url, q.id AS qid, SUBSTRING(q."errorMessage", 1, 60) AS reason
  FROM "pbn"."DeployQueueItem" q JOIN "pbn"."Domain" d ON d.id = q."domainId"
  WHERE q.status = 'paused' AND d."isAdult" = false`);
console.log(`Paused queue items to probe: ${r.rows.length}\n`);

let cursor = 0;
const alive = [];
let completed = 0;
await Promise.all(Array.from({ length: 20 }, async () => {
  while (true) {
    const i = cursor++;
    if (i >= r.rows.length) return;
    const d = r.rows[i];
    try {
      const res = await fetch(d.url, {
        method: "GET", signal: AbortSignal.timeout(10000), redirect: "follow",
        headers: { "User-Agent": "PBN-Probe/1.0" },
      });
      if (res.status >= 200 && res.status < 400) alive.push({ ...d, http: res.status });
    } catch {}
    completed++;
  }
}));

console.log(`Responded alive: ${alive.length} / ${r.rows.length}\n`);
console.log("Distribution by reason:");
const byReason = {};
for (const d of r.rows) {
  const k = d.reason || "(no reason)";
  byReason[k] = byReason[k] || { total: 0, alive: 0 };
  byReason[k].total++;
  if (alive.find(a => a.id === d.id)) byReason[k].alive++;
}
for (const [k, v] of Object.entries(byReason)) console.log(`  ${v.alive}/${v.total}  ${k}`);

// Auto-resume + flip alive
if (alive.length > 0) {
  console.log(`\nFlipping ${alive.length} alive + resuming queue items...`);
  await c.query("BEGIN");
  try {
    for (const d of alive) {
      await c.query(`UPDATE "pbn"."Domain" SET "isAlive"=true, "httpStatus"=$1, "lastChecked"=NOW(), "firstFailureAt"=NULL WHERE id=$2`, [d.http, d.id]);
      await c.query(`UPDATE "pbn"."DeployQueueItem" SET status='queued', "errorMessage"='', "attemptedAt"=NULL WHERE id=$1`, [d.qid]);
    }
    await c.query("COMMIT");
    console.log("Done.");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
}

const stats = await c.query(`SELECT COUNT(*) FILTER (WHERE "isAlive"=true)::int AS alive, COUNT(*)::int AS total FROM "pbn"."Domain" WHERE "isAdult"=false`);
console.log(`\nNew alive: ${stats.rows[0].alive} / ${stats.rows[0].total} = ${((stats.rows[0].alive/stats.rows[0].total)*100).toFixed(1)}%`);
await c.end();
