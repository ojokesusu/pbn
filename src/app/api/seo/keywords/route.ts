import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/seo/keywords
// Returns all RankKeyword rows plus their latest RankSnapshot for the table view.
// We deliberately fetch only the latest snapshot per keyword here — the deeper
// sparkline / history view goes through /api/seo/snapshots so the list page
// stays cheap to render even with hundreds of tracked keywords.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const keywords = await prisma.rankKeyword.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        domain: { select: { id: true, name: true, url: true } },
        snapshots: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: {
            id: true,
            position: true,
            foundUrl: true,
            checkedAt: true,
          },
        },
      },
    });

    const enriched = keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      domainId: k.domainId,
      domain: k.domain,
      targetUrl: k.targetUrl,
      locale: k.locale,
      region: k.region,
      device: k.device,
      active: k.active,
      source: k.source,
      lastChecked: k.lastChecked,
      createdAt: k.createdAt,
      latestSnapshot: k.snapshots[0] ?? null,
    }));

    return NextResponse.json({ data: enriched, total: enriched.length });
  } catch (error) {
    console.error("Failed to fetch rank keywords:", error);
    return NextResponse.json(
      { error: "Failed to fetch rank keywords" },
      { status: 500 }
    );
  }
}

// POST /api/seo/keywords
// Body: { keyword, domainId?, targetUrl?, locale?, region?, device? }
// Creates a new tracked keyword. Defaults to id/ID/desktop because the PBN
// operator base is Indonesia-focused; English / mobile can be set explicitly.
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    const domainId =
      typeof body.domainId === "string" && body.domainId.trim()
        ? body.domainId.trim()
        : null;
    const targetUrl =
      typeof body.targetUrl === "string" ? body.targetUrl.trim() : "";
    const locale = typeof body.locale === "string" && body.locale.trim() ? body.locale.trim() : "id";
    const region = typeof body.region === "string" && body.region.trim() ? body.region.trim() : "ID";
    const device =
      body.device === "mobile" ? "mobile" : "desktop";

    if (!keyword) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    // If a domainId was provided, confirm it exists — Prisma would throw on
    // create with a missing FK, but a clean 404 is easier to debug.
    if (domainId) {
      const domain = await prisma.domain.findUnique({
        where: { id: domainId },
        select: { id: true },
      });
      if (!domain) {
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });
      }
    }

    const created = await prisma.rankKeyword.create({
      data: {
        keyword,
        domainId,
        targetUrl,
        locale,
        region,
        device,
        source: "manual",
      },
      include: {
        domain: { select: { id: true, name: true, url: true } },
      },
    });

    return NextResponse.json(
      { ...created, latestSnapshot: null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create rank keyword:", error);
    return NextResponse.json(
      { error: "Failed to create rank keyword" },
      { status: 500 }
    );
  }
}
