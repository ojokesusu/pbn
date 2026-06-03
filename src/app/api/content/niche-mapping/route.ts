import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      2500,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10))
    );
    const niche = searchParams.get("niche")?.trim() || "";
    const domainId = searchParams.get("domainId")?.trim() || "";

    const where: Record<string, unknown> = {};
    if (niche) where.niche = niche;
    if (domainId) where.domainId = domainId;

    const [total, items] = await Promise.all([
      prisma.nicheMapping.count({ where }),
      prisma.nicheMapping.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          domain: {
            select: { id: true, name: true, url: true, genre: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Failed to list niche mappings:", error);
    return NextResponse.json(
      { error: "Failed to list niche mappings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const domainId = typeof body.domainId === "string" ? body.domainId.trim() : "";
    const niche = typeof body.niche === "string" ? body.niche.trim() : "";
    const language =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : "id";
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.filter((k: unknown): k is string => typeof k === "string")
      : [];

    if (!domainId) {
      return NextResponse.json({ error: "domainId is required" }, { status: 400 });
    }

    const mapping = await prisma.nicheMapping.upsert({
      where: { domainId },
      update: { niche, language, keywords },
      create: { domainId, niche, language, keywords },
    });

    return NextResponse.json({ mapping }, { status: 201 });
  } catch (error) {
    console.error("Failed to upsert niche mapping:", error);
    return NextResponse.json(
      { error: "Failed to upsert niche mapping" },
      { status: 500 }
    );
  }
}
