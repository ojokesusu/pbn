import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

const SENSITIVE_KEYS = new Set([
  "ftp_password",
  "ftp_pass",
  "ftpPassword",
  "ssh_password",
  "sshPassword",
  "root_password",
  "rootPassword",
  "panel_password",
  "panelPassword",
  "admin_password",
  "adminPassword",
  "password",
  "passwd",
  "api_key",
  "apiKey",
  "secret",
  "token",
]);

function scrubResultJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => scrubResultJson(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = scrubResultJson(v);
      }
    }
    return out;
  }
  return value;
}

function scrubLog(log: string | null | undefined): string {
  if (!log) return log ?? "";
  let scrubbed = log;
  // Redact common password patterns in log lines
  scrubbed = scrubbed.replace(
    /(ftp[_-]?password|ssh[_-]?password|root[_-]?password|panel[_-]?password|admin[_-]?password|password|passwd|api[_-]?key|secret|token)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
    (_m, key, sep) => `${key}${sep}[REDACTED]`
  );
  return scrubbed;
}

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

    const task = await prisma.provisionTask.findUnique({
      where: { id },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            provider: true,
            status: true,
          },
        },
        server: {
          select: {
            id: true,
            label: true,
            host: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Provision task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      task: {
        id: task.id,
        batchId: task.batchId,
        label: task.label,
        host: task.host,
        sshUser: task.sshUser,
        provider: task.provider,
        region: task.region,
        tier: task.tier,
        status: task.status,
        progress: task.progress,
        currentStep: task.currentStep,
        log: scrubLog(task.log),
        errorMessage: task.errorMessage,
        startedAt: toIso(task.startedAt),
        completedAt: toIso(task.completedAt),
        resultJson: scrubResultJson(task.resultJson),
        serverId: task.serverId,
        retries: task.retries,
        createdAt: toIso(task.createdAt),
        updatedAt: toIso(task.updatedAt),
        batch: task.batch,
        server: task.server,
      },
    });
  } catch (error) {
    console.error("Failed to fetch provision task:", error);
    return NextResponse.json(
      { error: "Failed to fetch provision task" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action !== "retry") {
      return NextResponse.json(
        { error: "Unsupported action. Use { action: \"retry\" }." },
        { status: 400 }
      );
    }

    const existing = await prisma.provisionTask.findUnique({
      where: { id },
      select: { id: true, batchId: true, status: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Provision task not found" },
        { status: 404 }
      );
    }

    if (existing.status !== "failed") {
      return NextResponse.json(
        {
          error: `Task hanya bisa di-retry kalau status="failed" (saat ini: "${existing.status}").`,
        },
        { status: 400 }
      );
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
      const task = await tx.provisionTask.update({
        where: { id },
        data: {
          status: "pending",
          retries: { increment: 1 },
          errorMessage: "",
          log: "",
          progress: 0,
          currentStep: "",
          startedAt: null,
          completedAt: null,
        },
        include: {
          batch: {
            select: {
              id: true,
              name: true,
              provider: true,
              status: true,
            },
          },
          server: {
            select: {
              id: true,
              label: true,
              host: true,
            },
          },
        },
      });

      const batch = await tx.provisionBatch.findUnique({
        where: { id: existing.batchId },
        select: { failedCount: true, pendingCount: true, status: true },
      });

      if (batch) {
        const nextFailed = Math.max(0, batch.failedCount - 1);
        const nextPending = batch.pendingCount + 1;
        const nextStatus =
          batch.status === "completed" || batch.status === "failed"
            ? "running"
            : batch.status;

        await tx.provisionBatch.update({
          where: { id: existing.batchId },
          data: {
            failedCount: nextFailed,
            pendingCount: nextPending,
            status: nextStatus,
          },
        });
      }

      return task;
    });

    return NextResponse.json({
      task: {
        id: updatedTask.id,
        batchId: updatedTask.batchId,
        label: updatedTask.label,
        host: updatedTask.host,
        sshUser: updatedTask.sshUser,
        provider: updatedTask.provider,
        region: updatedTask.region,
        tier: updatedTask.tier,
        status: updatedTask.status,
        progress: updatedTask.progress,
        currentStep: updatedTask.currentStep,
        log: scrubLog(updatedTask.log),
        errorMessage: updatedTask.errorMessage,
        startedAt: toIso(updatedTask.startedAt),
        completedAt: toIso(updatedTask.completedAt),
        resultJson: scrubResultJson(updatedTask.resultJson),
        serverId: updatedTask.serverId,
        retries: updatedTask.retries,
        createdAt: toIso(updatedTask.createdAt),
        updatedAt: toIso(updatedTask.updatedAt),
        batch: updatedTask.batch,
        server: updatedTask.server,
      },
    });
  } catch (error) {
    console.error("Failed to retry provision task:", error);
    return NextResponse.json(
      { error: "Failed to retry provision task" },
      { status: 500 }
    );
  }
}
