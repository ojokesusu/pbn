import * as cheerio from 'cheerio';
import type { ImageAdapter, ImageContext, ImageResult } from '../types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0';
const FETCH_TIMEOUT_MS = 10_000;

function isValidUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

export const ogScrapeAdapter: ImageAdapter = {
  key: 'og_scrape',
  async fetch(ctx: ImageContext): Promise<ImageResult | null> {
    try {
      if (!isValidUrl(ctx.articleUrl)) {
        return null;
      }
      const articleUrl = ctx.articleUrl;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let html: string;
      try {
        const res = await fetch(articleUrl, {
          method: 'GET',
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html',
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(
            `[og-scrape] non-OK response ${res.status} for ${articleUrl}`,
          );
          return null;
        }
        html = await res.text();
      } finally {
        clearTimeout(timer);
      }

      const $ = cheerio.load(html);

      const ogImage = $('meta[property="og:image"]').attr('content')?.trim();
      const twitterImage = $('meta[name="twitter:image"]')
        .attr('content')
        ?.trim();
      const articleImg =
        $('article img[src]').first().attr('src')?.trim() ||
        $('main img[src]').first().attr('src')?.trim();

      const rawImage = ogImage || twitterImage || articleImg;
      if (!rawImage) {
        return null;
      }

      const resolved = resolveUrl(rawImage, articleUrl);
      if (!resolved) {
        return null;
      }

      const siteName = $('meta[property="og:site_name"]')
        .attr('content')
        ?.trim();
      let sourceLabel = siteName;
      if (!sourceLabel) {
        try {
          sourceLabel = new URL(articleUrl).hostname;
        } catch {
          sourceLabel = 'unknown';
        }
      }

      const widthRaw = $('meta[property="og:image:width"]').attr('content');
      const heightRaw = $('meta[property="og:image:height"]').attr('content');
      const width = widthRaw ? Number.parseInt(widthRaw, 10) : undefined;
      const height = heightRaw ? Number.parseInt(heightRaw, 10) : undefined;

      return {
        url: resolved,
        attribution: `Foto: ${sourceLabel}`,
        sourceLabel,
        width: Number.isFinite(width) ? width : undefined,
        height: Number.isFinite(height) ? height : undefined,
      };
    } catch (err) {
      console.warn('[og-scrape] failed to fetch og image', err);
      return null;
    }
  },
};
