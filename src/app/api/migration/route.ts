import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SERVER_C02 = "cmpgluzyf0000v9ocjpilly6w";
const SERVER_C03 = "cmpglv0ac0001v9oc9mqi8e22";
const PACE_PER_DAY = 12;
const TOTAL_ACQUISITION = 1858;

export async function GET() {
  const [totalDeployable, deployed, queue, recentDeploys, articlesTotal] = await Promise.all([
    prisma.domain.count({
      where: { articles: { some: { status: "published" } }, serverId: { in: [SERVER_C02, SERVER_C03] } },
    }),
    prisma.domain.count({
      where: { articles: { some: { status: "published" } }, serverId: { in: [SERVER_C02, SERVER_C03] }, lastDeployed: { not: null } },
    }),
    prisma.domain.count({
      where: { articles: { some: { status: "published" } }, serverId: { in: [SERVER_C02, SERVER_C03] }, lastDeployed: null },
    }),
    prisma.deployLog.findMany({
      where: { status: "success", action: "deploy" },
      orderBy: { deployedAt: "desc" },
      take: 30,
      select: { id: true, domainId: true, deployedAt: true, filesChanged: true, message: true },
    }),
    prisma.article.count({ where: { status: "published" } }),
  ]);

  const genreBreakdown = await prisma.domain.groupBy({
    by: ["genre"],
    where: { articles: { some: { status: "published" } }, serverId: { in: [SERVER_C02, SERVER_C03] } },
    _count: { _all: true },
  });

  const c02Count = await prisma.domain.count({
    where: { articles: { some: { status: "published" } }, serverId: SERVER_C02 },
  });
  const c03Count = await prisma.domain.count({
    where: { articles: { some: { status: "published" } }, serverId: SERVER_C03 },
  });

  // FULL server distribution (all active servers w domains > 0)
  const allServerDomains = await prisma.domain.groupBy({
    by: ["serverId"],
    where: { serverId: { not: null } },
    _count: { _all: true },
  });
  const serverIds = allServerDomains.map((s) => s.serverId).filter((id): id is string => id !== null);
  const serverInfo = await prisma.server.findMany({
    where: { id: { in: serverIds } },
    select: { id: true, label: true, host: true, status: true },
  });
  const serverMap = new Map(serverInfo.map((s) => [s.id, s]));
  const allServerDistribution = allServerDomains
    .map((s) => {
      const info = serverMap.get(s.serverId!);
      return {
        serverId: s.serverId,
        label: info?.label ?? "unknown",
        host: info?.host ?? "?",
        status: info?.status ?? "?",
        count: s._count._all,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Pilot servers (currently 0 domains, but registered)
  const pilotServers = await prisma.server.findMany({
    where: { label: { in: ["IDCH-JKT01", "Biznet-Java01", "Rumahweb-JKT01"] } },
    select: { id: true, label: true, host: true, status: true, _count: { select: { domains: true } } },
  });
  for (const p of pilotServers) {
    if (!serverMap.has(p.id)) {
      allServerDistribution.push({
        serverId: p.id,
        label: p.label,
        host: p.host,
        status: p.status,
        count: p._count.domains,
      });
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentLogs = await prisma.deployLog.findMany({
    where: { status: "success", action: "deploy", deployedAt: { gte: thirtyDaysAgo } },
    select: { deployedAt: true },
  });
  const dailyMap = new Map<string, number>();
  for (const log of recentLogs) {
    const key = log.deployedAt.toISOString().slice(0, 10);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
  }
  const dailyDeploys: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyDeploys.push({ date: key, count: dailyMap.get(key) ?? 0 });
  }

  const remainingDays = Math.ceil(queue / PACE_PER_DAY);
  const etaDate = new Date(Date.now() + remainingDays * 24 * 60 * 60 * 1000);

  const recentDeployDetails = await Promise.all(
    recentDeploys.slice(0, 10).map(async (log) => {
      const d = await prisma.domain.findUnique({
        where: { id: log.domainId },
        select: { name: true, genre: true, serverId: true },
      });
      return {
        deployedAt: log.deployedAt.toISOString(),
        name: d?.name ?? "unknown",
        genre: d?.genre ?? "",
        server: d?.serverId === SERVER_C02 ? "C02" : d?.serverId === SERVER_C03 ? "C03" : "?",
        filesChanged: log.filesChanged,
      };
    })
  );

  // 3-PHASE BREAKDOWN
  // Phase 1: scrape-based content (Bucket 1 + 2 + Wayback recovery)
  // Phase 2: AI-gen content (domain registered + serverId, but no articles)
  // Phase 3: re-probe blocked Wayback (87 Bucket 2 + 271 Bucket 1 = 358)
  const phase2Pending = await prisma.domain.count({
    where: { articles: { none: {} }, serverId: { in: [SERVER_C02, SERVER_C03] } },
  });
  const phase3Blocked = 358;

  const phases = [
    { name: "Phase 1: Scrape Content", scope: totalDeployable, status: "active", color: "#14b8a6" },
    { name: "Phase 2: AI Generate", scope: phase2Pending, status: "pending", color: "#f59e0b" },
    { name: "Phase 3: Re-probe Wayback", scope: phase3Blocked, status: "future", color: "#8b5cf6" },
  ];

  const ultimateScope = totalDeployable + phase2Pending + phase3Blocked;
  const ultimateRemainingDays = Math.ceil((queue + phase2Pending + phase3Blocked) / PACE_PER_DAY);
  const ultimateEta = new Date(Date.now() + ultimateRemainingDays * 24 * 60 * 60 * 1000);

  return NextResponse.json({
    totals: {
      acquisition: TOTAL_ACQUISITION,
      deployable: totalDeployable,
      deployed,
      queue,
      articles: articlesTotal,
      ultimateScope,
      ultimateRemainingDays,
      ultimateEta: ultimateEta.toISOString().slice(0, 10),
    },
    progress: {
      pct: totalDeployable > 0 ? Math.round((deployed / totalDeployable) * 100) : 0,
      ultimatePct: ultimateScope > 0 ? Math.round((deployed / ultimateScope) * 100) : 0,
      remainingDays,
      etaDate: etaDate.toISOString().slice(0, 10),
      pacePerDay: PACE_PER_DAY,
    },
    pool: {
      genreBreakdown: genreBreakdown.map((g) => ({ genre: g.genre || "(none)", count: g._count._all })),
      serverDistribution: [
        { server: "Contabo-02", count: c02Count },
        { server: "Contabo-03", count: c03Count },
      ],
      allServers: allServerDistribution,
    },
    phases,
    daily: dailyDeploys,
    recent: recentDeployDetails,
  });
}
