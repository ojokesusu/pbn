import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// GET /api/health-check/server-rollup
// Roll-up of alive/total per server, used by the Server Roll-Up grid on /health-check.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const servers = await prisma.server.findMany({
      select: {
        id: true,
        label: true,
        name: true,
        host: true,
        domains: {
          select: { id: true, isAlive: true, lastDeployed: true },
        },
      },
      orderBy: [{ label: "asc" }, { name: "asc" }],
    });

    // "Suspect false-dead" = domains we marked dead but the deploy worker
    // (running on RDP, not Railway) successfully wrote files within the last
    // ~3 days. If the deploy SSH worked but our HTTP probe didn't, the
    // failure is more likely Railway egress / Indo routing than a dead
    // origin. Surface this so operators know which servers' "dead" counts
    // are probably inflated by network reachability rather than reality.
    const SUSPECT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const rows = servers.map((s) => {
      const total = s.domains.length;
      const alive = s.domains.filter((d) => d.isAlive).length;
      const alivePct = total > 0 ? Math.round((alive / total) * 1000) / 10 : 0;
      const suspectFalseDead = s.domains.filter(
        (d) =>
          !d.isAlive &&
          d.lastDeployed &&
          now - new Date(d.lastDeployed).getTime() < SUSPECT_WINDOW_MS,
      ).length;
      return {
        id: s.id,
        label: s.label || s.name,
        host: s.host,
        total,
        alive,
        alivePct,
        suspectFalseDead,
      };
    });

    return NextResponse.json({ servers: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
