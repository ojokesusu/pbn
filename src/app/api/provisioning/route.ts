import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ONE_HOUR_MS = 60 * 60 * 1000;
const TIERS = ["1gb", "2gb", "4gb"] as const;

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

  const [
    totalServers,
    activeServers,
    totalDomains,
    assignedDomains,
    healthyServers,
    staleServers,
    allServers,
    activeBatchesRaw,
    recentTasksRaw,
  ] = await Promise.all([
    prisma.server.count(),
    prisma.server.count({ where: { status: "active" } }),
    prisma.domain.count(),
    prisma.domain.count({
      where: { serverId: { not: null }, server: { status: "active" } },
    }),
    prisma.server.count({
      where: {
        status: "active",
        lastHealthCheck: { gte: oneHourAgo },
      },
    }),
    prisma.server.count({
      where: {
        status: "active",
        OR: [
          { lastHealthCheck: null },
          { lastHealthCheck: { lt: oneHourAgo } },
        ],
      },
    }),
    prisma.server.findMany({
      select: {
        id: true,
        provider: true,
        tier: true,
        domainCap: true,
        status: true,
        _count: { select: { domains: true } },
      },
    }),
    prisma.provisionBatch.findMany({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        totalTargets: true,
        completedCount: true,
        failedCount: true,
        runningCount: true,
        pendingCount: true,
        createdAt: true,
      },
    }),
    prisma.provisionTask.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        label: true,
        host: true,
        status: true,
        progress: true,
        currentStep: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  // Capacity math
  const totalSlot = allServers.reduce((sum, s) => sum + (s.domainCap ?? 0), 0);
  const usedSlot = assignedDomains;
  const availableSlot = Math.max(totalSlot - usedSlot, 0);

  // By tier
  const tierMap = new Map<string, { tier: string; servers: number; slot: number }>();
  for (const t of TIERS) {
    tierMap.set(t, { tier: t, servers: 0, slot: 0 });
  }
  for (const s of allServers) {
    const key = s.tier && s.tier.length > 0 ? s.tier : "unknown";
    const entry = tierMap.get(key) ?? { tier: key, servers: 0, slot: 0 };
    entry.servers += 1;
    entry.slot += s.domainCap ?? 0;
    tierMap.set(key, entry);
  }
  const byTier = Array.from(tierMap.values());

  // By provider
  const providerMap = new Map<
    string,
    { provider: string; servers: number; slot: number; used: number }
  >();
  for (const s of allServers) {
    const key = s.provider && s.provider.length > 0 ? s.provider : "unknown";
    const entry =
      providerMap.get(key) ?? { provider: key, servers: 0, slot: 0, used: 0 };
    entry.servers += 1;
    entry.slot += s.domainCap ?? 0;
    entry.used += s._count?.domains ?? 0;
    providerMap.set(key, entry);
  }
  const byProvider = Array.from(providerMap.values()).sort(
    (a, b) => b.servers - a.servers
  );

  // Active batches with progress
  const activeBatches = activeBatchesRaw.map((b) => {
    const total = b.totalTargets ?? 0;
    const done = (b.completedCount ?? 0) + (b.failedCount ?? 0);
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      id: b.id,
      name: b.name,
      provider: b.provider,
      status: b.status,
      totalTargets: total,
      completedCount: b.completedCount ?? 0,
      failedCount: b.failedCount ?? 0,
      runningCount: b.runningCount ?? 0,
      pendingCount: b.pendingCount ?? 0,
      progressPct,
      createdAt: b.createdAt.toISOString(),
    };
  });

  const recentTasks = recentTasksRaw.map((t) => ({
    id: t.id,
    label: t.label,
    host: t.host,
    status: t.status,
    progress: t.progress ?? 0,
    currentStep: t.currentStep ?? "",
    startedAt: t.startedAt ? t.startedAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return NextResponse.json({
    stats: {
      totalServers,
      activeServers,
      totalDomains,
      assignedDomains,
      healthyServers,
      staleServers,
    },
    capacity: {
      totalSlot,
      usedSlot,
      availableSlot,
      byTier,
      byProvider,
    },
    activeBatches,
    recentTasks,
  });
}
