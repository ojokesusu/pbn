import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/content/niche-mapping/redistribute
// Body: { targetNiches: string[]; fallbackNiche?: string; dryRun?: boolean }
//
// Round-robin redistributes NicheMapping rows that are currently stuck on a
// fallback bucket (default "news") across a list of target niches. This is
// "Opsi D" — instead of re-running the rule-based detector, Sandi picks the
// niches she actually wants more inventory in and we spread the leftover
// fallback domains across them deterministically.
//
// Only Domain.isAdult = false rows are touched. Keywords are intentionally
// left alone — auto-suggest owns keyword generation, this route only re-tags
// the niche bucket so deploy/scheduler picks them up under a new label.
export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const targetNiches: string[] = Array.isArray(body.targetNiches)
      ? body.targetNiches.filter(
          (n: unknown): n is string => typeof n === "string" && n.trim().length > 0
        ).map((n: string) => n.trim())
      : [];
    const fallbackNiche =
      typeof body.fallbackNiche === "string" && body.fallbackNiche.trim()
        ? body.fallbackNiche.trim()
        : "news";
    const dryRun = body.dryRun === true;

    if (targetNiches.length < 2) {
      return NextResponse.json(
        { error: "targetNiches must be an array of at least 2 niches" },
        { status: 400 }
      );
    }
    if (targetNiches.length > 50) {
      return NextResponse.json(
        { error: "targetNiches capped at 50 niches" },
        { status: 400 }
      );
    }
    // NOTE: it's intentional that fallbackNiche CAN appear in targetNiches.
    // The operator may want to keep a slice of the fallback bucket "as-is"
    // while diversifying the rest — the round-robin just self-assigns those
    // rows (no-op for the niche field, but the updatedAt still bumps).

    // Pull every fallback-bucket mapping whose domain is non-adult. Ordering
    // by domainId keeps the round-robin assignment deterministic across
    // re-runs — same input, same output, which makes dryRun useful as a
    // preview.
    const rows = await prisma.nicheMapping.findMany({
      where: {
        niche: fallbackNiche,
        domain: { isAdult: false },
      },
      orderBy: { domainId: "asc" },
      include: {
        domain: {
          select: { id: true, url: true },
        },
      },
    });

    // Compute the round-robin plan up front so dryRun and the real run share
    // the exact same assignment logic.
    const plan = rows.map((row, i) => ({
      domainId: row.domainId,
      from: row.niche,
      to: targetNiches[i % targetNiches.length],
      url: row.domain?.url ?? "",
    }));

    const perNiche: Record<string, number> = Object.fromEntries(
      targetNiches.map((n) => [n, 0])
    );
    for (const p of plan) {
      perNiche[p.to] = (perNiche[p.to] ?? 0) + 1;
    }

    const sampleTransitions = plan.slice(0, 5);

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        total: plan.length,
        perNiche,
        sampleTransitions,
      });
    }

    // Batched updates with each batch wrapped in a transaction — all-or-nothing
    // per batch so a mid-batch crash leaves the DB consistent (either every
    // row in the batch updated or none). Batches stay serial to avoid pool
    // exhaustion while a deploy worker may also be writing.
    //
    // perNicheActual tracks rows we KNOW landed in the DB (not the plan), so
    // a failed batch doesn't inflate the response counts.
    const BATCH_SIZE = 50;
    let totalRedistributed = 0;
    const failures: Array<{ batchStart: number; error: string }> = [];
    const perNicheActual: Record<string, number> = Object.fromEntries(
      targetNiches.map((n) => [n, 0])
    );

    for (let i = 0; i < plan.length; i += BATCH_SIZE) {
      const batch = plan.slice(i, i + BATCH_SIZE);
      try {
        await prisma.$transaction(
          batch.map((p) =>
            prisma.nicheMapping.update({
              where: { domainId: p.domainId },
              data: { niche: p.to },
            })
          )
        );
        for (const p of batch) {
          perNicheActual[p.to] = (perNicheActual[p.to] ?? 0) + 1;
          totalRedistributed += 1;
        }
      } catch (err) {
        failures.push({
          batchStart: i,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      totalRedistributed,
      perNiche: perNicheActual,
      sampleTransitions,
      failureCount: failures.length,
      failures: failures.slice(0, 25),
    });
  } catch (error) {
    console.error("Failed to redistribute niche mappings:", error);
    return NextResponse.json(
      { error: "Failed to redistribute niche mappings" },
      { status: 500 }
    );
  }
}
