// Adapter registry — single point where every adapter is registered.
// Phase 2+ adds: api_football, tmdb, coingecko, bmkg, cheerio_generic, ...
// The fetcher dispatches by RssSource.adapter; unknown keys fall back to
// rss_generic so a misconfigured row never crashes the scheduler.

import { rssGenericAdapter } from "./adapters/rss-generic";
import type { ContentAdapter } from "./types";

const REGISTRY: Record<string, ContentAdapter> = {
  [rssGenericAdapter.key]: rssGenericAdapter,
};

export function getAdapter(key: string): ContentAdapter {
  return REGISTRY[key] ?? rssGenericAdapter;
}

export function registerAdapter(adapter: ContentAdapter): void {
  REGISTRY[adapter.key] = adapter;
}

export function listAdapters(): string[] {
  return Object.keys(REGISTRY);
}
