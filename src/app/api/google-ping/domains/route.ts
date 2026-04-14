import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/google-ping/domains — List all deployed domains with their ping status
export async function GET() {
  try {
    // Get all deployed domains
    const domains = await prisma.domain.findMany({
      where: { lastDeployed: { not: null } },
      select: {
        id: true,
        name: true,
        url: true,
        genre: true,
        lastDeployed: true,
        server: { select: { name: true, host: true } },
        deployLogs: {
          where: { action: { in: ["ping", "indexnow"] } },
          orderBy: { deployedAt: "desc" },
          take: 1,
          select: { status: true, message: true, deployedAt: true },
        },
      },
      orderBy: { lastDeployed: "desc" },
    });

    const pinged: typeof formatted = [];
    const notPinged: typeof formatted = [];

    const formatted = domains.map((d) => {
      const lastPing = d.deployLogs[0] || null;
      return {
        id: d.id,
        name: d.name,
        url: d.url,
        genre: d.genre,
        lastDeployed: d.lastDeployed,
        serverName: d.server?.name || "",
        serverHost: d.server?.host || "",
        isPinged: !!lastPing,
        pingStatus: lastPing?.status || null,
        pingMessage: lastPing?.message || null,
        lastPinged: lastPing?.deployedAt || null,
      };
    });

    for (const d of formatted) {
      if (d.isPinged) pinged.push(d);
      else notPinged.push(d);
    }

    return NextResponse.json({
      total: formatted.length,
      pingedCount: pinged.length,
      notPingedCount: notPinged.length,
      pinged,
      notPinged,
    });
  } catch (error) {
    console.error("Google Ping domains error:", error);
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 });
  }
}
