// ── Shared image adapter contracts ──
// All image source adapters (og-scrape, wikipedia, unsplash, pexels,
// pollinations, …) implement the same interface so the picker can chain
// them niche-by-niche.

export interface ImageContext {
  niche?: string;
  articleUrl?: string;       // from RSS source.url
  query?: string;            // article title or topic
  language?: string;         // default 'id'
  rssImageUrl?: string;      // image URL provided directly by the source RSS feed
  // 'rss_first' (default) walks the niche chain unchanged — editorial sources
  // (rss_image / og_scrape / wikipedia) win when available.
  // 'stock_first' demotes editorial sources behind stock providers so a
  // blackhat domain renders clean stock photos instead of branded news shots.
  imageMode?: "rss_first" | "stock_first";
  // Slot index for the picker — 0-indexed (slot 1 = 0, slot 2 = 1, …).
  // Stock adapters (unsplash, pexels) use this as the API page number
  // (slotIndex+1) so slot 2 doesn't repeat slot 1's top result. Other
  // adapters ignore it.
  slotIndex?: number;
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
