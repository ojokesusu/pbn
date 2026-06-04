// ── Niche-aware image picker ──
// Resolves a small ordered list of images for an article. Each niche has
// its own priority chain of adapter keys; the first adapter returning a
// non-null result wins for slot 1. For slot 2+ we prefer an adapter that
// did NOT supply the previous image so the article doesn't end up with
// two near-identical visuals (e.g. two og-scrape banners).

import { getImageAdapter } from "./registry";
import type { ImageContext, ImageResult } from "./types";

// Niche -> ordered list of adapter keys. First adapter returning non-null wins.
const PRIORITY_BY_NICHE: Record<string, string[]> = {
  politik: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  news: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  bola: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  kriminal: ["og_scrape", "unsplash", "pollinations"],
  hiburan: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  musik: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  film: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  gaming: ["unsplash", "pexels", "pollinations"],
  otomotif: ["unsplash", "pexels", "pollinations"],
  fashion: ["unsplash", "pexels", "pollinations"],
  beauty: ["unsplash", "pexels", "pollinations"],
  properti: ["unsplash", "pexels", "pollinations"],
  travel: ["unsplash", "pexels", "pollinations"],
  food: ["unsplash", "pexels", "pollinations"],
  parenting: ["unsplash", "pexels", "pollinations"],
  karir: ["unsplash", "pexels", "pollinations"],
  health: ["unsplash", "pexels", "pollinations"],
  tech: ["unsplash", "pexels", "pollinations"],
  finance: ["unsplash", "pexels", "pollinations"],
  business: ["unsplash", "pexels", "pollinations"],
  education: ["unsplash", "pexels", "pollinations"],
  bencana: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  hukum: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  ekonomi: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  internasional: ["og_scrape", "wikipedia", "unsplash", "pollinations"],
  religion: ["unsplash", "pexels", "pollinations"],
};

const DEFAULT_CHAIN = ["unsplash", "pexels", "pollinations"];

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
