// scraper_esportsku — thin wrapper over cheerio_generic for Esportsku.com.
// Niche: gaming (Indonesian e-sports/gaming news).
// All scraping logic lives in cheerio_generic; this file only pins the
// site-specific selectors so one bug fix upstream propagates here.

import { cheerioGenericAdapter } from "./cheerio-generic";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

// Esportsku runs the TagDiv newspaper WordPress theme — article containers
// are .td_module_flex (main feed) and .td_module_wrap. Verified via live
// HTML inspection 2026-06-03; if redesign breaks this, re-grep the page for
// "class=\"td_module" to find the new container name.
const CONFIG = {
  listUrl: "https://esportsku.com/category/berita-esports/",
  itemSelector: ".td_module_flex, .td_module_wrap",
  titleSelector: ".entry-title a",
  linkSelector: ".entry-title a",
  summarySelector: ".td-excerpt",
  dateSelector: ".entry-date",
};

export const scraperEsportskuAdapter: ContentAdapter = {
  key: "scraper_esportsku",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const wrapped: ContentSourceRow = {
      ...source,
      name: source.name || "Esportsku",
      adapter: cheerioGenericAdapter.key,
      config: CONFIG,
    };
    return cheerioGenericAdapter.fetch(wrapped, limit);
  },
};
