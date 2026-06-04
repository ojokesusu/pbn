// ── Image adapter registry ──
// Central map from adapter key → adapter instance. The picker resolves
// niche priority chains through this registry. Missing adapters (not yet
// implemented) resolve to null and are silently skipped by the picker.

import type { ImageAdapter } from "./types";
import { ogScrapeAdapter } from "./adapters/og-scrape";
import { wikipediaAdapter } from "./adapters/wikipedia";
import { unsplashAdapter } from "./adapters/unsplash";
import { pexelsAdapter } from "./adapters/pexels";
import { pollinationsAdapter } from "./adapters/pollinations";

const REGISTRY: Record<string, ImageAdapter> = {
  og_scrape: ogScrapeAdapter,
  wikipedia: wikipediaAdapter,
  unsplash: unsplashAdapter,
  pexels: pexelsAdapter,
  pollinations: pollinationsAdapter,
};

export function getImageAdapter(key: string): ImageAdapter | null {
  return REGISTRY[key] ?? null;
}
