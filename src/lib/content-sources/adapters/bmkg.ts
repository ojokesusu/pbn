// BMKG adapter — Indonesian official meteorology/seismic data, free public.
// Maps gempa (earthquake) events to ContentItem so domains with niche=bencana
// get real-time, geo-specific source material the AI rewrites into news.
//
// source.config shape:
//   { "endpoint": "autogempa" | "gempaterkini" | "gempadirasakan" }
//
// Endpoints (https://data.bmkg.go.id/gempabumi/):
//   • autogempa     — latest single quake (auto-detected)
//   • gempaterkini  — last ~15 quakes
//   • gempadirasakan — quakes felt by users (qualitative)

import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

interface BmkgConfig {
  endpoint?: "autogempa" | "gempaterkini" | "gempadirasakan";
}

interface GempaItem {
  Tanggal?: string;
  Jam?: string;
  DateTime?: string;
  Coordinates?: string;
  Lintang?: string;
  Bujur?: string;
  Magnitude?: string;
  Kedalaman?: string;
  Wilayah?: string;
  Potensi?: string;
  Dirasakan?: string;
  Shakemap?: string;
}

interface BmkgResponse {
  Infogempa?: {
    gempa?: GempaItem | GempaItem[];
  };
}

const BASE = "https://data.bmkg.go.id/DataMKG/TEWS";
const TIMEOUT_MS = 10_000;

function toItem(g: GempaItem): ContentItem {
  const datetime = g.DateTime || `${g.Tanggal || ""} ${g.Jam || ""}`.trim();
  const isoDate = datetime
    ? new Date(datetime.replace(" ", "T") || g.DateTime || Date.now()).toISOString()
    : new Date().toISOString();
  const title = `Gempa M${g.Magnitude || "?"} di ${g.Wilayah || "wilayah tidak diketahui"}`;
  const parts: string[] = [];
  if (g.Magnitude) parts.push(`Magnitudo ${g.Magnitude}`);
  if (g.Kedalaman) parts.push(`kedalaman ${g.Kedalaman}`);
  if (g.Lintang && g.Bujur) parts.push(`lokasi ${g.Lintang}, ${g.Bujur}`);
  if (g.Potensi) parts.push(`potensi: ${g.Potensi}`);
  if (g.Dirasakan) parts.push(`dirasakan di ${g.Dirasakan}`);
  return {
    title,
    summary: parts.join(", ") + ".",
    url: g.Shakemap
      ? `${BASE}/${g.Shakemap}`
      : "https://www.bmkg.go.id/gempabumi/gempabumi-terkini.bmkg",
    publishedAt: isoDate,
    source: "BMKG Gempa",
  };
}

export const bmkgAdapter: ContentAdapter = {
  key: "bmkg",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const cfg = (source.config as BmkgConfig | null) ?? {};
    const endpoint = cfg.endpoint ?? "gempaterkini";
    const url = `${BASE}/${endpoint}.json`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`BMKG ${endpoint} HTTP ${res.status}`);
    const data = (await res.json()) as BmkgResponse;
    const raw = data.Infogempa?.gempa;
    const list: GempaItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.slice(0, limit).map(toItem);
  },
};
