import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";
import {
  diagnoseServer,
  sortDiagnoses,
  type ServerActionId,
  type FailureRow,
  type ServerHealthInput,
} from "@/lib/server-health-engine";

const FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// GET /api/health-check/server-engine
// Returns per-server diagnosis + recommended action.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const windowStart = new Date(Date.now() - FAILURE_WINDOW_MS);

    const [servers, items, domainCountRows] = await Promise.all([
      prisma.server.findMany({
        where: { status: { not: "archived" } },
        select: {
          id: true,
          label: true,
          name: true,
          host: true,
          provider: true,
          stack: true,
          status: true,
          domainCap: true,
          lastHealthCheck: true,
        },
      }),
      prisma.deployQueueItem.findMany({
        where: {
          attemptedAt: { gte: windowStart },
          status: { in: ["failed", "completed"] },
        },
        select: { serverId: true, status: true, errorMessage: true },
      }),
      // domain count per server — use groupBy so we don't pull 1500+ Domain rows
      prisma.domain.groupBy({
        by: ["serverId"],
        where: { writeOff: false, isAdult: false },
        _count: { _all: true },
      }),
    ]);

    const failuresByServer = new Map<string, FailureRow[]>();
    for (const it of items) {
      if (!it.serverId) continue;
      const bucket = failuresByServer.get(it.serverId) ?? [];
      bucket.push({
        serverId: it.serverId,
        status: it.status,
        errorMessage: it.errorMessage,
      });
      failuresByServer.set(it.serverId, bucket);
    }

    const domainCountByServer = new Map<string, number>();
    for (const row of domainCountRows) {
      if (!row.serverId) continue;
      domainCountByServer.set(row.serverId, row._count._all);
    }

    const inputs: ServerHealthInput[] = servers.map((s) => ({
      server: s,
      domainCount: domainCountByServer.get(s.id) ?? 0,
      failures: failuresByServer.get(s.id) ?? [],
    }));

    const diagnoses = sortDiagnoses(inputs.map(diagnoseServer));

    const summary = {
      total: diagnoses.length,
      critical: diagnoses.filter((d) => d.severity === "critical").length,
      degraded: diagnoses.filter((d) => d.severity === "degraded").length,
      warning: diagnoses.filter((d) => d.severity === "warning").length,
      ok: diagnoses.filter((d) => d.severity === "ok").length,
      actionable: diagnoses.filter((d) => d.recommendedAction.id !== "noop").length,
    };

    return NextResponse.json({ servers: diagnoses, summary });
  } catch (err) {
    console.error("server-engine GET failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/health-check/server-engine
// Body: { serverId: string, action: ServerActionId }
// Executes one of the safe actions returned by the engine.
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null) as { serverId?: string; action?: ServerActionId } | null;
    if (!body?.serverId || !body?.action) {
      return NextResponse.json({ error: "serverId + action wajib" }, { status: 400 });
    }
    const { serverId, action } = body;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return NextResponse.json({ error: "Server tidak ditemukan" }, { status: 404 });

    if (action === "quarantine") {
      if (server.status === "quarantined") {
        return NextResponse.json({ ok: true, noop: true, message: "Sudah quarantined" });
      }
      await prisma.server.update({
        where: { id: serverId },
        data: { status: "quarantined" },
      });
      return NextResponse.json({ ok: true, action, newStatus: "quarantined" });
    }

    if (action === "unquarantine") {
      if (server.status !== "quarantined") {
        return NextResponse.json({ ok: true, noop: true, message: `Server status '${server.status}', bukan quarantined` });
      }
      await prisma.server.update({
        where: { id: serverId },
        data: { status: "active" },
      });
      return NextResponse.json({ ok: true, action, newStatus: "active" });
    }

    if (action === "retry_failed_batch") {
      // Reset all failed items on this server to queued so daemon picks them up.
      const result = await prisma.deployQueueItem.updateMany({
        where: { serverId, status: "failed" },
        data: { status: "queued", attemptedAt: null, errorMessage: "" },
      });
      return NextResponse.json({ ok: true, action, retried: result.count });
    }

    if (action === "archive_dead_server") {
      await prisma.server.update({
        where: { id: serverId },
        data: { status: "archived" },
      });
      return NextResponse.json({ ok: true, action, newStatus: "archived" });
    }

    if (action === "rotate_creds_manual" || action === "noop") {
      return NextResponse.json({
        ok: false,
        noop: true,
        message: "Action ini perlu intervensi manual — buka /servers untuk fix.",
      }, { status: 400 });
    }

    return NextResponse.json({ error: `Action tidak dikenali: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("server-engine POST failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
