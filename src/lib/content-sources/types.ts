// Unified shape returned by every adapter — RSS, REST API, scraper, JSON.
// The scheduler's buildHybridContext only ever deals with this type, so
// adapters are free to look however they need internally as long as they
// return ContentItem[].

export interface ContentItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string; // ISO-8601; empty string if source doesn't provide
  source: string; // human-readable origin label (e.g. "Detik Sport", "API-Football")
  imageUrl?: string;
  raw?: unknown; // adapter-specific payload, kept around for prompt enrichment
}

// Source row as it arrives from the DB. Adapters receive this plus the
// resolved niche/language and return ContentItem[].
export interface ContentSourceRow {
  id: string;
  name: string;
  url: string;
  niche: string;
  language: string;
  region: string;
  type: string;
  adapter: string;
  config: unknown; // JSON, adapter-dependent shape
}

// Adapters implement this interface. Pure functions — no DB writes. The
// fetcher loop handles lastFetched/errorCount bookkeeping in one batch.
export interface ContentAdapter {
  key: string; // matches RssSource.adapter
  fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]>;
}
