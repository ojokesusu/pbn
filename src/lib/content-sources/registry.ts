// Adapter registry — single point where every adapter is registered.
// Phase 2+ adds: api_football, tmdb, coingecko, bmkg, cheerio_generic, ...
// The fetcher dispatches by RssSource.adapter; unknown keys fall back to
// rss_generic so a misconfigured row never crashes the scheduler.

import { rssGenericAdapter } from "./adapters/rss-generic";
import { coinGeckoAdapter } from "./adapters/coingecko";
import { bmkgAdapter } from "./adapters/bmkg";
import { apiFootballAdapter } from "./adapters/api-football";
import { tmdbAdapter } from "./adapters/tmdb";
import { cheerioGenericAdapter } from "./adapters/cheerio-generic";
import { scraperEsportskuAdapter } from "./adapters/scraper-esportsku";
import { scraperRumahAdapter } from "./adapters/scraper-rumah";
import { scraperJobsdbAdapter } from "./adapters/scraper-jobsdb";
import { scraperGlintsAdapter } from "./adapters/scraper-glints";
import { scraperMommiesAdapter } from "./adapters/scraper-mommies";
import { scraperFemaleDailyAdapter } from "./adapters/scraper-female-daily";
import type { ContentAdapter } from "./types";

const REGISTRY: Record<string, ContentAdapter> = {
  [rssGenericAdapter.key]: rssGenericAdapter,
  [coinGeckoAdapter.key]: coinGeckoAdapter,
  [bmkgAdapter.key]: bmkgAdapter,
  [apiFootballAdapter.key]: apiFootballAdapter,
  [tmdbAdapter.key]: tmdbAdapter,
  [cheerioGenericAdapter.key]: cheerioGenericAdapter,
  [scraperEsportskuAdapter.key]: scraperEsportskuAdapter,
  [scraperRumahAdapter.key]: scraperRumahAdapter,
  [scraperJobsdbAdapter.key]: scraperJobsdbAdapter,
  [scraperGlintsAdapter.key]: scraperGlintsAdapter,
  [scraperMommiesAdapter.key]: scraperMommiesAdapter,
  [scraperFemaleDailyAdapter.key]: scraperFemaleDailyAdapter,
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
