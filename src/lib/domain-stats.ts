import { prisma } from "@/lib/db";

/**
 * Status enum reference (single source of truth):
 * - DeployQueueItem.status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused' | 'dead' | 'adult_quarantine'
 * - SchedulerJob.status:    'pending' | 'running' | 'success' | 'failed'  (different model, different terminology)
 * - DeployLog.status:        'success' | 'failed' | 'in-progress'
 * When counting deploys "today", use DeployQueueItem.status='completed' OR DeployLog.status='success' depending on context.
 */

/**
 * Returns the start-of-day in Asia/Jakarta as a UTC `Date` suitable for Prisma `gte` filters.
 *
 * We do NOT use a hard-coded `+7h` offset. Instead we ask Intl.DateTimeFormat for the
 * current Y/M/D in Asia/Jakarta, then re-construct that local midnight via `Date.UTC` and
 * subtract the actual UTC↔Jakarta offset reported by Intl. This keeps the helper correct
 * even if IANA ever changes the zone definition.
 */
function jakartaTodayStart(now: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);

  // Wall-clock seconds elapsed in Jakarta since its local midnight.
  const elapsedMs = ((hh * 60 + mm) * 60 + ss) * 1000;
  // Subtract that from `now` to land exactly on Jakarta's local midnight (expressed as UTC).
  const jakartaMidnightUtc = new Date(now.getTime() - elapsedMs);

  // Sanity guard: re-format the result and confirm it lines up with the Jakarta calendar date
  // we computed above. If something drifts (e.g. host clock skew), fall back to the naive
  // Date.UTC(y, m-1, d) minus the offset Intl reports for `now`.
  const checkFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const checkParts = checkFmt.formatToParts(jakartaMidnightUtc).reduce<Record<string, string>>(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {},
  );
  if (
    Number(checkParts.year) !== y ||
    Number(checkParts.month) !== m ||
    Number(checkParts.day) !== d
  ) {
    // Fallback path — derive offset from the same Intl call.
    const offsetFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      timeZoneName: "shortOffset",
    });
    const offsetPart = offsetFmt.formatToParts(now).find((p) => p.type === "timeZoneName");
    // Example: "GMT+7" → +7 hours
    const match = offsetPart?.value.match(/GMT([+-]\d+)(?::(\d+))?/);
    const offsetHours = match ? Number(match[1]) : 7;
    const offsetMinutes = match && match[2] ? Number(match[2]) : 0;
    const offsetMs = (offsetHours * 60 + Math.sign(offsetHours) * offsetMinutes) * 60 * 1000;
    return new Date(Date.UTC(y, m - 1, d) - offsetMs);
  }

  return jakartaMidnightUtc;
}

// Exported for tests; production callers should prefer the count helpers below.
export const __test__ = { jakartaTodayStart };

/**
 * Count of Domains that are currently alive and in inventory.
 * Excludes write-offs, adult-quarantined rows, and domains parked on archived servers.
 */
export function getLiveCount(): Promise<number> {
  return prisma.domain.count({
    where: {
      isAlive: true,
      writeOff: false,
      isAdult: false,
      NOT: { server: { status: "archived" } },
    },
  });
}

/**
 * Count of Domains confirmed dead (health-checked at least once and came back not-alive).
 * Excludes write-offs, adult, and archived-server rows; requires lastChecked!=null so we
 * don't count "never-checked" domains as dead.
 */
export function getDeadCount(): Promise<number> {
  return prisma.domain.count({
    where: {
      isAlive: false,
      writeOff: false,
      isAdult: false,
      lastChecked: { not: null },
      NOT: { server: { status: "archived" } },
    },
  });
}

/**
 * Count of Domains we have ever pushed a deploy to (lastDeployed!=null).
 * This is the "947" semantic — historical reach, NOT current live count.
 * Keep this separate from getLiveCount() so we don't conflate the two on dashboards.
 */
export function getEverDeployedCount(): Promise<number> {
  return prisma.domain.count({
    where: {
      lastDeployed: { not: null },
      writeOff: false,
      isAdult: false,
    },
  });
}

/**
 * Count of Domains we have never deployed to yet (lastDeployed IS NULL).
 * Useful as the "remaining backlog" for first-deploy campaigns.
 */
export function getNeverDeployedCount(): Promise<number> {
  return prisma.domain.count({
    where: {
      lastDeployed: null,
      writeOff: false,
      isAdult: false,
    },
  });
}

/**
 * Count of Domains operator has marked as write-off (excluded from all inventory math).
 */
export function getWriteOffCount(): Promise<number> {
  return prisma.domain.count({
    where: { writeOff: true },
  });
}

/**
 * Count of DeployQueueItem rows that completed today in Asia/Jakarta.
 * "Today" = attemptedAt >= Jakarta-local midnight (computed via Intl, not a +7h hack).
 * Uses DeployQueueItem.status='completed' per the enum reference at top of file.
 */
export function getDeployedTodayCount(): Promise<number> {
  return prisma.deployQueueItem.count({
    where: {
      status: "completed",
      attemptedAt: { gte: jakartaTodayStart() },
    },
  });
}

/**
 * Denominator for "X% deployed" metrics — total Domains currently in active inventory
 * (not write-off, not adult, not on an archived server). Pair with getEverDeployedCount()
 * or getLiveCount() depending on which ratio you're rendering.
 */
export function getActiveDomainsTotal(): Promise<number> {
  return prisma.domain.count({
    where: {
      writeOff: false,
      isAdult: false,
      NOT: { server: { status: "archived" } },
    },
  });
}
