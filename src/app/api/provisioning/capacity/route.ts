import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

type GroupRollup = {
  servers: number;
  slot: number;
  used: number;
};

type ServerDetail = {
  id: string;
  label: string;
  provider: string;
  region: string;
  tier: string;
  stack: string;
  domainCount: number;
  domainCap: number;
  usedPct: number;
  headroom: number;
};

function pct(used: number, slot: number): number {
  if (slot <= 0) return 0;
  return Math.round((used / slot) * 1000) / 10;
}

function bumpGroup(
  map: Map<string, GroupRollup>,
  key: string,
  slot: number,
  used: number,
) {
  const existing = map.get(key);
  if (existing) {
    existing.servers += 1;
    existing.slot += slot;
    existing.used += used;
  } else {
    map.set(key, { servers: 1, slot, used });
  }
}

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const servers = await prisma.server.findMany({
      include: { _count: { select: { domains: true } } },
      orderBy: { createdAt: "desc" },
    });

    const byTier = new Map<string, GroupRollup>();
    const byProvider = new Map<string, GroupRollup>();
    const byRegion = new Map<string, GroupRollup>();

    let totalSlot = 0;
    let totalUsed = 0;

    const serverDetails: ServerDetail[] = servers.map((server) => {
      const domainCount = server._count?.domains ?? 0;
      const domainCap = server.domainCap ?? 0;
      const tier = server.tier || "unknown";
      const provider = server.provider || "unknown";
      const region = server.region || "unknown";

      totalSlot += domainCap;
      totalUsed += domainCount;

      bumpGroup(byTier, tier, domainCap, domainCount);
      bumpGroup(byProvider, provider, domainCap, domainCount);
      bumpGroup(byRegion, region, domainCap, domainCount);

      return {
        id: server.id,
        label: server.label,
        provider,
        region,
        tier,
        stack: server.stack || "",
        domainCount,
        domainCap,
        usedPct: pct(domainCount, domainCap),
        headroom: Math.max(0, domainCap - domainCount),
      };
    });

    const total = {
      servers: servers.length,
      slot: totalSlot,
      used: totalUsed,
      available: Math.max(0, totalSlot - totalUsed),
      pct: pct(totalUsed, totalSlot),
    };

    const byTierArr = Array.from(byTier.entries())
      .map(([tier, g]) => ({
        tier,
        servers: g.servers,
        slot: g.slot,
        used: g.used,
        pct: pct(g.used, g.slot),
      }))
      .sort((a, b) => a.tier.localeCompare(b.tier));

    const byProviderArr = Array.from(byProvider.entries())
      .map(([provider, g]) => ({
        provider,
        servers: g.servers,
        slot: g.slot,
        used: g.used,
        pct: pct(g.used, g.slot),
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider));

    const byRegionArr = Array.from(byRegion.entries())
      .map(([region, g]) => ({
        region,
        servers: g.servers,
        slot: g.slot,
        used: g.used,
        pct: pct(g.used, g.slot),
      }))
      .sort((a, b) => a.region.localeCompare(b.region));

    return NextResponse.json({
      total,
      byTier: byTierArr,
      byProvider: byProviderArr,
      byRegion: byRegionArr,
      servers: serverDetails,
    });
  } catch (error) {
    console.error("Failed to compute provisioning capacity:", error);
    return NextResponse.json(
      { error: "Failed to compute provisioning capacity" },
      { status: 500 },
    );
  }
}
