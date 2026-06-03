// scraper_glints adapter — Glints Indonesia job listings (niche=karir).
// Thin wrapper over cheerioGenericAdapter with a hardcoded source config so
// the scheduler can pull career content without a DB row.

import { cheerioGenericAdapter } from "./cheerio-generic";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

const SOURCE: ContentSourceRow = {
  id: "scraper_glints",
  name: "Glints Lowongan",
  url: "https://glints.com/id/lowongan-kerja",
  niche: "karir",
  language: "id",
  region: "ID",
  type: "scraper",
  adapter: "scraper_glints",
  config: {
    listUrl: "https://glints.com/id/lowongan-kerja",
    itemSelector:
      ".job-card, article, .CompactOpportunityCardsc__JobcardItemWrapper-sc-dkg8my-0",
    titleSelector: "h3, h4, a.job-title",
    linkSelector: "a",
    summarySelector: "p, .summary",
  },
};

export const scraperGlintsAdapter: ContentAdapter = {
  key: "scraper_glints",
  async fetch(_source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    return cheerioGenericAdapter.fetch(SOURCE, limit);
  },
};
