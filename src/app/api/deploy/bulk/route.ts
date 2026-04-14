import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deployDomain } from "@/lib/deploy";

// POST — bulk deploy
// body: { limit?: number, offset?: number, filter?: "hasContent" | "all", domainIds?: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { limit, offset, filter = "hasContent", domainIds, concurrency = 3 } = body;

    let domains;
    if (domainIds && Array.isArray(domainIds) && domainIds.length > 0) {
      domains = await prisma.domain.findMany({
        where: { id: { in: domainIds } },
        select: { id: true, url: true },
        orderBy: { createdAt: "asc" },
      });
    } else {
      const where = filter === "hasContent"
        ? { articles: { some: {} }, server: { isNot: null } }
        : { server: { isNot: null } };

      domains = await prisma.domain.findMany({
        where,
        select: { id: true, url: true },
        orderBy: { createdAt: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    }

    if (domains.length === 0) {
      return NextResponse.json({
        message: "Tidak ada domain untuk di-deploy",
        summary: { total: 0, success: 0, failed: 0, totalFiles: 0 },
        results: [],
      });
    }

    // Deploy in parallel batches (3 at a time — FTP is slow + risky to overload)
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    let totalFiles = 0;

    for (let i = 0; i < domains.length; i += concurrency) {
      const batch = domains.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(d => deployDomain(d.id))
      );
      results.push(...batchResults);
      for (const r of batchResults) {
        if (r.status === "success") {
          successCount++;
          totalFiles += r.filesDeployed;
        } else {
          failedCount++;
        }
      }
    }

    return NextResponse.json({
      message: `Bulk deploy selesai: ${successCount} success, ${failedCount} failed, ${totalFiles} files uploaded`,
      summary: {
        total: domains.length,
        success: successCount,
        failed: failedCount,
        totalFiles,
      },
      results,
    });
  } catch (error) {
    console.error("Bulk deploy failed:", error);
    return NextResponse.json(
      { error: `Bulk deploy gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}

// GET — stats about deploy-ready domains
export async function GET() {
  try {
    const total = await prisma.domain.count({
      where: { articles: { some: {} }, server: { isNot: null } },
    });
    const alreadyDeployed = await prisma.domain.count({
      where: {
        articles: { some: {} },
        server: { isNot: null },
        lastDeployed: { not: null },
      },
    });
    const neverDeployed = total - alreadyDeployed;
    const totalArticles = await prisma.article.count();

    return NextResponse.json({
      readyDomains: total,
      alreadyDeployed,
      neverDeployed,
      totalArticles,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
