import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// GET /api/provisioning/workers
// Returns the list of provisioning worker daemons with liveness flags.
// A worker is considered alive if it has beat within the last 60 seconds.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const rows = await prisma.workerHeartbeat.findMany({
      orderBy: { lastBeatAt: "desc" },
    });

    const now = Date.now();

    const workers = rows.map((w) => {
      const lastBeatMs = new Date(w.lastBeatAt).getTime();
      const staleSeconds = Math.max(
        0,
        Math.floor((now - lastBeatMs) / 1000),
      );
      const isAlive = staleSeconds < 60;

      let runningTaskIds: string[] = [];
      try {
        const parsed = JSON.parse(w.runningTaskIds || "[]");
        if (Array.isArray(parsed)) {
          runningTaskIds = parsed.filter((x) => typeof x === "string");
        }
      } catch {
        runningTaskIds = [];
      }

      return {
        workerId: w.workerId,
        lastBeatAt: new Date(w.lastBeatAt).toISOString(),
        runningTaskIds,
        status: w.status,
        hostname: w.hostname,
        pid: w.pid,
        startedAt: new Date(w.startedAt).toISOString(),
        isAlive,
        staleSeconds,
      };
    });

    return NextResponse.json({ workers });
  } catch (error) {
    console.error("Provisioning workers GET failed:", error);
    return NextResponse.json(
      { error: `Provisioning workers gagal: ${String(error)}` },
      { status: 500 },
    );
  }
}
