// scraper_female_daily adapter — Female Daily Editorial (niche=beauty primary,
// fashion secondary). Thin wrapper over cheerioGenericAdapter with a
// hardcoded source config.

import { cheerioGenericAdapter } from "./cheerio-generic";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

const SOURCE: ContentSourceRow = {
  id: "scraper_female_daily",
  name: "Female Daily Editorial",
  url: "https://editorial.femaledaily.com/",
  niche: "beauty",
  language: "id",
  region: "ID",
  type: "scraper",
  adapter: "scraper_female_daily",
  // Female Daily uses .fdn-article-card-desktop-type-2 wrapping each card,
  // with .article-title for headline. Verified via live HTML inspection
  // 2026-06-03.
  config: {
    listUrl: "https://editorial.femaledaily.com/",
    itemSelector: ".fdn-article-card-desktop-type-2",
    titleSelector: ".article-title, a",
    linkSelector: "a",
    summarySelector: ".article-text",
  },
};

export const scraperFemaleDailyAdapter: ContentAdapter = {
  key: "scraper_female_daily",
  async fetch(_source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    return cheerioGenericAdapter.fetch(SOURCE, limit);
  },
};
