import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/seo/snapshots?keywordId=...&days=14
// Returns RankSnapshot rows for the given keyword over the last N days,
// oldest-first so a sparkline can render them directly without re-sorting.
// `days` is clamped to 1..90 — sparkline rarely needs more than 30 anyway,
// and unbounded queries against a hot table are how prod gets owned.
export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const keywordId = (searchParams.get("keywordId") || "").trim();
    const daysRaw = parseInt(searchParams.get("days") || "14", 10);
    const days = Math.min(90, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 14));

    if (!keywordId) {
      return NextResponse.json({ error: "keywordId is required" }, { status: 400 });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await prisma.rankSnapshot.findMany({
      where: {
        keywordId,
        checkedAt: { gte: since },
      },
      orderBy: { checkedAt: "asc" },
      select: {
        id: true,
        position: true,
        foundUrl: true,
        provider: true,
        costUsd: true,
        checkedAt: true,
      },
    });

    return NextResponse.json({
      keywordId,
      days,
      data: snapshots,
      total: snapshots.length,
    });
  } catch (error) {
    console.error("Failed to fetch rank snapshots:", error);
    return NextResponse.json(
      { error: "Failed to fetch rank snapshots" },
      { status: 500 }
    );
  }
}
