import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/scheduler/details?type=active|pending|today
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") || "active";

    if (type === "active") {
      // All active domains in the scheduler
      const schedules = await prisma.domainSchedule.findMany({
        where: { isActive: true },
        include: {
          domain: {
            select: { id: true, url: true, name: true, genre: true, _count: { select: { articles: true } } },
          },
        },
        orderBy: { nextScheduled: "asc" },
      });

      return NextResponse.json({
        type: "active",
        total: schedules.length,
        items: schedules.map(s => ({
          domainId: s.domainId,
          url: s.domain.url,
          name: s.domain.name,
          genre: s.domain.genre,
          articles: s.domain._count.articles,
          nextScheduled: s.nextScheduled,
          lastGenerated: s.lastGenerated,
          totalGenerated: s.totalGenerated,
        })),
      });
    }

    if (type === "pending") {
      // Domains that are due now (nextScheduled <= now)
      const now = new Date();
      const pending = await prisma.domainSchedule.findMany({
        where: { isActive: true, nextScheduled: { lte: now } },
        include: {
          domain: {
            select: { id: true, url: true, name: true, genre: true, _count: { select: { articles: true } } },
          },
        },
        orderBy: { nextScheduled: "asc" },
      });

      return NextResponse.json({
        type: "pending",
        total: pending.length,
        items: pending.map(s => ({
          domainId: s.domainId,
          url: s.domain.url,
          name: s.domain.name,
          genre: s.domain.genre,
          articles: s.domain._count.articles,
          nextScheduled: s.nextScheduled,
          lastGenerated: s.lastGenerated,
        })),
      });
    }

    if (type === "today") {
      // Today's jobs (generated + deployed)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const jobs = await prisma.schedulerJob.findMany({
        where: { createdAt: { gte: todayStart } },
        include: {
          domain: { select: { url: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        type: "today",
        total: jobs.length,
        articlesTotal: jobs.reduce((s, j) => s + j.articlesCreated, 0),
        deploysTotal: jobs.filter(j => j.filesDeployed > 0).length,
        items: jobs.map(j => ({
          id: j.id,
          url: j.domain?.url,
          name: j.domain?.name,
          type: j.type,
          status: j.status,
          articlesCreated: j.articlesCreated,
          filesDeployed: j.filesDeployed,
          message: j.message,
          scheduledAt: j.scheduledAt,
          completedAt: j.completedAt,
        })),
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
