import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listAllZones, bareDomain, type CfZone } from "@/lib/cloudflare";
import { getCurrentUser, denyIfNotAdmin } from "@/lib/auth";
import { notify } from "@/lib/notifications";

export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Pull ALL zones from Cloudflare (one-shot, cached for this request)
    const zones = await listAllZones();

    // Build a map: bare domain → zone (lowercased for safe lookup)
    const zoneMap = new Map<string, CfZone>();
    for (const z of zones) {
      zoneMap.set(z.name.toLowerCase().trim(), z);
    }

    // 2. Pull all servers with their attached domains
    const servers = await prisma.server.findMany({
      include: {
        domains: {
          select: { id: true, url: true, name: true, isAlive: true, httpStatus: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const stats = {
      serversTotal: servers.length,
      serversUpdated: 0,
      serversUnchanged: 0,
      serversSkipped: 0, // no domain attached
      domainsChecked: 0,
      zonesActive: 0,
      zonesPending: 0,
      zonesNotFound: 0,
      zonesOtherStatus: {} as Record<string, number>,
    };

    const details: Array<{
      serverName: string;
      serverHost: string;
      domain: string;
      zoneStatus: string;
      nsBefore: string;
      nsAfter: string;
      changed: boolean;
    }> = [];

    for (const server of servers) {
      if (server.domains.length === 0) {
        stats.serversSkipped++;
        continue;
      }

      // Use the first attached domain as the anchor for NS lookup
      const firstDomain = server.domains[0];
      const bare = bareDomain(firstDomain.url);
      stats.domainsChecked++;

      const zone = zoneMap.get(bare);

      if (!zone) {
        stats.zonesNotFound++;
        details.push({
          serverName: server.name,
          serverHost: server.host,
          domain: bare,
          zoneStatus: "not-in-cloudflare",
          nsBefore: `${server.name} / ${server.nameserver2}`,
          nsAfter: "—",
          changed: false,
        });
        continue;
      }

      // Track zone status
      if (zone.status === "active") stats.zonesActive++;
      else if (zone.status === "pending") stats.zonesPending++;
      else stats.zonesOtherStatus[zone.status] = (stats.zonesOtherStatus[zone.status] || 0) + 1;

      const cfNs = zone.name_servers || [];
      const ns1 = cfNs[0] || server.name;
      const ns2 = cfNs[1] || server.nameserver2;

      const nsBefore = `${server.name} / ${server.nameserver2 || "—"}`;
      const nsAfter = `${ns1} / ${ns2 || "—"}`;

      // Skip update if no change
      if (ns1 === server.name && ns2 === server.nameserver2) {
        stats.serversUnchanged++;
        details.push({
          serverName: server.name,
          serverHost: server.host,
          domain: bare,
          zoneStatus: zone.status,
          nsBefore,
          nsAfter,
          changed: false,
        });
        continue;
      }

      await prisma.server.update({
        where: { id: server.id },
        data: {
          name: ns1,
          nameserver2: ns2 || "",
        },
      });
      stats.serversUpdated++;
      details.push({
        serverName: server.name,
        serverHost: server.host,
        domain: bare,
        zoneStatus: zone.status,
        nsBefore,
        nsAfter,
        changed: true,
      });
    }

    // Notification
    if (stats.serversUpdated > 0) {
      await notify({
        type: "info",
        title: `☁️ Cloudflare sync selesai`,
        message: `${stats.serversUpdated} server diupdate · ${stats.zonesActive} zone active · ${stats.zonesNotFound} zone tidak ditemukan`,
        severity: "success",
        link: "/servers",
      });
    }

    return NextResponse.json({
      message: `Sync selesai: ${stats.serversUpdated} updated, ${stats.serversUnchanged} unchanged, ${stats.zonesNotFound} zone hilang`,
      stats,
      details,
    });
  } catch (error) {
    console.error("Sync cloudflare error:", error);
    return NextResponse.json(
      { error: `Sync gagal: ${String(error).substring(0, 200)}` },
      { status: 500 }
    );
  }
}
