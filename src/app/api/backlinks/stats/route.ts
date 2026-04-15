import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// GET /api/backlinks/stats — Distribution stats per domain
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    let config = await prisma.backlinkConfig.findFirst();
    if (!config) {
      config = await prisma.backlinkConfig.create({
        data: { maxPerDomain: 3, maxPerArticle: 1, percentArticles: 30 },
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalBacklinks, totalPlacements, totalArticles, articlesWithBacklinks, placedToday] =
      await Promise.all([
        prisma.backlink.count({ where: { status: "active" } }),
        prisma.backlinkPlacement.count(),
        prisma.article.count({ where: { status: "published" } }),
        prisma.backlinkPlacement.groupBy({
          by: ["articleId"],
          _count: true,
        }),
        prisma.backlinkPlacement.count({ where: { createdAt: { gte: todayStart } } }),
      ]);

    const dailyLimit = config.maxPerDay || 15;
    const remainingToday = Math.max(0, dailyLimit - placedToday);

    const targetArticles = Math.floor(totalArticles * (config.percentArticles / 100));
    const articlesLinked = articlesWithBacklinks.length;
    const progressPercent = targetArticles > 0 ? Math.min(100, Math.round((articlesLinked / targetArticles) * 100)) : 0;

    // Per-domain breakdown
    const domains = await prisma.domain.findMany({
      where: { lastDeployed: { not: null } },
      select: {
        id: true,
        name: true,
        url: true,
        _count: { select: { articles: true, backlinkPlacements: true } },
      },
      orderBy: { name: "asc" },
    });

    const domainStats = domains.map((d) => ({
      id: d.id,
      name: d.name,
      url: d.url,
      totalArticles: d._count.articles,
      backlinkPlacements: d._count.backlinkPlacements,
      maxSlots: config!.maxPerDomain,
      isFull: d._count.backlinkPlacements >= config!.maxPerDomain,
    }));

    return NextResponse.json({
      config: {
        maxPerDomain: config.maxPerDomain,
        maxPerArticle: config.maxPerArticle,
        percentArticles: config.percentArticles,
      },
      stats: {
        totalBacklinks,
        totalPlacements,
        totalArticles,
        targetArticles,
        articlesLinked,
        progressPercent,
        dailyLimit,
        placedToday,
        remainingToday,
      },
      domains: domainStats,
    });
  } catch (error) {
    console.error("Backlink stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
