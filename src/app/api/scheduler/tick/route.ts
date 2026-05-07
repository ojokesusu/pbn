import { NextResponse } from "next/server";
import { processSchedulerTick } from "@/lib/scheduler";

// POST /api/scheduler/tick — trigger the scheduler to process due jobs
// Auto-triggered every 10 minutes by server-scheduler.ts (setInterval, server-side)
// Can also be called manually from the Scheduler page UI
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
