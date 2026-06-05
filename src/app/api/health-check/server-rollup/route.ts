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
          select: { id: true, isAlive: true, lastChecked: true },
        },
      },
      orderBy: [{ label: "asc" }, { name: "asc" }],
    });

    const rows = servers.map((s) => {
      const total = s.domains.length;
      const alive = s.domains.filter((d) => d.isAlive).length;
      const alivePct = total > 0 ? Math.round((alive / total) * 1000) / 10 : 0;
      return {
        id: s.id,
        label: s.label || s.name,
        host: s.host,
        total,
        alive,
        alivePct,
      };
    });

    return NextResponse.json({ servers: rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
