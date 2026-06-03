import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const period = currentPeriod();
    const todayStart = startOfTodayUTC();
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
    );

    const [statusGroups, todayCount, budget, totalJobs, todayAgg, monthAgg] =
      await Promise.all([
        prisma.contentJob.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.contentJob.count({
          where: { createdAt: { gte: todayStart } },
        }),
        prisma.budgetState.findUnique({ where: { period } }),
        prisma.contentJob.count(),
        prisma.apiUsage.aggregate({
          where: { createdAt: { gte: todayStart } },
          _sum: { costUsd: true },
        }),
        prisma.apiUsage.aggregate({
          where: { createdAt: { gte: startOfMonth } },
          _sum: { costUsd: true },
        }),
      ]);

    const jobsByStatus: Record<string, number> = {};
    for (const g of statusGroups) {
      jobsByStatus[g.status] = g._count._all;
    }

    const spendUsdToday = Number(todayAgg._sum.costUsd ?? 0);
    const spendUsdMonth = Number(monthAgg._sum.costUsd ?? 0);
    const budgetCapUsd = (budget?.capCents ?? 30000) / 100;
    const todayJobs = todayCount;
    const queueDepth = jobsByStatus.queued ?? 0;
    const failed = jobsByStatus.failed ?? 0;
    const pending = jobsByStatus.queued ?? 0;
    const running =
      (jobsByStatus.scraping ?? 0) +
      (jobsByStatus.rewriting ?? 0) +
      (jobsByStatus.publishing ?? 0);
    const successRate =
      totalJobs > 0 ? (jobsByStatus.completed ?? 0) / totalJobs : 0;

    // Flat top-level shape to match the UI's `ContentStats` contract — the
    // page reads fields directly off res.json(), not res.json().stats.
    // `budget` and `jobsByStatus` kept as nested diagnostic fields.
    return NextResponse.json({
      totalJobs,
      todayJobs,
      queueDepth,
      spendUsdToday,
      spendUsdMonth,
      budgetCapUsd,
      successRate,
      failed,
      pending,
      running,
      jobsByStatus,
      budget: budget
        ? {
            period: budget.period,
            spentCents: budget.spentCents,
            capCents: budget.capCents,
            alertSent: budget.alertSent,
          }
        : {
            period,
            spentCents: 0,
            capCents: 30000,
            alertSent: false,
          },
    });
  } catch (error) {
    console.error("Failed to fetch content stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch content stats" },
      { status: 500 }
    );
  }
}
