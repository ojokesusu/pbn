import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncDomainDns, bareDomain } from "@/lib/cloudflare";
import { denyIfNotAdmin } from "@/lib/auth";
import { notify } from "@/lib/notifications";

interface SwitchResult {
  id: string;
  url: string;
  domain: string;
  status: "success" | "failed";
  message: string;
}

const MAX_BATCH = 25;

// POST — bulk switch server for a chunk of domains, then sync each to Cloudflare
// body: { domainIds: string[], toServerId: string, proxied?: boolean, lastChunk?: boolean }
//   - lastChunk: when true, emit a summary notification (frontend sets this on the final batch)
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { domainIds, toServerId, proxied, lastChunk } = body as {
      domainIds?: string[];
      toServerId?: string;
      proxied?: boolean;
      lastChunk?: boolean;
    };

    if (!Array.isArray(domainIds) || domainIds.length === 0) {
      return NextResponse.json({ error: "domainIds required (non-empty array)" }, { status: 400 });
    }
    if (domainIds.length > MAX_BATCH) {
      return NextResponse.json({ error: `Batch maksimal ${MAX_BATCH} domain per request` }, { status: 400 });
    }
    if (!toServerId || typeof toServerId !== "string") {
      return NextResponse.json({ error: "toServerId required" }, { status: 400 });
    }

    const targetServer = await prisma.server.findUnique({
      where: { id: toServerId },
      select: { id: true, label: true, host: true },
    });
    if (!targetServer) {
      return NextResponse.json({ error: "Target server tidak ditemukan" }, { status: 404 });
    }
    if (!targetServer.host) {
      return NextResponse.json({ error: "Target server tidak punya host/IP" }, { status: 400 });
    }

    // Update serverId for all selected domains in one transaction
    await prisma.domain.updateMany({
      where: { id: { in: domainIds } },
      data: { serverId: toServerId },
    });

    // Re-fetch the domains we just updated to get url/name
    const domains = await prisma.domain.findMany({
      where: { id: { in: domainIds } },
      select: { id: true, name: true, url: true },
    });

    // Sync each to Cloudflare (sequentially to respect CF rate limit ~4 req/s sustained)
    const results: SwitchResult[] = [];
    let success = 0;
    let failed = 0;

    for (const d of domains) {
      const bare = bareDomain(d.url);
      try {
        const r = await syncDomainDns(bare, targetServer.host, proxied);
        const aMsg = r.aRecord.action === "unchanged"
          ? "A unchanged"
          : r.aRecord.action === "created"
          ? `A created → ${targetServer.host}`
          : `A: ${r.aRecord.from} → ${targetServer.host}`;
        const wMsg = r.wwwRecord.action === "unchanged"
          ? "www unchanged"
          : r.wwwRecord.action === "created"
          ? "www created"
          : "www updated";
        results.push({
          id: d.id,
          url: d.url,
          domain: bare,
          status: "success",
          message: `${aMsg} | ${wMsg}`,
        });
        success++;
      } catch (err) {
        results.push({
          id: d.id,
          url: d.url,
          domain: bare,
          status: "failed",
          message: String(err).replace(/^Error:\s*/, "").substring(0, 200),
        });
        failed++;
      }
    }

    if (lastChunk) {
      await notify({
        type: "info",
        title: "Bulk Switch Server selesai",
        message: `Server target: ${targetServer.label || targetServer.host}. Lihat summary di Import page.`,
        severity: failed === 0 ? "success" : "warning",
        link: "/import",
      });
    }

    return NextResponse.json({
      summary: { total: domains.length, success, failed },
      results,
    });
  } catch (error) {
    console.error("Bulk switch server failed:", error);
    return NextResponse.json(
      { error: `Bulk switch gagal: ${String(error).substring(0, 200)}` },
      { status: 500 }
    );
  }
}
