// ── RSS image pass-through adapter ──
// When the source RSS feed already exposed an image URL (e.g. via
// media:content, enclosure, or content:encoded), prefer it over any
// downstream scraping/stock fallback. This is the highest-fidelity source
// because it's curated by the original publisher.

import type { ImageAdapter, ImageContext, ImageResult } from "../types";

function deriveSourceLabel(ctx: ImageContext): string {
  if (ctx.rssImageUrl) {
    try {
      const host = new URL(ctx.rssImageUrl).hostname.replace(/^www\./i, "");
      if (host) return host;
    } catch {
      // fall through
    }
  }
  if (ctx.niche) return ctx.niche;
  return "Sumber";
}

export const rssImageAdapter: ImageAdapter = {
  key: "rss_image",
  async fetch(ctx: ImageContext): Promise<ImageResult | null> {
    if (!ctx.rssImageUrl) return null;
    try {
      // Validate it parses as a URL — bail on garbage.
      new URL(ctx.rssImageUrl);
    } catch {
      return null;
    }

    const sourceLabel = deriveSourceLabel(ctx);

    return {
      url: ctx.rssImageUrl,
      attribution: "Foto: " + sourceLabel,
      sourceLabel,
      width: undefined,
      height: undefined,
    };
  },
};
