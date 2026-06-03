// scraper_jobsdb — thin wrapper over cheerio_generic for JobsDB Career Advice.
// Niche: karir (Indonesian career advice / job-seeking articles).
// All scraping logic lives in cheerio_generic; this file only pins the
// site-specific selectors so one bug fix upstream propagates here.

import { cheerioGenericAdapter } from "./cheerio-generic";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

const CONFIG = {
  listUrl: "https://id.jobsdb.com/id/career-advice/",
  itemSelector: "article, .post, .article-card",
  titleSelector: "h2 a, h3 a",
  linkSelector: "h2 a, h3 a",
  summarySelector: "p, .excerpt",
};

export const scraperJobsdbAdapter: ContentAdapter = {
  key: "scraper_jobsdb",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const wrapped: ContentSourceRow = {
      ...source,
      name: source.name || "JobsDB Career Advice",
      adapter: cheerioGenericAdapter.key,
      config: CONFIG,
    };
    return cheerioGenericAdapter.fetch(wrapped, limit);
  },
};
