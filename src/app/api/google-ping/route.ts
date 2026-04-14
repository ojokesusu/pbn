import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitToIndexNow, getPingStats } from "@/lib/google-ping";

// GET /api/google-ping — Get indexing stats + history
export async function GET() {
  try {
    const stats = await getPingStats();

    const [deployedCount, neverPingedCount] = await Promise.all([
      prisma.domain.count({ where: { lastDeployed: { not: null } } }),
      // Deployed but never submitted to IndexNow
      prisma.domain.count({
        where: {
          lastDeployed: { not: null },
          NOT: {
            deployLogs: { some: { action: { in: ["ping", "indexnow"] } } },
          },
        },
      }),
    ]);

    return NextResponse.json({ ...stats, deployedCount, neverPingedCount });
  } catch (error) {
    console.error("Indexing stats error:", error);
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}

// POST /api/google-ping — Submit to IndexNow (single or bulk)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { domainId, domainIds, mode } = body;

    // Single submission
    if (domainId) {
      const result = await submitToIndexNow(domainId);
      return NextResponse.json({ success: true, result });
    }

    // Bulk: specific domain IDs
    if (domainIds && Array.isArray(domainIds)) {
      return await bulkSubmit(domainIds);
    }

    // Mode-based bulk
    if (mode === "deployed" || mode === "never-pinged") {
      const where =
        mode === "never-pinged"
          ? {
              lastDeployed: { not: null } as const,
              NOT: { deployLogs: { some: { action: { in: ["ping", "indexnow"] } } } },
            }
          : { lastDeployed: { not: null } as const };

      const domains = await prisma.domain.findMany({
        where,
        select: { id: true },
        take: 50,
      });

      return await bulkSubmit(domains.map((d) => d.id));
    }

    return NextResponse.json({ error: "domainId, domainIds, or mode required" }, { status: 400 });
  } catch (error) {
    console.error("IndexNow error:", error);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}

async function bulkSubmit(domainIds: string[]) {
  const results = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < domainIds.length; i++) {
    try {
      const result = await submitToIndexNow(domainIds[i]);
      results.push(result);
      if (result.success) success++;
      else failed++;
    } catch {
      failed++;
    }
    // Delay between submissions to avoid rate limiting
    if (i < domainIds.length - 1) {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000));
    }
  }

  return NextResponse.json({
    success: true,
    total: domainIds.length,
    indexNowSuccess: success,
    failed,
    results,
  });
}
