import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// IndexNow daily cap — Microsoft IndexNow API caps ~10k URLs/day per key.
// Surfaced in the UI so the operator can pace submissions instead of
// silently hitting the wall.
const DAILY_CAP = 10000;

// GET /api/google-ping/status — IndexNow submission health snapshot.
//
// Returns aggregates over the last 7 days plus today's daily-cap usage:
//   - summary: totals, success rate, used today, remaining
//   - byDay: per-day breakdown (oldest-first) for sparkline / bar chart
//   - topFailingDomains: top 10 domains by failure count + their URL
//   - recentFailures: latest 20 failed submissions with httpStatus + message
//
// Admin-only — this exposes per-domain failure detail that operators
// without admin role shouldn't see.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const now = new Date();

    // startOfTodayUTC — anchor for "used today" cap counting. We use UTC
    // because IndexNow's quota is keyed by the day boundary at the API
    // side (UTC), not the operator's local day.
    const startOfTodayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    // 7-day window starts at midnight UTC 6 days ago, so today + 6 prior
    // days = exactly 7 day-buckets for the chart.
    const windowStart = new Date(startOfTodayUTC);
    windowStart.setUTCDate(windowStart.getUTCDate() - 6);

    const [
      totalSubmissions,
      successCount,
      usedToday,
      logs7d,
      topFailingRaw,
      recentFailuresRaw,
    ] = await Promise.all([
      prisma.indexNowLog.count({ where: { submittedAt: { gte: windowStart } } }),
      prisma.indexNowLog.count({
        where: { submittedAt: { gte: windowStart }, success: true },
      }),
      prisma.indexNowLog.count({
        where: { submittedAt: { gte: startOfTodayUTC } },
      }),
      // Pull just the fields we need for the per-day rollup. We aggregate
      // in-memory because Prisma's groupBy doesn't expose date_trunc and
      // doing raw SQL for a 7-day rollup is overkill.
      prisma.indexNowLog.findMany({
        where: { submittedAt: { gte: windowStart } },
        select: { submittedAt: true, success: true },
      }),
      // Top failing domains: groupBy domainId, sort by failure count desc.
      prisma.indexNowLog.groupBy({
        by: ["domainId"],
        where: { submittedAt: { gte: windowStart }, success: false },
        _count: { _all: true },
        orderBy: { _count: { domainId: "desc" } },
        take: 10,
      }),
      // Latest 20 failures joined to Domain.url for clickability.
      prisma.indexNowLog.findMany({
        where: { submittedAt: { gte: windowStart }, success: false },
        orderBy: { submittedAt: "desc" },
        take: 20,
        select: {
          id: true,
          url: true,
          httpStatus: true,
          errorMessage: true,
          submittedAt: true,
          domain: { select: { id: true, name: true, url: true } },
        },
      }),
    ]);

    const failureCount = totalSubmissions - successCount;
    const successRate = successCount / Math.max(1, totalSubmissions);
    const remaining = Math.max(0, DAILY_CAP - usedToday);

    // Build the 7-day rollup with stable buckets so the chart renders
    // empty days as zero (instead of skipping them).
    const byDayMap = new Map<string, { date: string; total: number; success: number; failure: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(windowStart);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      byDayMap.set(key, { date: key, total: 0, success: 0, failure: 0 });
    }
    for (const log of logs7d) {
      const key = log.submittedAt.toISOString().slice(0, 10);
      const bucket = byDayMap.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      if (log.success) bucket.success += 1;
      else bucket.failure += 1;
    }
    const byDay = Array.from(byDayMap.values());

    // Hydrate top-failing domains with names. Two queries beat N+1.
    // Local types to satisfy strict mode — the Prisma client typings for
    // groupBy aggregates and the recentFailures shape are awkward to import
    // directly, so we inline the minimal shape used here.
    type TopFailRow = { domainId: string; _count: { _all: number } };
    type FailingDomainRow = { id: string; name: string; url: string };
    type RecentFailureRow = {
      id: string;
      url: string;
      httpStatus: number;
      errorMessage: string;
      submittedAt: Date;
      domain: { id: string; name: string; url: string } | null;
    };

    const failingDomainIds = (topFailingRaw as TopFailRow[]).map((r) => r.domainId);
    const failingDomains: FailingDomainRow[] = failingDomainIds.length
      ? await prisma.domain.findMany({
          where: { id: { in: failingDomainIds } },
          select: { id: true, name: true, url: true },
        })
      : [];
    const failingDomainMap = new Map<string, FailingDomainRow>(
      failingDomains.map((d) => [d.id, d] as const),
    );
    const topFailingDomains = (topFailingRaw as TopFailRow[])
      .map((r) => {
        const d = failingDomainMap.get(r.domainId);
        return {
          domainId: r.domainId,
          domainName: d?.name ?? "(unknown)",
          domainUrl: d?.url ?? "",
          failureCount: r._count._all,
        };
      })
      // groupBy may include domains that were deleted; keep them but with
      // (unknown) so the UI can still surface the count.
      .sort((a, b) => b.failureCount - a.failureCount);

    const recentFailures = (recentFailuresRaw as RecentFailureRow[]).map((f) => ({
      id: f.id,
      url: f.url,
      httpStatus: f.httpStatus,
      errorMessage: f.errorMessage,
      submittedAt: f.submittedAt.toISOString(),
      domain: f.domain
        ? { id: f.domain.id, name: f.domain.name, url: f.domain.url }
        : null,
    }));

    return NextResponse.json({
      summary: {
        totalSubmissions,
        successCount,
        failureCount,
        successRate,
        usedToday,
        dailyCap: DAILY_CAP,
        remaining,
      },
      byDay,
      topFailingDomains,
      recentFailures,
    });
  } catch (error) {
    console.error("IndexNow status error:", error);
    return NextResponse.json(
      { error: "Failed to compute IndexNow status" },
      { status: 500 }
    );
  }
}
