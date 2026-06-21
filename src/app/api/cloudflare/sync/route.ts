import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncDomainDns, bareDomain } from "@/lib/cloudflare";
import { denyIfNotAdmin } from "@/lib/auth";

interface SyncResult {
  domain: string;
  url: string;
  status: "success" | "failed" | "skipped";
  message: string;
  aRecord?: string;
  wwwRecord?: string;
}

// POST — sync DNS for one domain or all domains
// body: { domainId?: string, all?: boolean, limit?: number, offset?: number }
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json();
    const { domainId, all, limit, offset } = body;

    let domains: Array<{ id: string; name: string; url: string; server: { host: string } | null }>;

    if (domainId) {
      // Sync single domain
      const d = await prisma.domain.findUnique({
        where: { id: domainId },
        include: { server: { select: { host: true } } },
      });
      if (!d) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 });
      domains = [d];
    } else if (all) {
      // Sync all domains (with optional pagination for batching)
      domains = await prisma.domain.findMany({
        include: { server: { select: { host: true } } },
        orderBy: { createdAt: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else {
      return NextResponse.json({ error: "Specify domainId or all=true" }, { status: 400 });
    }

    const results: SyncResult[] = [];
    let success = 0, failed = 0, skipped = 0;

    for (const d of domains) {
      const bare = bareDomain(d.url);
      const ip = d.server?.host;

      if (!ip) {
        results.push({
          domain: bare,
          url: d.url,
          status: "skipped",
          message: "Tidak ada server IP",
        });
        skipped++;
        continue;
      }

      try {
        const result = await syncDomainDns(bare, ip);
        const aMsg = result.aRecord.action === "unchanged"
          ? "OK"
          : result.aRecord.action === "created"
          ? `created → ${ip}`
          : `${result.aRecord.from} → ${ip}`;
        const wwwMsg = result.wwwRecord.action === "unchanged"
          ? "OK"
          : result.wwwRecord.action === "created"
          ? `created`
          : `updated`;

        results.push({
          domain: bare,
          url: d.url,
          status: "success",
          message: `A: ${aMsg} | www: ${wwwMsg}`,
          aRecord: aMsg,
          wwwRecord: wwwMsg,
        });
        success++;
      } catch (err) {
        results.push({
          domain: bare,
          url: d.url,
          status: "failed",
          message: String(err).replace("Error: ", "").substring(0, 200),
        });
        failed++;
      }
    }

    return NextResponse.json({
      message: `Sync selesai: ${success} success, ${failed} failed, ${skipped} skipped`,
      summary: { total: domains.length, success, failed, skipped },
      results,
    });
  } catch (error) {
    console.error("DNS Sync failed:", error);
    return NextResponse.json(
      { error: `DNS Sync gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}
