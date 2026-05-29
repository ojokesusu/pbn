import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// GET /api/provisioning/health
// Return the latest HealthCheck row for EACH server (1 row per server),
// joined with server metadata + computed % fields and stale flag.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    // Fetch every server with its single most-recent HealthCheck
    const servers = await prisma.server.findMany({
      include: {
        healthChecks: {
          orderBy: { checkedAt: "desc" },
          take: 1,
        },
      },
    });

    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const rows = servers.map((srv) => {
      const hc = srv.healthChecks[0];

      const ramUsedMb = hc?.ramUsedMb ?? 0;
      const ramTotalMb = hc?.ramTotalMb ?? 0;
      const diskUsedGb = hc?.diskUsedGb ?? 0;
      const diskTotalGb = hc?.diskTotalGb ?? 0;
      const domainCount = hc?.domainCount ?? 0;
      const domainCap = srv.domainCap ?? 0;

      const ramUsedPct = ramTotalMb > 0 ? (ramUsedMb / ramTotalMb) * 100 : 0;
      const diskUsedPct = diskTotalGb > 0 ? (diskUsedGb / diskTotalGb) * 100 : 0;
      const capacityUsedPct = domainCap > 0 ? (domainCount / domainCap) * 100 : 0;

      const checkedAtDate = hc?.checkedAt ?? null;
      const isStale = checkedAtDate
        ? now - new Date(checkedAtDate).getTime() > ONE_HOUR_MS
        : true;

      return {
        serverId: srv.id,
        label: srv.label,
        host: srv.host,
        provider: srv.provider,
        region: srv.region,
        tier: srv.tier,
        stack: srv.stack,
        domainCap,
        olsRunning: hc?.olsRunning ?? false,
        phpVersion: hc?.phpVersion ?? "",
        ftpStatus: hc?.ftpStatus ?? "",
        ramUsedMb,
        ramTotalMb,
        ramUsedPct,
        diskUsedGb,
        diskTotalGb,
        diskUsedPct,
        domainCount,
        capacityUsedPct,
        loadAvg1: hc?.loadAvg1 ?? 0,
        errorMessage: hc?.errorMessage ?? "",
        checkedAt: checkedAtDate ? new Date(checkedAtDate).toISOString() : "",
        isStale,
      };
    });

    // Sort: servers with errorMessage first, then by label A→Z
    rows.sort((a, b) => {
      const aHasErr = a.errorMessage && a.errorMessage.length > 0 ? 1 : 0;
      const bHasErr = b.errorMessage && b.errorMessage.length > 0 ? 1 : 0;
      if (aHasErr !== bHasErr) return bHasErr - aHasErr;
      return (a.label || "").localeCompare(b.label || "");
    });

    const summary = {
      total: rows.length,
      healthy: rows.filter(
        (r) => r.olsRunning && !r.errorMessage && !r.isStale,
      ).length,
      unhealthy: rows.filter(
        (r) => (r.errorMessage && r.errorMessage.length > 0) || !r.olsRunning,
      ).length,
      stale: rows.filter((r) => r.isStale).length,
    };

    return NextResponse.json({ servers: rows, summary });
  } catch (error) {
    console.error("Provisioning health GET failed:", error);
    return NextResponse.json(
      { error: `Provisioning health gagal: ${String(error)}` },
      { status: 500 },
    );
  }
}
