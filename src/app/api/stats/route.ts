import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalDomains, totalArticles, recentDeploys, activeThemes, totalServers,
      healthyServers,
      totalBacklinks, deployedDomains, aliveDomains, deadDomains,
      schedulerActive, schedulerRunning,
      todayArticles, todayDeploys,
      indexedDomains,
      todayBacklinks, totalBacklinkPlacements, backlinkConfig,
      domainsWithoutSchedule,
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
      prisma.domain.count({ where: { lastDeployed: { not: null } } }),
      prisma.domain.count({ where: { isAlive: true } }),
      prisma.domain.count({ where: { isAlive: false, lastChecked: { not: null } } }),
      prisma.domainSchedule.count({ where: { isActive: true } }),
      prisma.schedulerConfig.findFirst({ select: { isRunning: true } }),
      prisma.schedulerJob.count({ where: { createdAt: { gte: todayStart }, status: "success" } }),
      prisma.schedulerJob.count({
        where: { createdAt: { gte: todayStart }, status: "success", filesDeployed: { gt: 0 } },
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
    ]);

    return NextResponse.json({
      totalDomains,
      totalArticles,
      recentDeploys,
      activeThemes,
      totalServers,
      healthyServers,
      totalBacklinks,
      deployedDomains,
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
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
