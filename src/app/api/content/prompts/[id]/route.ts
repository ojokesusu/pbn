import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.niche === "string") data.niche = body.niche.trim();
    if (typeof body.systemPrompt === "string") data.systemPrompt = body.systemPrompt;
    if (typeof body.userTemplate === "string") data.userTemplate = body.userTemplate;
    if (typeof body.active === "boolean") data.active = body.active;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const prompt = await prisma.promptTemplate.update({ where: { id }, data });
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("Failed to update prompt template:", error);
    return NextResponse.json(
      { error: "Failed to update prompt template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    await prisma.promptTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete prompt template:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt template" },
      { status: 500 }
    );
  }
}
