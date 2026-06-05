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
        data: {
          maxPerDomain: 3,
          maxPerArticle: 1,
          percentArticles: 30,
          maxPerDay: 200,
          maxPerServerPerDay: 6,
        },
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
    // maxPerServerPerDay not yet in schema — fallback to 6
    const perServerCap =
      (config as unknown as { maxPerServerPerDay?: number }).maxPerServerPerDay ?? 6;

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

    // Per-server breakdown for today's placements
    const todayPlacements = await prisma.backlinkPlacement.findMany({
      where: { createdAt: { gte: todayStart } },
      select: {
        article: {
          select: {
            domain: {
              select: {
                serverId: true,
                server: { select: { name: true, host: true } },
              },
            },
          },
        },
      },
    });

    const serverMap = new Map<
      string,
      { serverId: string; hostname: string; ipAddress: string; placed: number; cap: number }
    >();
    for (const p of todayPlacements) {
      const serverId = p.article?.domain?.serverId;
      if (!serverId) continue;
      const srv = p.article?.domain?.server;
      const existing = serverMap.get(serverId);
      if (existing) {
        existing.placed += 1;
      } else {
        serverMap.set(serverId, {
          serverId,
          hostname: srv?.name || "",
          ipAddress: srv?.host || "",
          placed: 1,
          cap: perServerCap,
        });
      }
    }
    const serverStats = Array.from(serverMap.values())
      .sort((a, b) => b.placed - a.placed)
      .slice(0, 10);

    // Per-strategy breakdown — domain counts grouped by Domain.strategy
    const domainsByStrategy = await prisma.domain.groupBy({
      by: ["strategy"],
      where: { lastDeployed: { not: null } },
      _count: { _all: true },
    });
    const domainCountByStrategy = new Map<string, number>();
    for (const row of domainsByStrategy) {
      domainCountByStrategy.set(row.strategy, row._count._all);
    }

    // Today's placements with domain.strategy + the persisted anchorCategory
    // chosen by the distributor at insert time. NULL category = legacy row
    // (placed before Phase 5a migration) — skipped from the per-strategy mix.
    const todayPlacementsWithStrategy = await prisma.backlinkPlacement.findMany({
      where: { createdAt: { gte: todayStart } },
      select: {
        anchorCategory: true,
        article: { select: { domain: { select: { strategy: true } } } },
      },
    });

    type StrategyName = "whitehat" | "greyhat" | "blackhat";
    const strategies: StrategyName[] = ["whitehat", "greyhat", "blackhat"];

    type AnchorCategory = "exact" | "brand" | "partial" | "extracted";
    type AnchorMix = Record<AnchorCategory, number>;
    const VALID_CATEGORIES: ReadonlySet<AnchorCategory> = new Set([
      "exact",
      "brand",
      "partial",
      "extracted",
    ]);
    const emptyMix = (): AnchorMix => ({ exact: 0, brand: 0, partial: 0, extracted: 0 });

    const strategyAgg = new Map<string, { placedToday: number; mix: AnchorMix }>();
    for (const s of strategies) strategyAgg.set(s, { placedToday: 0, mix: emptyMix() });

    for (const p of todayPlacementsWithStrategy) {
      const strat = p.article?.domain?.strategy as StrategyName | undefined;
      if (!strat || !strategyAgg.has(strat)) continue;
      const slot = strategyAgg.get(strat)!;
      slot.placedToday += 1;
      const cat = p.anchorCategory as AnchorCategory | null;
      if (cat && VALID_CATEGORIES.has(cat)) slot.mix[cat] += 1;
    }

    const strategyStats = strategies.map((s) => ({
      strategy: s,
      domainCount: domainCountByStrategy.get(s) ?? 0,
      placedToday: strategyAgg.get(s)!.placedToday,
      anchorMix: strategyAgg.get(s)!.mix,
    }));

    return NextResponse.json({
      config: {
        maxPerDomain: config.maxPerDomain,
        maxPerArticle: config.maxPerArticle,
        percentArticles: config.percentArticles,
        perServerCap,
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
        perServerCap,
      },
      domains: domainStats,
      serverStats,
      strategyStats,
    });
  } catch (error) {
    console.error("Backlink stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
