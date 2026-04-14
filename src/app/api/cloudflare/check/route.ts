import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, listAllZones, bareDomain } from "@/lib/cloudflare";

// GET — verify token + check how many of our domains are on Cloudflare
export async function GET() {
  try {
    // Verify token
    const tokenInfo = await verifyToken();

    // Get all our domains
    const domains = await prisma.domain.findMany({
      include: { server: { select: { host: true } } },
    });

    // Get all Cloudflare zones
    const zones = await listAllZones();
    const zoneMap = new Map(zones.map(z => [z.name.toLowerCase(), z]));

    let onCloudflare = 0;
    let notOnCloudflare = 0;
    let pending = 0;
    const missing: string[] = [];
    const pendingList: string[] = [];

    for (const domain of domains) {
      const bare = bareDomain(domain.url);
      const zone = zoneMap.get(bare);
      if (!zone) {
        notOnCloudflare++;
        if (missing.length < 10) missing.push(bare);
      } else if (zone.status !== "active") {
        pending++;
        if (pendingList.length < 10) pendingList.push(`${bare} (${zone.status})`);
      } else {
        onCloudflare++;
      }
    }

    return NextResponse.json({
      token: { valid: true, status: tokenInfo.status },
      cloudflare: {
        totalZones: zones.length,
      },
      domains: {
        total: domains.length,
        withServer: domains.filter(d => d.server).length,
        onCloudflare,
        notOnCloudflare,
        pending,
        missingExamples: missing,
        pendingExamples: pendingList,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Cloudflare check gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}
