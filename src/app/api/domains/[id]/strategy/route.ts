import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Operator-pin endpoint for switching a domain's link-building strategy.
// Whitehat = conservative anchor mix + low velocity.
// Greyhat  = moderate exact-match anchors + medium velocity.
// Blackhat = aggressive anchor + high velocity (burner domains only).
// Admin-only because changing the strategy reshapes downstream backlink/scheduler
// behavior; we don't want operator-tier users flipping this by accident.
const ALLOWED = new Set(["whitehat", "greyhat", "blackhat"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const strategy = typeof body.strategy === "string" ? body.strategy.trim() : "";

    if (!ALLOWED.has(strategy)) {
      return NextResponse.json(
        { error: "strategy must be one of: whitehat, greyhat, blackhat" },
        { status: 400 }
      );
    }

    const existing = await prisma.domain.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const updated = await prisma.domain.update({
      where: { id },
      data: { strategy },
      select: { id: true, strategy: true },
    });

    return NextResponse.json({ success: true, id: updated.id, strategy: updated.strategy });
  } catch (error) {
    console.error("Failed to update domain strategy:", error);
    return NextResponse.json(
      { error: "Failed to update domain strategy" },
      { status: 500 }
    );
  }
}
