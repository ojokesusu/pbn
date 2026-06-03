// scraper_mommies adapter — Mommies Daily articles (niche=parenting).
// Thin wrapper over cheerioGenericAdapter with a hardcoded source config.

import { cheerioGenericAdapter } from "./cheerio-generic";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

const SOURCE: ContentSourceRow = {
  id: "scraper_mommies",
  name: "Mommies Daily",
  url: "https://mommiesdaily.com/",
  niche: "parenting",
  language: "id",
  region: "ID",
  type: "scraper",
  adapter: "scraper_mommies",
  // Mommies Daily uses a Next.js card grid (jsx-*). Verified via live HTML
  // inspection 2026-06-03 — .card-small wraps each story; title is .article-title.
  config: {
    listUrl: "https://mommiesdaily.com/",
    itemSelector: ".card-small",
    titleSelector: ".article-title, a",
    linkSelector: "a",
    summarySelector: "p, .article-text",
  },
};

export const scraperMommiesAdapter: ContentAdapter = {
  key: "scraper_mommies",
  async fetch(_source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    return cheerioGenericAdapter.fetch(SOURCE, limit);
  },
};
