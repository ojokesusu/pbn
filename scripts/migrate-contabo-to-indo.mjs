// Contabo -> Indonesian VPS migration push.
//
// Sandi 2026-06-05: Contabo-02 + Contabo-03 hold ~920 dormant domains
// (deployed=15, rest never went live). Indonesian VPS have 521 open slots
// after the cap bump 20 -> 30. This script:
//   1. Picks Contabo-02/03 domain NOT yet in the queue, NOT adult.
//   2. Random-shuffle + take min(slots, candidates).
//   3. Round-robin assigns to Indo VPS proportional to their available slots
//      (fresh rumahweb-0X first, then biznet/idch with smaller leftovers).
//   4. Pacing: 3 per target server per day (anti-spam), 93/day global
//      (= 3/IP * 31 active servers). Start NOW, stagger over ~6 days.
//   5. Inserts DeployQueueItem with status='queued', scheduledAt set.
//   6. Does NOT mutate Domain.serverId — the deploy daemon flips that
//      on successful deploy.

import "dotenv/config";
import pg from "pg";
import crypto from "crypto";

const { Client } = pg;

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_BATCH = 521; // hard cap matches reported slot total

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Candidate domains: Contabo-02 + Contabo-03, non-adult, NOT already queued.
  const candidatesRes = await client.query(`
    SELECT d.id, d.url
    FROM "pbn"."Domain" d
    JOIN "pbn"."Server" s ON s.id = d."serverId"
    WHERE s.label IN ('Contabo-02','Contabo-03')
      AND d."isAdult" = false
      AND NOT EXISTS (SELECT 1 FROM "pbn"."DeployQueueItem" q WHERE q."domainId" = d.id)
    ORDER BY random()
    LIMIT $1
  `, [MAX_BATCH * 2]);

  // 2. Indo VPS targets with available slots.
  const targetsRes = await client.query(`
    SELECT s.id, s.label, s."domainCap",
      (SELECT COUNT(*) FROM "pbn"."Domain" WHERE "serverId"=s.id AND "isAdult"=false)::int AS current
    FROM "pbn"."Server" s
    WHERE LOWER(s.label) NOT LIKE '%contabo%'
      AND LOWER(s.provider) NOT LIKE '%contabo%'
      AND s.status='active'
      AND s.stack NOT IN ('','unmanaged')
    ORDER BY s.label
  `);
  const targets = targetsRes.rows
    .map(r => ({ id: r.id, label: r.label, slots: Math.max(0, r.domainCap - r.current) }))
    .filter(t => t.slots > 0);

  const totalSlots = targets.reduce((s, t) => s + t.slots, 0);
  const candidates = candidatesRes.rows;
  const takeCount = Math.min(candidates.length, totalSlots, MAX_BATCH);

  console.log(`Candidates available (Contabo-02/03, non-adult, not queued): ${candidates.length}`);
  console.log(`Total Indo slots available: ${totalSlots} across ${targets.length} servers`);
  console.log(`Will queue: ${takeCount}\n`);

  // 3. Round-robin assign. Walk targets in slot-DESC order so empty rumahweb
  //    gets filled first; falls through to the smaller-slot servers naturally.
  const sorted = [...targets].sort((a, b) => b.slots - a.slots);
  const assignments = [];
  for (let i = 0; i < takeCount; i++) {
    // Find next target with remaining slots
    const tIdx = i % sorted.length;
    let placedIdx = tIdx;
    for (let k = 0; k < sorted.length; k++) {
      const cand = (tIdx + k) % sorted.length;
      if (sorted[cand].slots > 0) {
        placedIdx = cand;
        break;
      }
    }
    if (sorted[placedIdx].slots <= 0) break; // safety — shouldn't hit if math holds
    assignments.push({ domain: candidates[i], target: sorted[placedIdx] });
    sorted[placedIdx].slots -= 1;
  }

  // 4. Pacing: 3 per target server per day, max 93 per day global, start NOW.
  //    For each assignment compute scheduledAt:
  //      bucket the assignments per server, allocate 3 per day in chronological order.
  const byServer = {};
  for (const a of assignments) {
    const k = a.target.id;
    if (!byServer[k]) byServer[k] = [];
    byServer[k].push(a);
  }

  const SCHEDULE_HOUR_START = 6;   // 06:00 UTC
  const SCHEDULE_HOUR_END = 22;    // 22:00 UTC (16h window)
  const PER_SERVER_PER_DAY = 3;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Day stagger: bucket each server's assignments into daily groups of 3.
  for (const serverId of Object.keys(byServer)) {
    const items = byServer[serverId];
    items.forEach((a, idx) => {
      const dayOffset = Math.floor(idx / PER_SERVER_PER_DAY);
      const day = new Date(todayUtc);
      day.setUTCDate(day.getUTCDate() + dayOffset);
      const hourRange = SCHEDULE_HOUR_END - SCHEDULE_HOUR_START;
      const hour = SCHEDULE_HOUR_START + Math.floor(Math.random() * hourRange);
      const minute = Math.floor(Math.random() * 60);
      day.setUTCHours(hour, minute, 0, 0);
      // Skew newly-scheduled times so the first day starts a bit in the
      // future (avoid the daemon grabbing everything in the next minute).
      if (dayOffset === 0 && day < now) {
        day.setTime(now.getTime() + 5 * 60 * 1000 + Math.random() * 15 * 60 * 1000);
      }
      a.scheduledAt = day;
    });
  }

  // 5. Preview
  const distLog = sorted
    .map(t => {
      const cnt = (byServer[t.id] || []).length;
      return cnt > 0 ? `  ${t.label.padEnd(28)} ${cnt} assigned` : null;
    })
    .filter(Boolean)
    .join("\n");
  console.log("Distribution:\n" + distLog);

  const earliest = Math.min(...assignments.map(a => a.scheduledAt.getTime()));
  const latest = Math.max(...assignments.map(a => a.scheduledAt.getTime()));
  console.log(`\nScheduledAt range: ${new Date(earliest).toISOString()} -> ${new Date(latest).toISOString()}`);
  console.log(`Span: ${((latest - earliest) / (24 * 60 * 60 * 1000)).toFixed(1)} days`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Nothing inserted. Pass without --dry-run to execute.");
    await client.end();
    return;
  }

  // 6. Insert DeployQueueItem in a transaction.
  await client.query("BEGIN");
  try {
    let inserted = 0;
    for (const a of assignments) {
      const id = `dq_${crypto.randomBytes(8).toString("hex")}`;
      await client.query(
        `INSERT INTO "pbn"."DeployQueueItem"
           ("id","domainId","serverId","priority","status","scheduledAt","createdAt","errorMessage")
         VALUES ($1, $2, $3, 0, 'queued', $4, NOW(), '')
         ON CONFLICT ("domainId") DO NOTHING`,
        [id, a.domain.id, a.target.id, a.scheduledAt],
      );
      inserted += 1;
      if (inserted % 100 === 0) console.log(`  inserted ${inserted}/${assignments.length}`);
    }
    await client.query("COMMIT");
    console.log(`\nDONE. Inserted ${inserted} DeployQueueItem rows.`);

    // Post-snapshot
    const snap = await client.query(`SELECT status, COUNT(*)::int AS c FROM "pbn"."DeployQueueItem" GROUP BY status ORDER BY c DESC`);
    console.log("\nPost-insert queue snapshot:");
    for (const r of snap.rows) console.log(`  ${r.status.padEnd(18)} ${r.c}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("FAILED — rolled back:", e.message);
    throw e;
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
