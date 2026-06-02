import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSchedulerConfig } from "@/lib/scheduler";
import { getServerSchedulerStatus } from "@/lib/server-scheduler";

// GET — scheduler status + stats
export async function GET() {
  try {
    const config = await getSchedulerConfig();

    const totalActive = await prisma.domainSchedule.count({ where: { isActive: true } });
    const totalDomains = await prisma.domain.count();
    const pendingJobs = await prisma.domainSchedule.count({
      where: { isActive: true, nextScheduled: { lte: new Date() } },
    });

    // Recent jobs
    const recentJobs = await prisma.schedulerJob.findMany({
      include: { domain: { select: { url: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Next scheduled
    const nextUp = await prisma.domainSchedule.findFirst({
      where: { isActive: true, nextScheduled: { gt: new Date() } },
      include: { domain: { select: { url: true, name: true } } },
      orderBy: { nextScheduled: "asc" },
    });

    // Today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayJobs = await prisma.schedulerJob.findMany({
      where: { createdAt: { gte: todayStart } },
    });
    const todayGenerated = todayJobs.reduce((sum, j) => sum + j.articlesCreated, 0);
    const todayDeployed = todayJobs.filter(j => j.filesDeployed > 0).length;

    const serverStatus = getServerSchedulerStatus();

    return NextResponse.json({
      config: {
        isRunning: config.isRunning,
        articlesPerWeek: config.articlesPerWeek,
        timeWindowStart: config.timeWindowStart,
        timeWindowEnd: config.timeWindowEnd,
        autoDeploy: config.autoDeploy,
        autoPurgeCache: config.autoPurgeCache,
        initialArticles: config.initialArticles,
        maxDomainsPerDay: config.maxDomainsPerDay,
        contentMode: config.contentMode,
        hybridSourceLimit: config.hybridSourceLimit,
      },
      stats: {
        totalDomains,
        activeDomains: totalActive,
        pendingJobs,
        todayGenerated,
        todayDeployed,
        nextScheduled: nextUp ? {
          domain: nextUp.domain?.name || nextUp.domain?.url,
          at: nextUp.nextScheduled,
        } : null,
      },
      serverScheduler: {
        isRunning: serverStatus.isRunning,
        lastTick: serverStatus.lastTick,
        tickInterval: serverStatus.tickInterval,
      },
      recentJobs: recentJobs.map(j => ({
        id: j.id,
        domain: j.domain?.name || j.domain?.url,
        type: j.type,
        status: j.status,
        message: j.message,
        articlesCreated: j.articlesCreated,
        filesDeployed: j.filesDeployed,
        scheduledAt: j.scheduledAt,
        completedAt: j.completedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT — update scheduler config (start/stop, change settings)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const config = await getSchedulerConfig();

    // Validate contentMode if provided
    if (body.contentMode !== undefined && body.contentMode !== "pure_ai" && body.contentMode !== "hybrid_rss") {
      return NextResponse.json({ error: "Invalid contentMode (must be pure_ai or hybrid_rss)" }, { status: 400 });
    }

    const updated = await prisma.schedulerConfig.update({
      where: { id: config.id },
      data: {
        isRunning: body.isRunning ?? config.isRunning,
        articlesPerWeek: body.articlesPerWeek ?? config.articlesPerWeek,
        timeWindowStart: body.timeWindowStart ?? config.timeWindowStart,
        timeWindowEnd: body.timeWindowEnd ?? config.timeWindowEnd,
        autoDeploy: body.autoDeploy ?? config.autoDeploy,
        autoPurgeCache: body.autoPurgeCache ?? config.autoPurgeCache,
        initialArticles: body.initialArticles ?? config.initialArticles,
        maxDomainsPerDay: body.maxDomainsPerDay ?? config.maxDomainsPerDay,
        contentMode: body.contentMode ?? config.contentMode,
        hybridSourceLimit: body.hybridSourceLimit ?? config.hybridSourceLimit,
      },
    });

    return NextResponse.json({ success: true, config: updated });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
