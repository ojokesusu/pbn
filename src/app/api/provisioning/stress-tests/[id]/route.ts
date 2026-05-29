import { denyIfNotAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;

    const row = await prisma.stressTestRun.findUnique({
      where: { id },
      include: {
        server: {
          select: {
            id: true,
            label: true,
            host: true,
            tier: true,
            provider: true,
            region: true,
            status: true,
          },
        },
      },
    });

    if (!row) {
      return NextResponse.json(
        { error: "Stress test tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      stressTest: {
        id: row.id,
        serverId: row.serverId,
        dummyCount: row.dummyCount,
        durationSec: row.durationSec,
        concurrentWorkers: row.concurrentWorkers,
        status: row.status,
        startedAt: toIso(row.startedAt),
        completedAt: toIso(row.completedAt),
        ramBaselineMb: row.ramBaselineMb,
        ramPeakMb: row.ramPeakMb,
        ramAvgMb: row.ramAvgMb,
        swapUsedPeakMb: row.swapUsedPeakMb,
        oomEvents: row.oomEvents,
        requestsTotal: row.requestsTotal,
        avgResponseMs: row.avgResponseMs,
        errors: row.errors,
        verdict: row.verdict,
        recommendation: row.recommendation,
        log: row.log,
        errorMessage: row.errorMessage,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        server: row.server,
      },
    });
  } catch (error) {
    console.error("Failed to fetch stress test:", error);
    return NextResponse.json(
      { error: "Failed to fetch stress test" },
      { status: 500 }
    );
  }
}
