// ── Shared image adapter contracts ──
// All image source adapters (og-scrape, wikipedia, unsplash, pexels,
// pollinations, …) implement the same interface so the picker can chain
// them niche-by-niche.

export interface ImageContext {
  niche?: string;
  articleUrl?: string;       // from RSS source.url
  query?: string;            // article title or topic
  language?: string;         // default 'id'
}

export interface ImageResult {
  url: string;
  attribution: string;       // "Foto: <source>" — ready-to-render
  sourceLabel: string;       // "Detik.com" | "Unsplash" | "Wikipedia" etc.
  width?: number;
  height?: number;
}

export interface ImageAdapter {
  key: string;
  fetch(ctx: ImageContext): Promise<ImageResult | null>;
}
