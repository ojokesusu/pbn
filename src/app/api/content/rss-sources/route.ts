import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const activeParam = searchParams.get("active");
    const language = searchParams.get("language")?.trim() || "";

    const where: Record<string, unknown> = {};
    if (activeParam === "true") where.active = true;
    else if (activeParam === "false") where.active = false;
    if (language) where.language = language;

    const items = await prisma.rssSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to list RSS sources:", error);
    return NextResponse.json(
      { error: "Failed to list RSS sources" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const language =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : "id";
    const region =
      typeof body.region === "string" && body.region.trim()
        ? body.region.trim()
        : "ID";
    const active = typeof body.active === "boolean" ? body.active : true;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const source = await prisma.rssSource.create({
      data: { name, url, language, region, active },
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error("Failed to create RSS source:", error);
    return NextResponse.json(
      { error: "Failed to create RSS source" },
      { status: 500 }
    );
  }
}
