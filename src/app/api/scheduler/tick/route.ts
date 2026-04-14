import { NextResponse } from "next/server";
import { processSchedulerTick } from "@/lib/scheduler";

// POST /api/scheduler/tick — trigger the scheduler to process due jobs
// In production, this would be called by a cron job every 10-15 minutes
// For now, the dashboard UI can call it manually or set up a browser-based interval
export async function POST() {
  try {
    const result = await processSchedulerTick();
    return NextResponse.json({
      message: `Tick processed: ${result.generated} articles, ${result.deployed} deploys, ${result.purged} purges`,
      ...result,
    });
  } catch (error) {
    console.error("Scheduler tick failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
