// ── Pollinations adapter (DISABLED 2026-06-06) ──
// pollinations.ai turned paid-only — every prompt URL now returns
// HTTP 402 Payment Required. Adapter constructed URLs at gen-time without
// hitting the endpoint, so 2277 articles ended up with broken-image URLs.
// Always return null until either the service comes back free or we wire
// it through a paid key. Picker chains for igaming fall through to
// unsplash/pexels in the meantime.

import type { ImageAdapter, ImageContext, ImageResult } from "../types";

let warnedDeprecated = false;

export const pollinationsAdapter: ImageAdapter = {
  key: "pollinations",

  async fetch(_ctx: ImageContext): Promise<ImageResult | null> {
    if (!warnedDeprecated) {
      warnedDeprecated = true;
      console.warn(
        "[images/pollinations] adapter disabled — service is 402 Payment Required",
      );
    }
    return null;
  },
};
