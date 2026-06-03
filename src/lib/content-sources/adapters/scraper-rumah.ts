// scraper_rumah — thin wrapper over cheerio_generic for Rumah.com panduan.
// Niche: properti (Indonesian real-estate guides/articles).
// All scraping logic lives in cheerio_generic; this file only pins the
// site-specific selectors so one bug fix upstream propagates here.

import { cheerioGenericAdapter } from "./cheerio-generic";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

const CONFIG = {
  listUrl: "https://www.rumah.com/panduan-properti",
  itemSelector: "article",
  titleSelector: "h3 a, h2 a",
  linkSelector: "h3 a, h2 a",
  summarySelector: "p",
};

export const scraperRumahAdapter: ContentAdapter = {
  key: "scraper_rumah",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const wrapped: ContentSourceRow = {
      ...source,
      name: source.name || "Rumah.com Panduan",
      adapter: cheerioGenericAdapter.key,
      config: CONFIG,
    };
    return cheerioGenericAdapter.fetch(wrapped, limit);
  },
};
