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

    const [statusGroups, todayCount, budget, totalJobs] = await Promise.all([
      prisma.contentJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.contentJob.count({
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.budgetState.findUnique({ where: { period } }),
      prisma.contentJob.count(),
    ]);

    const jobsByStatus: Record<string, number> = {};
    for (const g of statusGroups) {
      jobsByStatus[g.status] = g._count._all;
    }

    return NextResponse.json({
      stats: {
        jobsByStatus,
        totalJobs,
        todayCount,
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
