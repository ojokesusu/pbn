import { denyIfNotAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const rows = await prisma.stressTestRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        server: {
          select: {
            id: true,
            label: true,
            host: true,
            tier: true,
            provider: true,
          },
        },
      },
    });

    const stressTests = rows.map((r) => ({
      id: r.id,
      serverId: r.serverId,
      dummyCount: r.dummyCount,
      durationSec: r.durationSec,
      concurrentWorkers: r.concurrentWorkers,
      status: r.status,
      startedAt: toIso(r.startedAt),
      completedAt: toIso(r.completedAt),
      ramBaselineMb: r.ramBaselineMb,
      ramPeakMb: r.ramPeakMb,
      ramAvgMb: r.ramAvgMb,
      swapUsedPeakMb: r.swapUsedPeakMb,
      oomEvents: r.oomEvents,
      requestsTotal: r.requestsTotal,
      avgResponseMs: r.avgResponseMs,
      errors: r.errors,
      verdict: r.verdict,
      recommendation: r.recommendation,
      errorMessage: r.errorMessage,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
      server: r.server,
    }));

    return NextResponse.json({ stressTests });
  } catch (error) {
    console.error("Failed to list stress tests:", error);
    return NextResponse.json(
      { error: "Failed to list stress tests" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));

    const serverId = typeof body?.serverId === "string" ? body.serverId.trim() : "";
    const dummyCountRaw = Number(body?.dummyCount);
    const durationSecRaw = Number(body?.durationSec);
    const concurrentWorkersRaw =
      body?.concurrentWorkers === undefined || body?.concurrentWorkers === null
        ? 5
        : Number(body?.concurrentWorkers);

    if (!serverId) {
      return NextResponse.json(
        { error: "serverId wajib diisi" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(dummyCountRaw) || dummyCountRaw < 1 || dummyCountRaw > 30) {
      return NextResponse.json(
        { error: "dummyCount harus 1-30" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(durationSecRaw) || durationSecRaw < 60 || durationSecRaw > 3600) {
      return NextResponse.json(
        { error: "durationSec harus 60-3600 detik" },
        { status: 400 }
      );
    }
    if (
      !Number.isFinite(concurrentWorkersRaw) ||
      concurrentWorkersRaw < 1 ||
      concurrentWorkersRaw > 20
    ) {
      return NextResponse.json(
        { error: "concurrentWorkers harus 1-20" },
        { status: 400 }
      );
    }

    const dummyCount = Math.floor(dummyCountRaw);
    const durationSec = Math.floor(durationSecRaw);
    const concurrentWorkers = Math.floor(concurrentWorkersRaw);

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, status: true, host: true, label: true },
    });

    if (!server) {
      return NextResponse.json(
        { error: "Server tidak ditemukan" },
        { status: 404 }
      );
    }
    if (server.status !== "active") {
      return NextResponse.json(
        { error: `Server status="${server.status}", harus "active" untuk stress test` },
        { status: 400 }
      );
    }

    const row = await prisma.stressTestRun.create({
      data: {
        serverId,
        dummyCount,
        durationSec,
        concurrentWorkers,
        status: "pending",
      },
      include: {
        server: {
          select: {
            id: true,
            label: true,
            host: true,
            tier: true,
            provider: true,
          },
        },
      },
    });

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
        errorMessage: row.errorMessage,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        server: row.server,
      },
    });
  } catch (error) {
    console.error("Failed to create stress test:", error);
    return NextResponse.json(
      { error: "Failed to create stress test" },
      { status: 500 }
    );
  }
}
