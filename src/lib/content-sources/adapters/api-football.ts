// API-Football adapter — fixtures, standings, team news.
// Free tier: 100 req/day; key registered via api-sports.io (NOT RapidAPI;
// RapidAPI variant uses different host header). Set API_FOOTBALL_KEY on
// Railway env when key arrives; adapter gracefully returns [] without it.
//
// source.config shape:
//   { "endpoint": "fixtures" | "standings" | "news",
//     "league": number, "season": number, "next"?: number,
//     "teamId"?: number }
//
// Common league IDs:
//   • 274  — Liga 1 Indonesia
//   • 39   — English Premier League
//   • 140  — La Liga
//   • 78   — Bundesliga
//   • 135  — Serie A
//   • 2    — UEFA Champions League
//
// Each fixture / news item maps to a ContentItem the AI uses as preview
// context ("Tomorrow Persija plays Persib at GBK 19:00 WIB...").

import type { ContentAdapter, ContentItem, ContentSourceRow } from "../types";

interface ApiFootballConfig {
  endpoint?: "fixtures" | "standings";
  league?: number;
  season?: number;
  next?: number;
  teamId?: number;
}

interface FixtureItem {
  fixture: {
    id: number;
    date: string;
    venue?: { name?: string; city?: string };
    status?: { long?: string; short?: string };
  };
  league: { id: number; name: string; round?: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

interface FixturesResponse {
  response: FixtureItem[];
}

interface StandingTeam {
  rank: number;
  team: { id: number; name: string };
  points: number;
  goalsDiff: number;
  all: { played: number; win: number; draw: number; lose: number };
}

interface StandingsResponse {
  response: Array<{
    league: { id: number; name: string; standings: StandingTeam[][] };
  }>;
}

const BASE = "https://v3.football.api-sports.io";
const TIMEOUT_MS = 10_000;

function getKey(): string | null {
  return process.env.API_FOOTBALL_KEY?.trim() || null;
}

async function fetchFixtures(
  cfg: ApiFootballConfig,
  limit: number,
  key: string,
): Promise<ContentItem[]> {
  const url = new URL(`${BASE}/fixtures`);
  if (cfg.league) url.searchParams.set("league", String(cfg.league));
  if (cfg.season) url.searchParams.set("season", String(cfg.season));
  if (cfg.next) url.searchParams.set("next", String(cfg.next));
  if (cfg.teamId) url.searchParams.set("team", String(cfg.teamId));
  if (!cfg.next && !cfg.teamId) url.searchParams.set("next", String(limit));

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API-Football fixtures HTTP ${res.status}`);
  const data = (await res.json()) as FixturesResponse;
  return (data.response || []).slice(0, limit).map((f) => {
    const home = f.teams.home.name;
    const away = f.teams.away.name;
    const score =
      f.goals.home != null && f.goals.away != null
        ? `${f.goals.home}-${f.goals.away}`
        : "vs";
    const title = `${home} ${score} ${away} — ${f.league.name}`;
    const venue = f.fixture.venue?.name
      ? `${f.fixture.venue.name}${f.fixture.venue.city ? ", " + f.fixture.venue.city : ""}`
      : "TBD";
    const round = f.league.round ? ` (${f.league.round})` : "";
    const status = f.fixture.status?.long || "Scheduled";
    return {
      title,
      summary: `${f.league.name}${round}. Venue: ${venue}. Status: ${status}.`,
      url: `https://www.api-football.com/fixture/${f.fixture.id}`,
      publishedAt: f.fixture.date,
      source: `API-Football ${f.league.name}`,
    };
  });
}

async function fetchStandings(
  cfg: ApiFootballConfig,
  limit: number,
  key: string,
): Promise<ContentItem[]> {
  if (!cfg.league || !cfg.season) {
    throw new Error("api-football standings: league + season required in config");
  }
  const url = new URL(`${BASE}/standings`);
  url.searchParams.set("league", String(cfg.league));
  url.searchParams.set("season", String(cfg.season));

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API-Football standings HTTP ${res.status}`);
  const data = (await res.json()) as StandingsResponse;
  const league = data.response?.[0]?.league;
  if (!league) return [];

  const table = (league.standings?.[0] || []).slice(0, limit);
  return table.map((t) => ({
    title: `#${t.rank} ${t.team.name} — ${t.points} poin (${league.name})`,
    summary: `Main ${t.all.played}, menang ${t.all.win}, seri ${t.all.draw}, kalah ${t.all.lose}, selisih gol ${t.goalsDiff >= 0 ? "+" : ""}${t.goalsDiff}.`,
    url: `https://www.api-football.com/teams/${t.team.id}`,
    publishedAt: new Date().toISOString(),
    source: `API-Football ${league.name} Standings`,
  }));
}

export const apiFootballAdapter: ContentAdapter = {
  key: "api_football",
  async fetch(source: ContentSourceRow, limit: number): Promise<ContentItem[]> {
    const key = getKey();
    if (!key) {
      console.warn(
        `[api_football] API_FOOTBALL_KEY not set — source "${source.name}" returning empty`,
      );
      return [];
    }
    const cfg = (source.config as ApiFootballConfig | null) ?? {};
    const endpoint = cfg.endpoint ?? "fixtures";
    if (endpoint === "standings") return fetchStandings(cfg, limit, key);
    return fetchFixtures(cfg, limit, key);
  },
};
