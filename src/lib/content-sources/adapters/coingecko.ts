// CoinGecko adapter — public API, no key required.
// Documented free-tier rate limit ~30 req/min; the scheduler tick (every
// 10 min, ~5 sources per tick max) stays well under.
//
// source.config shape:
//   { "endpoint": "trending" | "markets", "perPage"?: number, "vsCurrency"?: string }
//
// Two endpoints supported:
//   • trending  — /search/trending — top 7 daily-trending coins
//   • markets   — /coins/markets   — top N by market cap
//
// Each coin becomes one ContentItem usable as AI rewrite context:
//   title    = "Bitcoin (BTC) up 2.4% — $98,450"
//   summary  = market cap + 24h volume + circulating supply + change
//   url      = canonical coingecko coin page

import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

interface CoinGeckoConfig {
  endpoint?: "trending" | "markets";
  perPage?: number;
  vsCurrency?: string;
}

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  circulating_supply: number | null;
  last_updated: string | null;
}

interface TrendingCoin {
  item: {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number | null;
    data?: {
      price?: number;
      price_change_percentage_24h?: { usd?: number };
      market_cap?: string;
      total_volume?: string;
    };
  };
}

interface TrendingResponse {
  coins: TrendingCoin[];
}

const BASE = "https://api.coingecko.com/api/v3";
const TIMEOUT_MS = 10_000;

function formatPrice(value: number | null | undefined, currency = "usd"): string {
  if (value == null) return "n/a";
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toUpperCase() + " ";
  if (value < 1) return `${symbol}${value.toFixed(4)}`;
  return `${symbol}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatChange(pct: number | null | undefined): string {
  if (pct == null) return "";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

async function fetchTrending(limit: number, vsCurrency: string): Promise<ContentItem[]> {
  const res = await fetch(`${BASE}/search/trending`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CoinGecko trending HTTP ${res.status}`);
  const data = (await res.json()) as TrendingResponse;
  const coins = (data.coins || []).slice(0, limit);

  return coins.map((c) => {
    const item = c.item;
    const price = item.data?.price ?? null;
    const change = item.data?.price_change_percentage_24h?.usd ?? null;
    const mcap = item.data?.market_cap || "n/a";
    const vol = item.data?.total_volume || "n/a";
    const title = `${item.name} (${item.symbol.toUpperCase()}) ${formatChange(change)} — ${formatPrice(price, vsCurrency)}`;
    return {
      title: title.trim(),
      summary: `Trending coin #${item.market_cap_rank ?? "?"} pada CoinGecko hari ini. Market cap ${mcap}, volume 24 jam ${vol}.`,
      url: `https://www.coingecko.com/en/coins/${item.id}`,
      publishedAt: new Date().toISOString(),
      source: "CoinGecko Trending",
    };
  });
}

async function fetchMarkets(
  limit: number,
  vsCurrency: string,
): Promise<ContentItem[]> {
  const url = new URL(`${BASE}/coins/markets`);
  url.searchParams.set("vs_currency", vsCurrency);
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "false");
  url.searchParams.set("price_change_percentage", "24h");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CoinGecko markets HTTP ${res.status}`);
  const data = (await res.json()) as MarketCoin[];

  return data.map((c) => {
    const title = `${c.name} (${c.symbol.toUpperCase()}) ${formatChange(c.price_change_percentage_24h)} — ${formatPrice(c.current_price, vsCurrency)}`;
    const mcapStr = c.market_cap != null ? formatPrice(c.market_cap, vsCurrency) : "n/a";
    const volStr = c.total_volume != null ? formatPrice(c.total_volume, vsCurrency) : "n/a";
    return {
      title: title.trim(),
      summary: `Market cap ${mcapStr}, volume 24 jam ${volStr}, supply beredar ${(c.circulating_supply ?? 0).toLocaleString("en-US")} ${c.symbol.toUpperCase()}.`,
      url: `https://www.coingecko.com/en/coins/${c.id}`,
      publishedAt: c.last_updated || new Date().toISOString(),
      source: "CoinGecko Markets",
    };
  });
}

export const coinGeckoAdapter: ContentAdapter = {
  key: "coingecko",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const cfg = (source.config as CoinGeckoConfig | null) ?? {};
    const endpoint = cfg.endpoint ?? "markets";
    const vsCurrency = cfg.vsCurrency ?? "usd";
    const perPage = Math.min(cfg.perPage ?? limit, limit);

    if (endpoint === "trending") return fetchTrending(perPage, vsCurrency);
    return fetchMarkets(perPage, vsCurrency);
  },
};
