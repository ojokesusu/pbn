// cheerio_generic adapter — config-driven HTML scraper.
// Used directly via DB-configured ContentSourceRow OR wrapped by per-site
// thin adapters (scraper-esportsku, scraper-rumah, scraper-jobsdb) so one
// bug fix in this file propagates to every dependent scraper.
//
// source.config shape:
//   {
//     listUrl: string,           // required — page that lists articles
//     itemSelector: string,      // required — CSS selector for each article block
//     titleSelector: string,     // required — relative selector within item for title text
//     linkSelector: string,      // required — relative selector within item, reads href attr
//     summarySelector?: string,  // optional — relative selector for summary text
//     dateSelector?: string,     // optional — relative selector for date (text or datetime attr)
//     baseUrl?: string,          // optional — override for resolving relative URLs
//     headers?: Record<string,string> // optional — extra request headers
//   }

import * as cheerio from "cheerio";
import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

interface CheerioGenericConfig {
  listUrl?: string;
  itemSelector?: string;
  titleSelector?: string;
  linkSelector?: string;
  summarySelector?: string;
  dateSelector?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0";
const TIMEOUT_MS = 10_000;

function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return "";
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function toIso(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

export const cheerioGenericAdapter: ContentAdapter = {
  key: "cheerio_generic",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const cfg = (source.config as CheerioGenericConfig | null) ?? {};
    const listUrl = cfg.listUrl;
    const itemSelector = cfg.itemSelector;
    const titleSelector = cfg.titleSelector;
    const linkSelector = cfg.linkSelector;

    if (!listUrl || !itemSelector || !titleSelector || !linkSelector) {
      console.warn(
        `[cheerio_generic] source "${source.name}" missing required config (listUrl/itemSelector/titleSelector/linkSelector)`,
      );
      return [];
    }

    try {
      const res = await fetch(listUrl, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": DEFAULT_UA,
          Accept: "text/html,application/xhtml+xml",
          ...(cfg.headers || {}),
        },
      });
      if (!res.ok) {
        console.warn(
          `[cheerio_generic] ${source.name} HTTP ${res.status} for ${listUrl}`,
        );
        return [];
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const baseUrl = cfg.baseUrl || listUrl;

      const items: ContentItem[] = [];
      $(itemSelector).each((_, el) => {
        if (items.length >= limit) return false;
        const $el = $(el);
        const title = $el.find(titleSelector).first().text().trim();
        const $link = $el.find(linkSelector).first();
        const href = $link.attr("href") || "";
        if (!title || !href) return;
        const url = resolveUrl(href, baseUrl);

        let summary = "";
        if (cfg.summarySelector) {
          summary = $el.find(cfg.summarySelector).first().text().trim();
        }

        let publishedAt = "";
        if (cfg.dateSelector) {
          const $date = $el.find(cfg.dateSelector).first();
          const raw =
            $date.attr("datetime") ||
            $date.attr("content") ||
            $date.text() ||
            "";
          publishedAt = toIso(raw);
        }

        items.push({
          title,
          summary,
          url,
          publishedAt,
          source: source.name,
        });
      });

      return items;
    } catch (err) {
      console.warn(
        `[cheerio_generic] ${source.name} failed: ${(err as Error).message}`,
      );
      return [];
    }
  },
};
