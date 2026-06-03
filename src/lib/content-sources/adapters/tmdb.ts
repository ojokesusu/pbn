// TMDB adapter — film/series database, free unlimited for non-commercial.
// Set TMDB_API_KEY on Railway env (the v3 key, NOT the v4 Read Access Token).
//
// source.config shape:
//   { "endpoint": "trending_movie" | "trending_tv" | "popular_movie" |
//                  "discover_movie" | "upcoming",
//     "timeWindow"?: "day" | "week",
//     "language"?: string,
//     "region"?: string }
//
// Endpoint cheatsheet:
//   • trending_movie   — /trending/movie/{day|week}
//   • trending_tv      — /trending/tv/{day|week}
//   • popular_movie    — /movie/popular
//   • discover_movie   — /discover/movie  (use config.params for filters)
//   • upcoming         — /movie/upcoming
//
// Each movie/series → ContentItem with title, overview, release date,
// rating. URL points to TMDB page (rewriter cites TMDB as data source).

import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

interface TmdbConfig {
  endpoint?:
    | "trending_movie"
    | "trending_tv"
    | "popular_movie"
    | "discover_movie"
    | "upcoming";
  timeWindow?: "day" | "week";
  language?: string;
  region?: string;
}

interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  media_type?: string;
  poster_path?: string | null;
}

interface ListResponse {
  results?: MediaItem[];
}

const BASE = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 10_000;

function getKey(): string | null {
  return process.env.TMDB_API_KEY?.trim() || null;
}

function pickTitle(m: MediaItem): string {
  return m.title || m.name || m.original_title || m.original_name || `TMDB #${m.id}`;
}

function pickDate(m: MediaItem): string {
  return m.release_date || m.first_air_date || new Date().toISOString().slice(0, 10);
}

function toItem(m: MediaItem, sourceLabel: string, mediaType: "movie" | "tv"): ContentItem {
  const title = pickTitle(m);
  const year = pickDate(m).slice(0, 4);
  const rating = m.vote_average != null ? `${m.vote_average.toFixed(1)}/10` : "n/a";
  const votes = m.vote_count ?? 0;
  const overview = (m.overview || "").trim() || "Belum ada sinopsis.";
  return {
    title: `${title}${year ? ` (${year})` : ""}`,
    summary: `${overview} Rating TMDB ${rating} dari ${votes.toLocaleString("en-US")} pemilih.`,
    url: `https://www.themoviedb.org/${mediaType}/${m.id}`,
    publishedAt: pickDate(m),
    source: sourceLabel,
    imageUrl: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
  };
}

async function call(
  path: string,
  key: string,
  params: Record<string, string>,
): Promise<ListResponse> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${path} HTTP ${res.status}`);
  return (await res.json()) as ListResponse;
}

export const tmdbAdapter: ContentAdapter = {
  key: "tmdb",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const key = getKey();
    if (!key) {
      console.warn(
        `[tmdb] TMDB_API_KEY not set — source "${source.name}" returning empty`,
      );
      return [];
    }
    const cfg = (source.config as TmdbConfig | null) ?? {};
    const endpoint = cfg.endpoint ?? "trending_movie";
    const language = cfg.language ?? "id-ID";
    const region = cfg.region ?? "ID";
    const timeWindow = cfg.timeWindow ?? "day";

    const params: Record<string, string> = { language, region };

    let path: string;
    let mediaType: "movie" | "tv" = "movie";
    let label = "TMDB";

    switch (endpoint) {
      case "trending_tv":
        path = `/trending/tv/${timeWindow}`;
        mediaType = "tv";
        label = `TMDB Trending TV (${timeWindow})`;
        break;
      case "popular_movie":
        path = "/movie/popular";
        label = "TMDB Popular Movies";
        break;
      case "discover_movie":
        path = "/discover/movie";
        params["sort_by"] = "popularity.desc";
        label = "TMDB Discover Movies";
        break;
      case "upcoming":
        path = "/movie/upcoming";
        label = "TMDB Upcoming Movies";
        break;
      case "trending_movie":
      default:
        path = `/trending/movie/${timeWindow}`;
        label = `TMDB Trending Movies (${timeWindow})`;
        break;
    }

    const data = await call(path, key, params);
    return (data.results || []).slice(0, limit).map((m) => toItem(m, label, mediaType));
  },
};
