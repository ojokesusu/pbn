import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const niche = searchParams.get("niche")?.trim() || "";
    const activeParam = searchParams.get("active");

    const where: Record<string, unknown> = {};
    if (niche) where.niche = niche;
    if (activeParam === "true") where.active = true;
    else if (activeParam === "false") where.active = false;

    const items = await prisma.promptTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to list prompt templates:", error);
    return NextResponse.json(
      { error: "Failed to list prompt templates" },
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
    const niche = typeof body.niche === "string" ? body.niche.trim() : "";
    const systemPrompt =
      typeof body.systemPrompt === "string" ? body.systemPrompt : "";
    const userTemplate =
      typeof body.userTemplate === "string" ? body.userTemplate : "";
    const active = typeof body.active === "boolean" ? body.active : true;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!systemPrompt) {
      return NextResponse.json(
        { error: "systemPrompt is required" },
        { status: 400 }
      );
    }
    if (!userTemplate) {
      return NextResponse.json(
        { error: "userTemplate is required" },
        { status: 400 }
      );
    }

    const prompt = await prisma.promptTemplate.create({
      data: { name, niche, systemPrompt, userTemplate, active },
    });

    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    console.error("Failed to create prompt template:", error);
    return NextResponse.json(
      { error: "Failed to create prompt template" },
      { status: 500 }
    );
  }
}
