// ── Niche-aware image picker ──
// Resolves a small ordered list of images for an article. Each niche has
// its own priority chain of adapter keys; the first adapter returning a
// non-null result wins for slot 1. For slot 2+ we prefer an adapter that
// did NOT supply the previous image so the article doesn't end up with
// two near-identical visuals (e.g. two og-scrape banners).

import { getImageAdapter } from "./registry";
import type { ImageContext, ImageResult } from "./types";

// Niche -> ordered list of adapter keys. First adapter returning non-null wins.
//
// IMPORTANT RULE (Sandi 2026-06-04): Pollinations (AI) is ONLY used for
// niche=igaming. AI images "keliatan banget AI-nya" — kills credibility on
// news/politik/lifestyle articles. iGaming is the only niche where the
// stylized casino/neon aesthetic matches AI-gen output. For every other
// niche, if og_scrape + wikipedia + unsplash + pexels all miss, the slot
// stays empty and the scheduler keeps whatever featuredImage the legacy
// fetchArticleImage helper set as baseline.
const PRIORITY_BY_NICHE: Record<string, string[]> = {
  politik: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  news: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  bola: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  kriminal: ["rss_image", "og_scrape", "unsplash", "pexels"],
  hiburan: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  musik: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  film: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  gaming: ["unsplash", "pexels"],
  otomotif: ["unsplash", "pexels"],
  fashion: ["unsplash", "pexels"],
  beauty: ["unsplash", "pexels"],
  properti: ["unsplash", "pexels"],
  travel: ["unsplash", "pexels"],
  food: ["unsplash", "pexels"],
  parenting: ["unsplash", "pexels"],
  karir: ["unsplash", "pexels"],
  health: ["unsplash", "pexels"],
  tech: ["unsplash", "pexels"],
  finance: ["unsplash", "pexels"],
  business: ["unsplash", "pexels"],
  education: ["unsplash", "pexels"],
  bencana: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  hukum: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  ekonomi: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  internasional: ["rss_image", "og_scrape", "wikipedia", "unsplash", "pexels"],
  religion: ["unsplash", "pexels"],
  // iGaming — the ONLY niche where pollinations is allowed. rss_image first
  // (if the source feed supplied one), then og_scrape in case a source RSS
  // provides a real casino-promo image; otherwise pollinations renders
  // neon/slot/cards aesthetic which fits.
  igaming: ["rss_image", "og_scrape", "pollinations"],
};

const DEFAULT_CHAIN = ["unsplash", "pexels"];

function chainFor(niche?: string): string[] {
  if (!niche) return DEFAULT_CHAIN;
  return PRIORITY_BY_NICHE[niche] ?? DEFAULT_CHAIN;
}

// Try adapters in order, skip the ones in `skipKeys`. Returns the first
// non-null { result, key } or null if nothing matched.
async function tryChain(
  chain: string[],
  ctx: ImageContext,
  skipKeys: Set<string>
): Promise<{ result: ImageResult; key: string } | null> {
  for (const key of chain) {
    if (skipKeys.has(key)) continue;
    const adapter = getImageAdapter(key);
    if (!adapter) continue;
    try {
      const result = await adapter.fetch(ctx);
      if (result) return { result, key };
    } catch {
      // Swallow adapter errors — treat as miss and fall through.
    }
  }
  return null;
}

// Picks `count` images (default 2: header + mid-body). For the first slot
// we walk the niche chain straight. For each subsequent slot we first try
// to use an adapter that hasn't produced an image yet (variation); if
// every remaining adapter misses, we fall back to allowing repeats.
export async function pickImages(
  ctx: ImageContext,
  count: number = 2
): Promise<ImageResult[]> {
  const chain = chainFor(ctx.niche);
  const results: ImageResult[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < count; i++) {
    // First pass: prefer an adapter we haven't used yet.
    let hit = await tryChain(chain, ctx, usedKeys);

    // Fallback: allow repeats so we still fill the slot if all other
    // adapters missed.
    if (!hit && usedKeys.size > 0) {
      hit = await tryChain(chain, ctx, new Set());
    }

    if (!hit) break;

    results.push(hit.result);
    usedKeys.add(hit.key);
  }

  return results;
}
