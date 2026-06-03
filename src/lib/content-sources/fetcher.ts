// Phase 1 fetcher — dispatches each active RssSource row to its adapter,
// aggregates results, dedupes by url, returns a single ContentItem[].
//
// Niche filtering is opt-in: when a niche is passed, only sources matching
// that niche are queried. This lets the scheduler pull "politik" articles
// for a politik-mapped domain without dragging in food/travel feeds.
//
// Best-effort bookkeeping: updates lastFetched + lastError + errorCount per
// source row in a single updateMany after the fetch round. A bad source
// gets `errorCount` bumped so the dashboard can later surface "auto-disable
// after N consecutive errors" without touching the scheduler.

import { prisma } from "../db";
import { getAdapter } from "./registry";
import type { ContentItem, ContentSourceRow } from "./types";

export interface FetchOptions {
  niche?: string;
  language?: string;
  region?: string;
  limit?: number;
  perSourceLimit?: number;
}

interface FetchResult {
  items: ContentItem[];
  sourceCount: number;
  errors: { sourceId: string; error: string }[];
}

export async function fetchFromActiveContentSources(
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const limit = opts.limit ?? 20;

  const where: {
    active: true;
    niche?: string;
    language?: string;
    region?: string;
  } = { active: true };
  if (opts.niche) where.niche = opts.niche;
  if (opts.language) where.language = opts.language;
  if (opts.region) where.region = opts.region;

  // Note: prisma typing on the freshly added columns may be unknown until
  // `prisma generate` runs on the next deploy. The DB columns exist; we
  // tolerate `unknown` here and coerce inside the adapter dispatch.
  const rows = (await prisma.rssSource.findMany({ where })) as unknown as Array<
    ContentSourceRow & { lastFetched?: Date | null }
  >;

  if (rows.length === 0) {
    return { items: [], sourceCount: 0, errors: [] };
  }

  const perSourceLimit =
    opts.perSourceLimit ?? Math.max(1, Math.ceil(limit / rows.length) + 2);

  const errors: { sourceId: string; error: string }[] = [];
  const okIds: string[] = [];
  const failIds: string[] = [];

  const fetched = await Promise.all(
    rows.map(async (row) => {
      const adapter = getAdapter(row.adapter ?? "rss_generic");
      try {
        const items = await adapter.fetch(row, perSourceLimit);
        okIds.push(row.id);
        return items;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ sourceId: row.id, error: msg.slice(0, 200) });
        failIds.push(row.id);
        return [] as ContentItem[];
      }
    }),
  );

  // Best-effort bookkeeping. Don't fail the fetch round if these crash.
  void prisma.rssSource
    .updateMany({
      where: { id: { in: okIds } },
      data: { lastFetched: new Date(), lastError: null, errorCount: 0 },
    })
    .catch((e: unknown) => {
      console.warn(`[content-sources] failed to mark ok rows:`, e);
    });

  if (failIds.length > 0) {
    void prisma.rssSource
      .updateMany({
        where: { id: { in: failIds } },
        // Prisma `increment` works fine here even though errorCount was just
        // added — column exists in DB, only the generated client typing
        // might be stale.
        data: {
          lastError: errors[0]?.error?.slice(0, 200) || "fetch failed",
          errorCount: { increment: 1 },
        },
      })
      .catch((e: unknown) => {
        console.warn(`[content-sources] failed to mark fail rows:`, e);
      });
  }

  // Dedupe by URL across all sources (keep first occurrence).
  const seen = new Set<string>();
  const items: ContentItem[] = [];
  for (const batch of fetched) {
    for (const it of batch) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      items.push(it);
    }
  }

  return { items, sourceCount: rows.length, errors };
}
