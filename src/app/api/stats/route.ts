import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getLiveCount,
  getDeadCount,
  getEverDeployedCount,
  jakartaTodayStart,
} from "@/lib/domain-stats";

// Dashboard badge/stat numbers don't need to be real-time. Cache the ~24
// count/aggregate queries for 60s so they don't run on every dashboard poll —
// the Prisma pool is pinned to connection_limit=1 (PgBouncer), so uncached they
// effectively serialize and compound latency. Audit P3.
//
// NOTE (Next 16): unstable_cache is deprecated in favor of the `use cache`
// directive, which requires the global `cacheComponents` opt-in. Deferred here
// to avoid a repo-wide caching-behavior change; revisit with Cache Components.
const getCachedStats = unstable_cache(
  async () => {
    // "Today" = Asia/Jakarta (WIB) midnight, matching the deploy counters. The
    // old `new Date(); setHours(0,0,0,0)` resolved to the Railway container's UTC
    // midnight (= 07:00 WIB), so every morning these counts reset to 0 and a full
    // night of generation read as "yesterday".
    const todayStart = jakartaTodayStart();

    const [
      totalDomains, totalArticles, recentDeploys, activeThemes, totalServers,
      healthyServers,
      totalBacklinks, deployedDomains, aliveDomains, deadDomains,
      schedulerActive, schedulerRunning,
      todayArticles, todayDeploys,
      indexedDomains,
      todayBacklinks, totalBacklinkPlacements, backlinkConfig,
      domainsWithoutSchedule,
      adultDomains,
      iGamingDomains,
      rankKeywordsActive,
      indexNowUsedToday,
    ] = await Promise.all([
      prisma.domain.count(),
      prisma.article.count(),
      prisma.deployLog.count({
        where: {
          action: "deploy",
          status: "success",
          deployedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.theme.count({ where: { domains: { some: {} } } }),
      prisma.server.count(),
      prisma.server.count({ where: { status: "active", stack: { notIn: ["", "unmanaged"] } } }),
      prisma.backlink.count(),
      getEverDeployedCount(),
      getLiveCount(),
      getDeadCount(),
      prisma.domainSchedule.count({ where: { isActive: true } }),
      prisma.schedulerConfig.findFirst({ select: { isRunning: true } }),
      prisma.schedulerJob.count({ where: { createdAt: { gte: todayStart }, status: "success" } }),
      // Real deploys today = DeployLog deploy successes — this covers BOTH the
      // scheduler's direct deploys AND the RDP SFTP worker. The old
      // getDeployedTodayCount() counted DeployQueueItem completions, a path that
      // now only fills via the once-daily redeploy sweep, so the widget read 0
      // on a day with dozens of real deploys.
      prisma.deployLog.count({
        where: { action: "deploy", status: "success", deployedAt: { gte: todayStart } },
      }),
      prisma.domain.count({ where: { indexStatus: "indexed" } }),
      prisma.backlinkPlacement.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.backlinkPlacement.count(),
      prisma.backlinkConfig.findFirst({ select: { maxPerDay: true } }),
      // Domains with NO schedule entry OR schedule is inactive — these are "dormant"
      prisma.domain.count({
        where: {
          OR: [
            { domainSchedule: null },
            { domainSchedule: { isActive: false } },
          ],
        },
      }),
      // Quarantined adult domains — drives the sidebar badge on /domains/adult.
      prisma.domain.count({ where: { isAdult: true } }),
      // iGaming-pinned domains — drives the purple sidebar badge on
      // /domains/igaming. Source-of-truth is NicheMapping.niche, not Domain.
      prisma.nicheMapping.count({ where: { niche: "igaming" } }),
      // Active rank-tracker keywords — drives the SEO sidebar badge.
      prisma.rankKeyword.count({ where: { active: true } }),
      // IndexNow submissions today — drives the "Ping Status" sidebar
      // badge so operator sees daily-cap consumption at a glance. UTC
      // boundary matches /api/google-ping/status which is the source of
      // truth for cap accounting.
      prisma.indexNowLog.count({
        where: {
          submittedAt: {
            gte: new Date(
              Date.UTC(
                new Date().getUTCFullYear(),
                new Date().getUTCMonth(),
                new Date().getUTCDate()
              )
            ),
          },
        },
      }),
    ]);

    return {
      totalDomains,
      totalArticles,
      recentDeploys,
      activeThemes,
      totalServers,
      healthyServers,
      totalBacklinks,
      deployedDomains,
      everDeployed: deployedDomains,
      aliveDomains,
      deadDomains,
      schedulerActive,
      schedulerRunning: schedulerRunning?.isRunning ?? false,
      todayArticles,
      todayDeploys,
      indexedDomains,
      todayBacklinks,
      totalBacklinkPlacements,
      backlinkDailyLimit: backlinkConfig?.maxPerDay ?? 15,
      domainsWithoutSchedule,
      adultDomains,
      iGamingDomains,
      rankKeywordsActive,
      indexNowUsedToday,
    };
  },
  ["dashboard-stats"],
  { revalidate: 60 }
);

export async function GET() {
  try {
    const stats = await getCachedStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
