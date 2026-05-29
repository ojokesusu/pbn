import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function truncateLog(log: string): string {
  if (!log) return "";
  return log.split("\n").slice(-200).join("\n");
}

function scrubResultJson(json: string): string {
  if (!json) return json;
  try {
    const parsed = JSON.parse(json);
    const scrubbed = JSON.parse(JSON.stringify(parsed, (key, value) => {
      if (typeof key === "string" && /password|secret|token|key/i.test(key)) {
        return typeof value === "string" && value.length > 4 ? "***" + value.slice(-4) : "***";
      }
      return value;
    }));
    return JSON.stringify(scrubbed);
  } catch {
    return json;
  }
}

function scrubLog(log: string): string {
  if (!log) return log;
  return log
    .replace(/FTP_PASSWORD:[^\s\n]*/g, "FTP_PASSWORD:***")
    .replace(/password[=:]\s*\S+/gi, "password=***");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await denyIfNotAdmin();
    if (denied) return denied;

    const { id } = await params;

    const batch = await prisma.provisionBatch.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
          include: {
            server: {
              select: {
                id: true,
                label: true,
                host: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    return NextResponse.json({
      batch: {
        id: batch.id,
        name: batch.name,
        provider: batch.provider,
        region: batch.region,
        tier: batch.tier,
        status: batch.status,
        totalTargets: batch.totalTargets,
        pendingCount: batch.pendingCount,
        runningCount: batch.runningCount,
        completedCount: batch.completedCount,
        failedCount: batch.failedCount,
        createdAt: batch.createdAt?.toISOString() ?? null,
        updatedAt: batch.updatedAt?.toISOString() ?? null,
        tasks: batch.tasks.map((task) => ({
          id: task.id,
          label: task.label,
          host: task.host,
          status: task.status,
          progress: task.progress,
          currentStep: task.currentStep,
          log: scrubLog(truncateLog(task.log)),
          errorMessage: task.errorMessage,
          startedAt: task.startedAt?.toISOString() ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
          createdAt: task.createdAt?.toISOString() ?? null,
          updatedAt: task.updatedAt?.toISOString() ?? null,
          resultJson: scrubResultJson(task.resultJson),
          retries: task.retries,
          serverId: task.serverId,
          server: task.server
            ? {
                id: task.server.id,
                label: task.server.label,
                host: task.server.host,
              }
            : null,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch provision batch:", error);
    return NextResponse.json(
      { error: "Failed to fetch provision batch" },
      { status: 500 }
    );
  }
}
