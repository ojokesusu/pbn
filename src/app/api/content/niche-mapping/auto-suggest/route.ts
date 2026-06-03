import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";
import { detectNiche, NICHE_LIST } from "@/lib/niche-autosuggest";

export const dynamic = "force-dynamic";

// POST /api/content/niche-mapping/auto-suggest
// Body: { domainIds?: string[]; all?: boolean; onlyMissing?: boolean }
//
// Runs the rule-based niche detector across the requested domains and
// upserts NicheMapping rows. Defaults to `onlyMissing: true` when `all`
// is set so we don't clobber Sandi's manual classifications — pass
// `{ all: true, onlyMissing: false }` to force a full re-run.
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const requestedIds: string[] = Array.isArray(body.domainIds)
      ? body.domainIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];
    const wantAll = body.all === true;
    // Default to skipping domains that already have a mapping. Explicit
    // `onlyMissing: false` opts into overwriting — used when the rule
    // set changes and we want to re-classify everything.
    const onlyMissing = body.onlyMissing !== false;

    if (!wantAll && requestedIds.length === 0) {
      return NextResponse.json(
        { error: "Provide domainIds[] or set all=true" },
        { status: 400 }
      );
    }

    // Resolve target domains. When `all=true` we pull every Domain row,
    // optionally filtering out the ones with an existing NicheMapping so
    // a bulk run is idempotent against Sandi's earlier manual work.
    // Adult-flagged domains are skipped unconditionally — we never want
    // a niche/RSS pairing for them.
    const where: Record<string, unknown> = { isAdult: false };
    if (!wantAll) {
      where.id = { in: requestedIds };
    }
    if (onlyMissing) {
      where.nicheMapping = { is: null };
    }

    // Garbage-collect any pre-existing NicheMapping rows that point at an
    // adult domain. detect-adult-domains.ts flags new rows after they may
    // have already been auto-classified, so this is a routine clean-up
    // and is reported back to the caller.
    const adultPurge = await prisma.nicheMapping.deleteMany({
      where: { domain: { isAdult: true } },
    });
    const nicheMappingsRemoved = adultPurge.count;

    const domains = await prisma.domain.findMany({
      where,
      select: {
        id: true,
        name: true,
        url: true,
        genre: true,
      },
    });

    // Tally counters as we go so the response gives Sandi a one-shot
    // summary instead of forcing a follow-up GET.
    const byNiche: Record<string, number> = Object.fromEntries(
      NICHE_LIST.map((n) => [n, 0])
    );
    let lowConfidenceCount = 0;
    let processed = 0;
    const failures: Array<{ domainId: string; error: string }> = [];

    // Sequential upserts on purpose — Prisma + Postgres handles ~1500 rows
    // in a couple seconds and a Promise.all blast would risk pool exhaustion
    // while another deploy worker is hammering the DB. If this becomes a
    // bottleneck we can batch with createMany + updateMany later.
    for (const d of domains) {
      const suggestion = detectNiche({
        url: d.url,
        name: d.name,
        genre: d.genre,
      });

      try {
        await prisma.nicheMapping.upsert({
          where: { domainId: d.id },
          update: {
            niche: suggestion.niche,
            keywords: suggestion.keywords,
          },
          create: {
            domainId: d.id,
            niche: suggestion.niche,
            keywords: suggestion.keywords,
            language: "id",
          },
        });

        byNiche[suggestion.niche] = (byNiche[suggestion.niche] ?? 0) + 1;
        if (suggestion.confidence === "low") lowConfidenceCount += 1;
        processed += 1;
      } catch (err) {
        failures.push({
          domainId: d.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      processed,
      by_niche: byNiche,
      low_confidence_count: lowConfidenceCount,
      skipped: domains.length - processed - failures.length,
      adult_mappings_removed: nicheMappingsRemoved,
      failures: failures.slice(0, 25), // cap noise in the response
      failure_count: failures.length,
    });
  } catch (error) {
    console.error("Failed to auto-suggest niches:", error);
    return NextResponse.json(
      { error: "Failed to auto-suggest niches" },
      { status: 500 }
    );
  }
}
