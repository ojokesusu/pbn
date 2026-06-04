import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";
import { detectNiche } from "@/lib/niche-autosuggest";

export const dynamic = "force-dynamic";

// POST /api/domains/igaming/unpin
// Body: { domainId: string }
//
// Reverse of /pin — re-runs detectNiche on the domain URL/name and resets
// NicheMapping.niche to whatever the rule-based detector picks. Low-
// confidence detections fall back to 'news' (the global default bucket),
// matching the auto-suggest pipeline behavior.
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const domainId = typeof body.domainId === "string" ? body.domainId.trim() : "";

    if (!domainId) {
      return NextResponse.json({ error: "domainId is required" }, { status: 400 });
    }

    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, url: true, name: true, genre: true },
    });
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const suggestion = detectNiche({
      url: domain.url,
      name: domain.name,
      genre: domain.genre,
    });
    // Low-confidence = the URL gave us nothing strong; default to 'news'
    // rather than persisting a guess we don't trust.
    const detected = suggestion.confidence === "low" ? "news" : suggestion.niche;

    await prisma.nicheMapping.upsert({
      where: { domainId },
      update: { niche: detected, keywords: suggestion.keywords },
      create: {
        domainId,
        niche: detected,
        language: "id",
        keywords: suggestion.keywords,
      },
    });

    return NextResponse.json({
      success: true,
      domainId,
      niche: detected,
      previous: "igaming",
    });
  } catch (error) {
    console.error("Failed to unpin igaming domain:", error);
    return NextResponse.json(
      { error: "Failed to unpin igaming domain" },
      { status: 500 }
    );
  }
}
