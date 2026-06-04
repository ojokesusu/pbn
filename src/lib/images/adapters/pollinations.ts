// ── Pollinations adapter ──
// Wraps the existing src/lib/pollinations.ts helper as a fallback image
// source. Always succeeds in producing a URL (the URL itself is the image)
// — only returns null if the underlying call throws.

import { pollinationsFromGenre } from "../../pollinations";
import type { ImageAdapter, ImageContext, ImageResult } from "../types";

const WIDTH = 1024;
const HEIGHT = 768;

export const pollinationsAdapter: ImageAdapter = {
  key: "pollinations",

  async fetch(ctx: ImageContext): Promise<ImageResult | null> {
    try {
      const genre = ctx.niche || "news";
      const subject =
        ctx.query && ctx.query.trim().length > 0
          ? ctx.query.trim()
          : `${genre} indonesian news image`;

      const url = pollinationsFromGenre(genre, subject, {
        width: WIDTH,
        height: HEIGHT,
      });

      if (!url) return null;

      return {
        url,
        attribution: "Ilustrasi: AI-generated",
        sourceLabel: "Pollinations AI",
        width: WIDTH,
        height: HEIGHT,
      };
    } catch {
      return null;
    }
  },
};
