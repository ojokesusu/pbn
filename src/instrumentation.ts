export async function register() {
  // Server-side scheduler: auto-tick every 10 minutes
  // Only runs on the server (not during build or client)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDefaultAdmin } = await import("./lib/auth");
    await ensureDefaultAdmin().catch((e) => console.error("[auth] seed failed", e));

    const { startServerScheduler } = await import("./lib/server-scheduler");
    startServerScheduler();
  }
}
