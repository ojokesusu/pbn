/**
 * Google News RSS scraper.
 *
 * Pure TypeScript port of the (deleted) Python content_scraper.py stub.
 * Fetches Google News RSS feed for a given query and returns normalized
 * article records. Optional in-memory cache with 1 hour TTL.
 *
 * No DB persistence — caller is responsible for storing results if needed.
 */

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { prisma } from './db';

export interface NewsArticle {
  title: string;
  link: string;
  summary: string;
  contentSnippet: string;
  published: string;
  source: string;
}

// Alias for clarity at call sites that aggregate from arbitrary sources.
export type Article = NewsArticle;

export interface CacheEntry {
  data: NewsArticle[];
  expires: number;
}

export type RssCache = Map<string, CacheEntry>;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 10_000;

// rss-parser typing for custom item fields
type CustomItem = {
  source?: string;
  'media:content'?: { $: { url: string } };
};

const parser: Parser<unknown, CustomItem> = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  customFields: {
    item: ['source', 'media:content'],
  },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

function buildFeedUrl(query: string, language: string, region: string): string {
  const encoded = encodeURIComponent(query);
  const hl = encodeURIComponent(language);
  const gl = encodeURIComponent(region);
  const ceid = `${gl}:${hl}`;
  return `https://news.google.com/rss/search?q=${encoded}&hl=${hl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
}

function extractSource(item: Parser.Item & CustomItem): string {
  // rss-parser exposes <source> as either string or object depending on feed.
  const raw = item.source as unknown;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    // common shapes: { _: 'CNN', $: { url: '...' } } or { name: 'CNN' }
    const asAny = raw as Record<string, unknown>;
    if (typeof asAny._ === 'string') return asAny._;
    if (typeof asAny.name === 'string') return asAny.name;
  }
  // Fallback: derive from link host
  if (item.link) {
    try {
      return new URL(item.link).hostname.replace(/^www\./, '');
    } catch {
      // ignore
    }
  }
  return '';
}

/**
 * Fetch Google News RSS for a query.
 *
 * @param query   search query (will be URL-encoded)
 * @param language ISO language code (default 'id')
 * @param region   ISO region code (default 'ID')
 * @param limit    max articles to return (default 20)
 * @param cache    optional Map for in-memory caching with 1h TTL
 * @returns array of NewsArticle, or [] on failure
 */
export async function fetchNews(
  query: string,
  language: string = 'id',
  region: string = 'ID',
  limit: number = 20,
  cache?: RssCache,
): Promise<NewsArticle[]> {
  const cacheKey = `${query}::${language}::${region}::${limit}`;
  if (cache) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return hit.data;
    }
  }

  const url = buildFeedUrl(query, language, region);

  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items ?? []).slice(0, limit);
    const articles: NewsArticle[] = items.map((item) => {
      const summary = (item.contentSnippet ?? item.content ?? '').trim();
      return {
        title: (item.title ?? '').trim(),
        link: (item.link ?? '').trim(),
        summary,
        contentSnippet: summary,
        published: item.isoDate ?? item.pubDate ?? '',
        source: extractSource(item as Parser.Item & CustomItem),
      };
    });

    if (cache) {
      cache.set(cacheKey, {
        data: articles,
        expires: Date.now() + CACHE_TTL_MS,
      });
    }

    return articles;
  } catch (err) {
    console.warn(
      `[rss-scraper] fetchNews failed for query="${query}" (${language}/${region}): ${(err as Error).message}`,
    );
    return [];
  }
}

/**
 * Fetch a single RSS feed from an arbitrary URL.
 *
 * Used by fetchFromActiveSources to pull articles from operator-curated
 * RssSource rows. Wrapped in try/catch + 10s timeout — returns [] on failure.
 */
export async function fetchFromUrl(
  url: string,
  limit: number = 10,
): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items ?? []).slice(0, limit);
    return items.map((item) => {
      const summary = (item.contentSnippet ?? item.content ?? '').trim();
      return {
        title: (item.title ?? '').trim(),
        link: (item.link ?? '').trim(),
        summary,
        contentSnippet: summary,
        published: item.isoDate ?? item.pubDate ?? '',
        source: extractSource(item as Parser.Item & CustomItem),
      };
    });
  } catch (err) {
    console.warn(
      `[rss-scraper] fetchFromUrl failed for ${url}: ${(err as Error).message}`,
    );
    return [];
  }
}

/**
 * Aggregate articles from all active RssSource rows matching language/region.
 *
 * Reads prisma.rssSource (active=true) → fetches each feed in parallel →
 * dedupes by link → returns concatenated list. Updates lastFetched in a
 * single batch updateMany after the fetch round.
 *
 * Fallback: if zero matching active sources exist, falls back to Google News
 * via fetchNews(query='berita', language, region).
 */
export async function fetchFromActiveSources(
  language?: string,
  region?: string,
  limit: number = 20,
): Promise<Article[]> {
  const where: { active: true; language?: string; region?: string } = { active: true };
  if (language) where.language = language;
  if (region) where.region = region;

  const sources = await prisma.rssSource.findMany({ where });

  if (sources.length === 0) {
    // No curated source for this language/region → fall back to Google News.
    return fetchNews('berita', language ?? 'id', (region ?? language ?? 'id').toUpperCase(), limit);
  }

  // Fan-out fetch in parallel; each call is already try/caught.
  const perSourceLimit = Math.max(1, Math.ceil(limit / sources.length) + 2);
  const results = await Promise.all(
    sources.map((s) => fetchFromUrl(s.url, perSourceLimit)),
  );

  // Mark sources as freshly read (batch update — best-effort, ignore failure).
  try {
    await prisma.rssSource.updateMany({
      where: { id: { in: sources.map((s) => s.id) } },
      data: { lastFetched: new Date() },
    });
  } catch (err) {
    console.warn(
      `[rss-scraper] failed to update lastFetched: ${(err as Error).message}`,
    );
  }

  // Concat + dedupe by link (keep first occurrence).
  const seen = new Set<string>();
  const merged: Article[] = [];
  for (const batch of results) {
    for (const a of batch) {
      if (!a.link || seen.has(a.link)) continue;
      seen.add(a.link);
      merged.push(a);
    }
  }

  return merged;
}

/**
 * Fetch a full article and try to extract its body text via cheerio.
 *
 * Best-effort: pulls text from common containers (article, main, .content,
 * .post-content, .entry-content). Returns empty string on failure.
 */
export async function fetchArticleFull(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return '';
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const selectors = [
      'article',
      'main',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.content',
      '#content',
    ];
    for (const sel of selectors) {
      const node = $(sel).first();
      if (node.length) {
        const text = node.text().replace(/\s+/g, ' ').trim();
        if (text.length > 200) return text;
      }
    }
    // Fallback: body text
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn(
      `[rss-scraper] fetchArticleFull failed for ${url}: ${(err as Error).message}`,
    );
    return '';
  }
}
