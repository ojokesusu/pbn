import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/index-monitor — Get all deployed domains with index status
export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      where: { lastDeployed: { not: null } },
      select: {
        id: true,
        name: true,
        url: true,
        genre: true,
        indexStatus: true,
        lastIndexCheck: true,
        lastDeployed: true,
      },
      orderBy: { lastDeployed: "desc" },
    });

    const stats = {
      total: domains.length,
      indexed: domains.filter((d) => d.indexStatus === "indexed").length,
      notIndexed: domains.filter((d) => d.indexStatus === "not-indexed").length,
      unchecked: domains.filter((d) => d.indexStatus === "unchecked").length,
    };

    return NextResponse.json({ stats, domains });
  } catch (error) {
    console.error("Index monitor error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// PUT /api/index-monitor — Update index status for a domain
export async function PUT(request: Request) {
  try {
    const { domainId, indexStatus } = await request.json();

    if (!domainId || !["indexed", "not-indexed", "unchecked"].includes(indexStatus)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await prisma.domain.update({
      where: { id: domainId },
      data: {
        indexStatus,
        lastIndexCheck: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Index monitor update error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// POST /api/index-monitor — Bulk update index status
export async function POST(request: Request) {
  try {
    const { domainIds, indexStatus } = await request.json();

    if (!domainIds?.length || !["indexed", "not-indexed", "unchecked"].includes(indexStatus)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await prisma.domain.updateMany({
      where: { id: { in: domainIds } },
      data: {
        indexStatus,
        lastIndexCheck: new Date(),
      },
    });

    return NextResponse.json({ success: true, updated: domainIds.length });
  } catch (error) {
    console.error("Index monitor bulk error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
