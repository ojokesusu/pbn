// ── Image adapter registry ──
// Central map from adapter key → adapter instance. The picker resolves
// niche priority chains through this registry. Missing adapters (not yet
// implemented) resolve to null and are silently skipped by the picker.

import type { ImageAdapter } from "./types";
import { ogScrapeAdapter } from "./adapters/og-scrape";
import { wikipediaAdapter } from "./adapters/wikipedia";
import { unsplashAdapter } from "./adapters/unsplash";
import { pexelsAdapter } from "./adapters/pexels";
import { rssImageAdapter } from "./adapters/rss-image";

// Pollinations adapter removed 2026-06-08 — service turned paid-only (HTTP 402)
// on 2026-06-06. iGaming chains now fall through to unsplash/pexels.
const REGISTRY: Record<string, ImageAdapter> = {
  rss_image: rssImageAdapter,
  og_scrape: ogScrapeAdapter,
  wikipedia: wikipediaAdapter,
  unsplash: unsplashAdapter,
  pexels: pexelsAdapter,
};

export function getImageAdapter(key: string): ImageAdapter | null {
  return REGISTRY[key] ?? null;
}
