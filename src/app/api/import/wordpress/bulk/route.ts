import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { importWordPressForDomain } from "@/lib/wordpress";

// POST — bulk import WordPress content for all alive WP domains
// body: { limit?: number, offset?: number, maxArticlesPerSite?: number, domainIds?: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { limit, offset, maxArticlesPerSite = 20, domainIds } = body;

    // Build query — alive + has WordPress detected
    let domains;
    if (domainIds && Array.isArray(domainIds) && domainIds.length > 0) {
      domains = await prisma.domain.findMany({
        where: { id: { in: domainIds } },
        select: { id: true, url: true },
        orderBy: { createdAt: "asc" },
      });
    } else {
      domains = await prisma.domain.findMany({
        where: {
          isAlive: true,
          hasWordPress: true,
        },
        select: { id: true, url: true },
        orderBy: { createdAt: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    }

    if (domains.length === 0) {
      return NextResponse.json({
        message: "Tidak ada domain WordPress aktif untuk diimport",
        summary: { total: 0, success: 0, failed: 0, totalArticles: 0 },
        results: [],
      });
    }

    // Process domains in parallel batches (5 at a time to avoid overwhelming)
    const concurrency = 5;
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    let totalArticles = 0;

    for (let i = 0; i < domains.length; i += concurrency) {
      const batch = domains.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(d =>
          importWordPressForDomain(d.id, {
            maxArticlesPerSite,
            prioritizeBacklinkTargets: true,
          })
        )
      );
      results.push(...batchResults);
      for (const r of batchResults) {
        if (r.status === "success") {
          successCount++;
          totalArticles += r.imported;
        } else {
          failedCount++;
        }
      }
    }

    return NextResponse.json({
      message: `Bulk import selesai: ${successCount} success, ${failedCount} failed, ${totalArticles} artikel diimport`,
      summary: {
        total: domains.length,
        success: successCount,
        failed: failedCount,
        totalArticles,
      },
      results,
    });
  } catch (error) {
    console.error("Bulk WP import failed:", error);
    return NextResponse.json(
      { error: `Bulk import gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}

// GET — return stats about WP-ready domains
export async function GET() {
  try {
    const total = await prisma.domain.count({
      where: { isAlive: true, hasWordPress: true },
    });
    const totalPostsAvailable = await prisma.domain.aggregate({
      where: { isAlive: true, hasWordPress: true },
      _sum: { wpPostCount: true },
    });
    const alreadyImported = await prisma.domain.count({
      where: {
        isAlive: true,
        hasWordPress: true,
        articles: { some: {} },
      },
    });
    const totalArticlesInDb = await prisma.article.count();

    return NextResponse.json({
      readyDomains: total,
      alreadyImported,
      remainingDomains: total - alreadyImported,
      totalPostsAvailable: totalPostsAvailable._sum.wpPostCount || 0,
      articlesInDb: totalArticlesInDb,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
