import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

// ----- CLI -----
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const phaseArg = (args.find(a => a.startsWith('--phase=')) || '--phase=both').split('=')[1];
if (!['1', '2', 'both'].includes(phaseArg)) {
  console.error(`bad --phase value: ${phaseArg} (expected 1|2|both)`);
  process.exit(1);
}

const PHASE1_MIN = 50;
const PHASE1_MAX = 150;

const ARCHIVE_HOST = 'legacy.seekahost.archive';
const ARCHIVE_LABEL = 'seekahost-legacy-archive';
const ARCHIVE_PROVIDER = 'seekahost-legacy';
// oversized: plan called out the 500 figure was too tight against 380+109 reality
const ARCHIVE_DOMAIN_CAP = 5000;

const log = (...m) => console.log('[cleanup-seekahost-legacy]', ...m);
const warn = (...m) => console.warn('[cleanup-seekahost-legacy][WARN]', ...m);
const err = (...m) => console.error('[cleanup-seekahost-legacy][ERR]', ...m);

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureArchiveDir() {
  const dir = path.resolve(process.cwd(), 'scripts', '.archive');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeArchive(payload) {
  const dir = ensureArchiveDir();
  const file = path.join(dir, `seekahost-legacy-cleanup-${isoTimestamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  log(`archive snapshot -> ${file}`);
  return file;
}

async function snapshotPhase1(client) {
  // capture FULL Server row + count of dependents for every empty seekahost-legacy
  const sql = `
    SELECT s.*
    FROM pbn."Server" s
    WHERE s.provider = 'seekahost-legacy'
      AND NOT EXISTS (SELECT 1 FROM pbn."Domain" d WHERE d."serverId" = s.id)
  `;
  const { rows } = await client.query(sql);
  return rows;
}

async function snapshotPhase2(client) {
  // dump originals + every dependent row, INCLUDING credentials and original updatedAt.
  // these are the rows we'll permanently destroy — must be fully reconstructible from this file alone.
  const originals = (await client.query(`
    SELECT s.*
    FROM pbn."Server" s
    WHERE s.provider = 'seekahost-legacy'
      AND s.host <> $1
      AND EXISTS (SELECT 1 FROM pbn."Domain" d WHERE d."serverId" = s.id)
  `, [ARCHIVE_HOST])).rows;

  const originalIds = originals.map(r => r.id);
  if (originalIds.length === 0) {
    return { originals, domains: [], deployQueueItems: [], provisionBatches: [], provisionTasks: [], healthChecks: [], stressTestRuns: [] };
  }

  // Full Domain rows — includes the pre-touch updatedAt so we can restore original audit trail.
  const domains = (await client.query(`
    SELECT * FROM pbn."Domain" WHERE "serverId" = ANY($1::text[])
  `, [originalIds])).rows;

  const deployQueueItems = (await client.query(`
    SELECT * FROM pbn."DeployQueueItem" WHERE "serverId" = ANY($1::text[])
  `, [originalIds])).rows;

  const provisionBatches = (await client.query(`
    SELECT * FROM pbn."ProvisionBatch" WHERE "serverId" = ANY($1::text[])
  `, [originalIds])).rows;

  const provisionTasks = (await client.query(`
    SELECT * FROM pbn."ProvisionTask" WHERE "serverId" = ANY($1::text[])
  `, [originalIds])).rows;

  const healthChecks = (await client.query(`
    SELECT * FROM pbn."HealthCheck" WHERE "serverId" = ANY($1::text[])
  `, [originalIds])).rows;

  const stressTestRuns = (await client.query(`
    SELECT * FROM pbn."StressTestRun" WHERE "serverId" = ANY($1::text[])
  `, [originalIds])).rows;

  return { originals, domains, deployQueueItems, provisionBatches, provisionTasks, healthChecks, stressTestRuns };
}

async function runPhase1(client) {
  log('--- PHASE 1: drop empty seekahost-legacy servers ---');

  // SERIALIZABLE — Phase 1 race objection: default READ COMMITTED lets a concurrent
  // INSERT INTO Domain slip between the NOT EXISTS scan and the DELETE. SERIALIZABLE
  // forces serialization failure (40001) if that happens; we surface it instead of silently orphaning.
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

  try {
    const candidates = await snapshotPhase1(client);
    const count = candidates.length;
    log(`candidates (empty legacy servers): ${count}`);

    if (count > PHASE1_MAX || count < PHASE1_MIN) {
      err(`SANITY GUARD TRIPPED — empty_legacy=${count}, expected ${PHASE1_MIN}..${PHASE1_MAX}.`);
      err('Refusing to run Phase 1. Investigate before re-running.');
      await client.query('ROLLBACK');
      process.exit(2);
    }

    writeArchive({ phase: 1, capturedAt: new Date().toISOString(), rowCount: count, servers: candidates });

    if (DRY_RUN) {
      log('DRY-RUN: would DELETE the above empty servers');
      await client.query('ROLLBACK');
      return { phase: 1, deleted: 0, dryRun: true, candidateCount: count };
    }

    // Lock candidates explicitly — belt-and-suspenders on top of SERIALIZABLE.
    await client.query(`
      SELECT s.id FROM pbn."Server" s
      WHERE s.provider = 'seekahost-legacy'
        AND NOT EXISTS (SELECT 1 FROM pbn."Domain" d WHERE d."serverId" = s.id)
      FOR UPDATE
    `);

    const del = await client.query(`
      DELETE FROM pbn."Server" s
      WHERE s.provider = 'seekahost-legacy'
        AND NOT EXISTS (SELECT 1 FROM pbn."Domain" d WHERE d."serverId" = s.id)
    `);

    const remaining = (await client.query(`
      SELECT COUNT(*)::int AS c FROM pbn."Server" WHERE provider = 'seekahost-legacy'
    `)).rows[0].c;

    await client.query('COMMIT');
    log(`Phase 1 deleted=${del.rowCount} remaining_legacy=${remaining}`);
    return { phase: 1, deleted: del.rowCount, remaining };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function runPhase2(client) {
  log('--- PHASE 2: consolidate residual seekahost-legacy into archive ---');

  await client.query('BEGIN');

  try {
    const snapshot = await snapshotPhase2(client);
    const originalsCount = snapshot.originals.length;
    log(`originals to retire: ${originalsCount}`);
    log(`domains attached: ${snapshot.domains.length}`);
    log(`deployQueueItems attached: ${snapshot.deployQueueItems.length}`);
    log(`provisionBatches attached: ${snapshot.provisionBatches.length}`);
    log(`provisionTasks attached: ${snapshot.provisionTasks.length}`);
    log(`healthChecks attached (CASCADE-lost): ${snapshot.healthChecks.length}`);
    log(`stressTestRuns attached (CASCADE-lost): ${snapshot.stressTestRuns.length}`);

    writeArchive({
      phase: 2,
      capturedAt: new Date().toISOString(),
      ...snapshot,
    });

    if (originalsCount === 0) {
      warn('no originals to retire — nothing to do for Phase 2');
      await client.query('ROLLBACK');
      return { phase: 2, retired: 0 };
    }

    // 2.1 archive Server insert.
    // Schema requires NOT NULL: name, username, password. Plus we set status='archived'
    // so app code can SKIP this bucket from health-check / deploy worker logic.
    // Conflict target = id (PK collision is checked BEFORE host unique, so we conflict on id).
    const archiveId = `archive_seekahost_legacy_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}_${crypto.randomBytes(4).toString('hex')}`;

    // Try insert; if id collides, look up by host instead — covers partial-rollback retries.
    let resolvedArchiveId;
    // Schema (prisma/schema.prisma lines 13-40) NOT NULL without default:
    //   name, host, username, password  -> all supplied below.
    // Optional fields explicitly pinned so the archive row is fully deterministic
    // regardless of future Prisma default changes: port, nameserver2.
    // status='archived' is intended as the health-check skip flag but is NOT load-bearing
    // anywhere in the current health pipeline (see WARNING emitted at end of Phase 2).
    const insertSql = `
      INSERT INTO pbn."Server"
        (id, label, name, host, username, password, port, nameserver2, provider, stack, status, region, tier, "domainCap", "createdAt", "updatedAt")
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (host) DO UPDATE SET "updatedAt" = NOW()
      RETURNING id
    `;
    const insertVals = [
      archiveId,
      ARCHIVE_LABEL,
      'seekahost-legacy-archive',  // name (NOT NULL, no default)
      ARCHIVE_HOST,
      'archive',                   // username (NOT NULL, no default) — placeholder; this Server will never deploy
      'archive',                   // password (NOT NULL, no default) — placeholder; this Server will never deploy
      22,                          // port — schema default 21 (FTP); pin to 22 since it's archive, not an FTP target
      '',                          // nameserver2 — empty (schema default)
      ARCHIVE_PROVIDER,
      'archive',                   // stack
      'archived',                  // status — INTENDED skip flag (see health-check warning at end of run)
      'legacy',                    // region
      'archive',                   // tier
      ARCHIVE_DOMAIN_CAP,          // domainCap (5000 — oversized headroom; 380+109 baseline)
    ];

    if (DRY_RUN) {
      log('DRY-RUN: would INSERT archive Server', { archiveId, host: ARCHIVE_HOST });
      resolvedArchiveId = archiveId;
    } else {
      const r = await client.query(insertSql, insertVals);
      resolvedArchiveId = r.rows[0].id;
      log(`archive Server resolved id=${resolvedArchiveId}`);
    }

    const originalIds = snapshot.originals.map(r => r.id);

    if (DRY_RUN) {
      log(`DRY-RUN: would UPDATE Domain.serverId for ${snapshot.domains.length} rows -> ${resolvedArchiveId}`);
      log(`DRY-RUN: would UPDATE DeployQueueItem.serverId (terminal only) for ${snapshot.deployQueueItems.length} candidate rows`);
      log(`DRY-RUN: would UPDATE ProvisionBatch.serverId for ${snapshot.provisionBatches.length} rows`);
      log(`DRY-RUN: would UPDATE ProvisionTask.serverId for ${snapshot.provisionTasks.length} rows`);
      log(`DRY-RUN: would DELETE ${originalsCount} original Server rows`);
      await client.query('ROLLBACK');
      return { phase: 2, dryRun: true, archiveId: resolvedArchiveId, originalsCount };
    }

    // 2.4 Domain re-point.
    // NOTE on objection re: clobbered updatedAt — the snapshot above captured pre-touch
    // updatedAt for every Domain row, so the original audit timestamp is recoverable from the dump.
    const domUpd = await client.query(`
      UPDATE pbn."Domain"
      SET "serverId" = $1, "updatedAt" = NOW()
      WHERE "serverId" = ANY($2::text[])
    `, [resolvedArchiveId, originalIds]);
    log(`Domain re-pointed: ${domUpd.rowCount}`);

    // 2.5 DeployQueueItem — TERMINAL STATES ONLY.
    // Live queue items (queued/running/in-flight) MUST NOT be pointed at the archive host;
    // worker would try to SSH into legacy.seekahost.archive and explode. Let FK SET NULL handle
    // live items so the worker treats them as orphaned and skips/fails them cleanly.
    const dqUpd = await client.query(`
      UPDATE pbn."DeployQueueItem"
      SET "serverId" = $1
      WHERE "serverId" = ANY($2::text[])
        AND status IN ('completed','failed','cancelled')
    `, [resolvedArchiveId, originalIds]);
    log(`DeployQueueItem re-pointed (terminal only): ${dqUpd.rowCount}`);

    // 2.6 ProvisionBatch.
    const pbUpd = await client.query(`
      UPDATE pbn."ProvisionBatch"
      SET "serverId" = $1
      WHERE "serverId" = ANY($2::text[])
    `, [resolvedArchiveId, originalIds]);
    log(`ProvisionBatch re-pointed: ${pbUpd.rowCount}`);

    // 2.7 ProvisionTask.
    // NOTE: ProvisionTask.host / sshUser / sshPassEnc are denormalized snapshots of the original
    // physical host. They INTENTIONALLY remain mismatched against archive Server.host — they're
    // historical evidence of the original deploy target, preserved in the JSON dump.
    const ptUpd = await client.query(`
      UPDATE pbn."ProvisionTask"
      SET "serverId" = $1
      WHERE "serverId" = ANY($2::text[])
    `, [resolvedArchiveId, originalIds]);
    log(`ProvisionTask re-pointed: ${ptUpd.rowCount}`);

    // 2.9 Verify nothing on Domain still points to originals.
    const domLeft = (await client.query(`
      SELECT COUNT(*)::int AS c FROM pbn."Domain" WHERE "serverId" = ANY($1::text[])
    `, [originalIds])).rows[0].c;
    if (domLeft !== 0) {
      throw new Error(`SAFETY ABORT: ${domLeft} Domain rows still reference originals — refusing to DELETE parents`);
    }

    // 2.10 DELETE originals. HealthCheck + StressTestRun CASCADE (acceptable: telemetry tied to physical host identity).
    const del = await client.query(`
      DELETE FROM pbn."Server" WHERE id = ANY($1::text[])
    `, [originalIds]);
    log(`originals deleted: ${del.rowCount}`);

    // 2.11 Final verification.
    const finals = (await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM pbn."Server" WHERE provider = 'seekahost-legacy') AS legacy_servers_after,
        (SELECT COUNT(*)::int FROM pbn."Domain" WHERE "serverId" = $1) AS domains_on_archive
    `, [resolvedArchiveId])).rows[0];

    log(`final: legacy_servers_after=${finals.legacy_servers_after} domains_on_archive=${finals.domains_on_archive}`);
    if (finals.legacy_servers_after !== 1) {
      throw new Error(`SAFETY ABORT: expected exactly 1 seekahost-legacy server remaining (archive), got ${finals.legacy_servers_after}`);
    }

    await client.query('COMMIT');

    // Health-check pipeline audit (2026-06): NONE of the health-check sweeps filter on
    // Server.status. Files inspected:
    //   src/app/api/health-check/route.ts                  (POST prober + GET rollup)
    //   src/app/api/health-check/dead/route.ts
    //   src/app/api/health-check/server-rollup/route.ts
    //   src/app/api/provisioning/health/route.ts
    //   src/lib/scheduler.ts  (processServerHealthRollup, line ~875)
    // The status='archived' gate we set on the archive Server is therefore NOT load-bearing.
    // Domains attached to the archive will still be probed and have isAlive/lastChecked
    // overwritten; the archive Server will still appear in the server-rollup grid and
    // participate in the 50%-alive scheduler alerting.
    warn('==================================================================');
    warn('HEALTH-CHECK WARNING: status="archived" is NOT filtered by any HC route.');
    warn(`Archive serverId = ${resolvedArchiveId}`);
    warn(`Archive host     = ${ARCHIVE_HOST}`);
    warn('Before the next health-check cron tick, either:');
    warn('  (a) detach the archived domains (set serverId=NULL or move to live server), OR');
    warn(`  (b) hard-disable HC for serverId=${resolvedArchiveId} in scheduler.ts /`);
    warn('      add `where: { status: { not: "archived" } }` to the HC routes + scheduler, OR');
    warn(`  (c) blocklist host=${ARCHIVE_HOST} in the prober so it short-circuits.`);
    warn('Otherwise the HC sweep will try to probe legacy.seekahost.archive and mark');
    warn('every attached domain dead on the next tick.');
    warn('==================================================================');

    return {
      phase: 2,
      archiveId: resolvedArchiveId,
      retired: del.rowCount,
      domainsOnArchive: finals.domains_on_archive,
      legacyServersAfter: finals.legacy_servers_after,
      healthCheckGateActive: false,
      healthCheckGateNote: 'Server.status="archived" set but NOT filtered by any HC route; manual exclusion required.',
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    err('DATABASE_URL not set');
    process.exit(1);
  }

  log(`mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}  phase: ${phaseArg}`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const results = [];
  try {
    if (phaseArg === '1' || phaseArg === 'both') {
      results.push(await runPhase1(client));
    }
    if (phaseArg === '2' || phaseArg === 'both') {
      results.push(await runPhase2(client));
    }
  } finally {
    await client.end().catch(() => {});
  }

  log('--- DONE ---');
  for (const r of results) console.log(JSON.stringify(r, null, 2));
}

main().catch(e => {
  err(e?.stack || e?.message || String(e));
  process.exit(1);
});
