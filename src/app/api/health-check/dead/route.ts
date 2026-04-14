import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/health-check/dead — list of all dead/unhealthy domains
export async function GET() {
  try {
    // Dead = was checked but isAlive=false
    const deadDomains = await prisma.domain.findMany({
      where: {
        lastChecked: { not: null },
        isAlive: false,
      },
      include: {
        server: { select: { id: true, name: true, host: true } },
      },
      orderBy: [
        { httpStatus: "asc" },
        { url: "asc" },
      ],
    });

    // Group by failure reason
    const byReason: Record<string, typeof deadDomains> = {};
    for (const d of deadDomains) {
      let reason: string;
      if (d.httpStatus === 0) reason = "Tidak bisa diakses (timeout / DNS / koneksi)";
      else if (d.httpStatus >= 500) reason = `Server error (${d.httpStatus})`;
      else if (d.httpStatus >= 400) reason = `Client error (${d.httpStatus})`;
      else reason = `Status ${d.httpStatus}`;

      if (!byReason[reason]) byReason[reason] = [];
      byReason[reason].push(d);
    }

    // Group by server (so team can fix multiple at once)
    const byServer: Record<string, { serverName: string; serverHost: string; domains: typeof deadDomains }> = {};
    for (const d of deadDomains) {
      const key = d.server?.id || "no-server";
      if (!byServer[key]) {
        byServer[key] = {
          serverName: d.server?.name || "(tanpa server)",
          serverHost: d.server?.host || "—",
          domains: [],
        };
      }
      byServer[key].domains.push(d);
    }

    return NextResponse.json({
      total: deadDomains.length,
      domains: deadDomains.map(d => ({
        id: d.id,
        url: d.url,
        name: d.name,
        genre: d.genre,
        httpStatus: d.httpStatus,
        lastChecked: d.lastChecked,
        server: d.server ? {
          id: d.server.id,
          name: d.server.name,
          host: d.server.host,
        } : null,
      })),
      byReason: Object.entries(byReason).map(([reason, list]) => ({
        reason,
        count: list.length,
      })),
      byServer: Object.values(byServer)
        .map(g => ({
          serverName: g.serverName,
          serverHost: g.serverHost,
          count: g.domains.length,
        }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
