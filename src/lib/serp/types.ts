// Shared SERP types — kept provider-agnostic so we can swap Serper for
// DataForSEO / SerpApi / ScaleSerp without touching call sites.
//
// Every adapter normalizes its raw response into SerpResponse so downstream
// consumers (keyword research, competitor tracking, content gap analysis)
// only deal with one shape.

export interface SerpResult {
  // 1-indexed organic rank (Serper gives `position`, we copy as-is).
  rank: number;
  title: string;
  link: string;
  snippet?: string;
  // Pretty host string Google shows under the title, e.g. "https://example.com › blog".
  displayLink?: string;
}

export interface SerpResponse {
  keyword: string;
  // BCP-47 language tag, e.g. "id", "en", "en-US".
  locale: string;
  results: SerpResult[];
  // Adapter `key` (e.g. "serper", "dataforseo") so callers can tell which
  // backend served the response — useful for cost reconciliation + retries.
  provider: string;
  // Per-call USD cost estimate. Adapters hardcode their plan rate; we sum
  // these into the daily budget tracker.
  costUsd: number;
}

export interface SerpProvider {
  // Stable identifier for logs / budget tracker. Lowercase, no spaces.
  key: string;
  // Returns null on transient failure (network, 5xx, missing API key in dev)
  // so callers can fall back to a secondary provider without try/catching
  // every call site.
  search(opts: {
    keyword: string;
    locale?: string;
    region?: string;
    device?: "desktop" | "mobile";
    num?: number;
  }): Promise<SerpResponse | null>;
}
