import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    todayAgg,
    monthAgg,
    lastMonthAgg,
    totalAgg,
    recent,
    perOperation,
  ] = await Promise.all([
    prisma.apiUsage.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costUsd: true },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costUsd: true },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costUsd: true },
      _count: true,
    }),
    prisma.apiUsage.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.apiUsage.groupBy({
      by: ["operation"],
      where: { createdAt: { gte: monthStart } },
      _sum: { costUsd: true, totalTokens: true },
      _count: true,
    }),
  ]);

  // Daily breakdown for the last 30 days (simple)
  const days: Array<{ date: string; cost: number; calls: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    days.push({
      date: d.toISOString().slice(0, 10),
      cost: 0,
      calls: 0,
    });
  }
  const daily = await prisma.apiUsage.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    select: { costUsd: true, createdAt: true },
  });
  for (const u of daily) {
    const key = u.createdAt.toISOString().slice(0, 10);
    const day = days.find((x) => x.date === key);
    if (day) {
      day.cost += u.costUsd;
      day.calls += 1;
    }
  }

  return NextResponse.json({
    today: {
      calls: todayAgg._count,
      inputTokens: todayAgg._sum.inputTokens ?? 0,
      outputTokens: todayAgg._sum.outputTokens ?? 0,
      totalTokens: todayAgg._sum.totalTokens ?? 0,
      costUsd: todayAgg._sum.costUsd ?? 0,
    },
    thisMonth: {
      calls: monthAgg._count,
      inputTokens: monthAgg._sum.inputTokens ?? 0,
      outputTokens: monthAgg._sum.outputTokens ?? 0,
      totalTokens: monthAgg._sum.totalTokens ?? 0,
      costUsd: monthAgg._sum.costUsd ?? 0,
    },
    lastMonth: {
      calls: lastMonthAgg._count,
      costUsd: lastMonthAgg._sum.costUsd ?? 0,
    },
    allTime: {
      calls: totalAgg._count,
      costUsd: totalAgg._sum.costUsd ?? 0,
      totalTokens: totalAgg._sum.totalTokens ?? 0,
    },
    daily: days,
    perOperation: perOperation.map((p) => ({
      operation: p.operation || "unknown",
      calls: p._count,
      costUsd: p._sum.costUsd ?? 0,
      totalTokens: p._sum.totalTokens ?? 0,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      model: r.model,
      operation: r.operation,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      costUsd: r.costUsd,
      createdAt: r.createdAt,
    })),
  });
}
