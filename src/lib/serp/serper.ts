// Serper.dev SERP adapter. Cheapest reliable Google-SERP API we benchmarked
// ($1 per 1000 searches on the standard plan), so this is the default
// provider for keyword research + competitor tracking flows.
//
// Env: SERPER_API_KEY — required in production; missing key returns null
// gracefully so local dev doesn't explode if the secret isn't loaded.

import type { SerpProvider, SerpResponse, SerpResult } from "./types";

const ENDPOINT = "https://google.serper.dev/search";

// Standard plan rate: 1000 searches / $1 = $0.001 per call. Hardcoded as
// an estimate; if Sandi upgrades to enterprise this gets adjusted in one
// place and the daily budget tracker picks it up automatically.
const COST_PER_CALL_USD = 0.001;

// 10s ceiling — Serper p95 is sub-2s, anything beyond 10s is a dead call
// and we'd rather null-fallback than block content gen pipelines.
const TIMEOUT_MS = 10_000;

// Raw shape Serper returns under `organic`. We only consume the fields we
// map; everything else is ignored. `position` is 1-indexed.
interface SerperOrganic {
  title: string;
  link: string;
  snippet?: string;
  position: number;
  displayLink?: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperOrganic[];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const serperProvider: SerpProvider = {
  key: "serper",

  async search(opts): Promise<SerpResponse | null> {
    const key = process.env.SERPER_API_KEY;
    if (!key) {
      // Silent null in dev so route handlers don't crash when the secret
      // isn't in .env.local. Production observability catches this via
      // upstream budget tracker logging zero spend on a queued job.
      return null;
    }

    const locale = (opts.locale || "id").toLowerCase();
    const region = (opts.region || "id").toLowerCase();
    const num = opts.num ?? 100;

    const payload: Record<string, unknown> = {
      q: opts.keyword,
      gl: region,
      hl: locale,
      num,
    };
    if (opts.device) {
      // Serper accepts `device: "mobile"` and infers desktop otherwise.
      payload.device = opts.device;
    }

    try {
      const res = await fetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: {
            "X-API-KEY": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        TIMEOUT_MS,
      );

      if (!res.ok) {
        // 4xx/5xx — treat as transient. Caller can retry or fall back to
        // another provider via pickProvider().
        return null;
      }

      const data = (await res.json()) as SerperResponse;
      const organic = Array.isArray(data.organic) ? data.organic : [];

      const results: SerpResult[] = organic.map((row) => ({
        rank: row.position,
        title: row.title,
        link: row.link,
        snippet: row.snippet,
        displayLink: row.displayLink,
      }));

      return {
        keyword: opts.keyword,
        locale,
        results,
        provider: "serper",
        costUsd: COST_PER_CALL_USD,
      };
    } catch {
      // Network error, abort (timeout), or JSON parse failure — null
      // signals the caller to skip this keyword and move on.
      return null;
    }
  },
};
