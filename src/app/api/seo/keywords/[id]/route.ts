import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/seo/keywords/[id]
// Body: { active?: boolean }
// Toggle a keyword between active (auto-checked daily) and paused. We keep
// the shape narrow so this can't be repurposed as a generic editor — the
// scheduler reads `active` to decide whether to enqueue a check.
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
    if (typeof body.active === "boolean") data.active = body.active;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No supported fields provided (allowed: active)" },
        { status: 400 }
      );
    }

    const existing = await prisma.rankKeyword.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
    }

    const updated = await prisma.rankKeyword.update({
      where: { id },
      data,
      select: { id: true, active: true },
    });

    return NextResponse.json({ success: true, ...updated });
  } catch (error) {
    console.error("Failed to patch rank keyword:", error);
    return NextResponse.json(
      { error: "Failed to patch rank keyword" },
      { status: 500 }
    );
  }
}

// DELETE /api/seo/keywords/[id]
// Cascades to RankSnapshot via the schema (onDelete: Cascade) so the operator
// gets a clean wipe — no orphan snapshots lingering for a removed keyword.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;

    const existing = await prisma.rankKeyword.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
    }

    await prisma.rankKeyword.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete rank keyword:", error);
    return NextResponse.json(
      { error: "Failed to delete rank keyword" },
      { status: 500 }
    );
  }
}
