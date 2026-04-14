// ── Server-Side Scheduler ──
// Runs the scheduler tick automatically on the server (no browser tab needed).
// Uses setInterval at module level — starts when the Next.js server starts.
// Tick interval: 10 minutes (same as the old browser-based approach).

import { processSchedulerTick, getSchedulerConfig } from "./scheduler";

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastTick: Date | null = null;
let lastResult: {
  processed: number;
  generated: number;
  deployed: number;
  purged: number;
  backlinksPlaced: number;
  errors: string[];
} | null = null;

const TICK_INTERVAL = 10 * 60 * 1000; // 10 minutes

async function tick() {
  // Check if scheduler is enabled in config
  try {
    const config = await getSchedulerConfig();
    if (!config.isRunning) return;

    console.log(`[Scheduler] Tick at ${new Date().toLocaleString("id-ID")}`);
    lastTick = new Date();

    const result = await processSchedulerTick();
    lastResult = result;

    if (result.generated > 0 || result.deployed > 0 || result.backlinksPlaced > 0 || result.errors.length > 0) {
      console.log(
        `[Scheduler] Done: ${result.generated} articles, ${result.deployed} deploys, ${result.purged} purges, ${result.backlinksPlaced} backlinks, ${result.errors.length} errors`
      );
    }
  } catch (err) {
    console.error("[Scheduler] Tick error:", err);
  }
}

export function startServerScheduler() {
  if (isRunning) return;
  isRunning = true;

  console.log("[Scheduler] Server-side scheduler started (every 10 minutes)");

  // First tick after 30 seconds (give server time to fully start)
  setTimeout(() => {
    tick();
  }, 30_000);

  // Then every 10 minutes
  intervalId = setInterval(tick, TICK_INTERVAL);
}

export function stopServerScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  console.log("[Scheduler] Server-side scheduler stopped");
}

export function getServerSchedulerStatus() {
  return {
    isRunning,
    lastTick,
    lastResult,
    tickInterval: TICK_INTERVAL,
  };
}

// Auto-start when this module is first imported on the server
if (typeof window === "undefined") {
  startServerScheduler();
}
