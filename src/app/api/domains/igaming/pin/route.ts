import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/domains/igaming/pin
// Body: { domainId: string }
//
// Manually pin a domain to the 'igaming' niche. Used by operators when a
// domain should host casino/slot/judi/togel content regardless of what the
// auto-detector would pick. Upserts NicheMapping so it's idempotent.
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const domainId = typeof body.domainId === "string" ? body.domainId.trim() : "";

    if (!domainId) {
      return NextResponse.json({ error: "domainId is required" }, { status: 400 });
    }

    // Confirm the domain exists — upsert without this check would silently
    // create a mapping row pointing at nothing if the caller fat-fingered.
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true },
    });
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    await prisma.nicheMapping.upsert({
      where: { domainId },
      update: { niche: "igaming" },
      create: {
        domainId,
        niche: "igaming",
        language: "id",
        keywords: ["igaming", "casino", "slot"],
      },
    });

    return NextResponse.json({ success: true, domainId, niche: "igaming" });
  } catch (error) {
    console.error("Failed to pin igaming domain:", error);
    return NextResponse.json(
      { error: "Failed to pin igaming domain" },
      { status: 500 }
    );
  }
}
