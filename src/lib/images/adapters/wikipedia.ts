import type { ImageAdapter, ImageContext, ImageResult } from '../types';

interface WikiSummaryImage {
  source?: string;
  width?: number;
  height?: number;
}

interface WikiSummaryResponse {
  originalimage?: WikiSummaryImage;
  thumbnail?: WikiSummaryImage;
}

function pickLangHost(language?: string): string {
  return language === 'en' ? 'en.wikipedia.org' : 'id.wikipedia.org';
}

async function opensearchTopHit(
  host: string,
  query: string,
): Promise<string | null> {
  try {
    const url = `https://${host}/w/api.php?action=opensearch&search=${encodeURIComponent(
      query,
    )}&limit=1&format=json`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[wikipedia] opensearch non-OK ${res.status} for "${query}"`);
      return null;
    }
    const data = (await res.json()) as unknown;
    // opensearch returns: [query, [titles], [descriptions], [urls]]
    if (!Array.isArray(data) || data.length < 2) return null;
    const titles = data[1];
    if (!Array.isArray(titles) || titles.length === 0) return null;
    const first = titles[0];
    return typeof first === 'string' && first.length > 0 ? first : null;
  } catch (err) {
    console.warn('[wikipedia] opensearch failed', err);
    return null;
  }
}

async function pageSummary(
  host: string,
  title: string,
): Promise<WikiSummaryResponse | null> {
  try {
    const url = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(
      title,
    )}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[wikipedia] summary non-OK ${res.status} for "${title}"`);
      return null;
    }
    return (await res.json()) as WikiSummaryResponse;
  } catch (err) {
    console.warn('[wikipedia] summary failed', err);
    return null;
  }
}

export const wikipediaAdapter: ImageAdapter = {
  key: 'wikipedia',
  async fetch(ctx: ImageContext): Promise<ImageResult | null> {
    try {
      const query = ctx.query?.trim();
      if (!query) return null;

      const host = pickLangHost(ctx.language);

      const title = await opensearchTopHit(host, query);
      if (!title) return null;

      const summary = await pageSummary(host, title);
      if (!summary) return null;

      const image = summary.originalimage || summary.thumbnail;
      const imageUrl = image?.source;
      if (!imageUrl) return null;

      return {
        url: imageUrl,
        attribution: 'Foto: Wikipedia (CC-BY-SA)',
        sourceLabel: 'Wikipedia',
        width: image?.width,
        height: image?.height,
      };
    } catch (err) {
      console.warn('[wikipedia] adapter failed', err);
      return null;
    }
  },
};
