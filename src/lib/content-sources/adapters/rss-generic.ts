// rss_generic adapter — consumes any RSS/Atom feed URL stored in
// RssSource.url. Wraps the existing rss-scraper.fetchFromUrl helper so we
// don't duplicate parser config (timeout, UA, custom field handling).

import { fetchFromUrl } from "../../rss-scraper";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

export const rssGenericAdapter: ContentAdapter = {
  key: "rss_generic",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const items = await fetchFromUrl(source.url, limit);
    return items.map((a) => ({
      title: a.title,
      summary: a.summary || a.contentSnippet || "",
      url: a.link,
      publishedAt: a.published || "",
      source: source.name, // prefer the curated source label over the feed's <source> tag
    }));
  },
};
