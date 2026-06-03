// Phase 2 ContentSource seed — Tier 1 APIs.
// Inserts/updates rows for the 4 new adapters: coingecko, bmkg,
// api_football, tmdb. Keyed adapters (api_football, tmdb) get rows now;
// adapter returns [] until env keys land — zero crash risk.
//
// URL field is used as a unique-id synthetic string here (not an http URL):
// it disambiguates rows like "coingecko trending" vs "coingecko markets".

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

// Each entry: row that gets upserted into pbn.RssSource.
// config carries adapter-specific params; the adapter reads it back.
const SEEDS = [
  // CoinGecko — public, no key.
  {
    name: "CoinGecko Trending",
    url: "coingecko://trending",
    niche: "crypto",
    type: "api",
    adapter: "coingecko",
    config: { endpoint: "trending", perPage: 7, vsCurrency: "usd" },
  },
  {
    name: "CoinGecko Markets Top 20",
    url: "coingecko://markets/top20",
    niche: "finance",
    type: "api",
    adapter: "coingecko",
    config: { endpoint: "markets", perPage: 20, vsCurrency: "usd" },
  },
  // BMKG — public, no key.
  {
    name: "BMKG Gempa Terkini",
    url: "bmkg://gempaterkini",
    niche: "bencana",
    type: "api",
    adapter: "bmkg",
    config: { endpoint: "gempaterkini" },
  },
  {
    name: "BMKG Gempa Dirasakan",
    url: "bmkg://gempadirasakan",
    niche: "bencana",
    type: "api",
    adapter: "bmkg",
    config: { endpoint: "gempadirasakan" },
  },
  // API-Football — needs API_FOOTBALL_KEY env. Seeded now so the row is
  // already wired; adapter returns [] gracefully until the key lands.
  {
    name: "API-Football Liga 1 Indonesia (2025)",
    url: "api-football://fixtures/league/274/season/2025/next",
    niche: "bola",
    type: "api",
    adapter: "api_football",
    config: { endpoint: "fixtures", league: 274, season: 2025, next: 15 },
  },
  {
    name: "API-Football Liga 1 Standings (2025)",
    url: "api-football://standings/league/274/season/2025",
    niche: "bola",
    type: "api",
    adapter: "api_football",
    config: { endpoint: "standings", league: 274, season: 2025 },
  },
  {
    name: "API-Football EPL Fixtures (2025/26)",
    url: "api-football://fixtures/league/39/season/2025/next",
    niche: "bola",
    type: "api",
    adapter: "api_football",
    config: { endpoint: "fixtures", league: 39, season: 2025, next: 15 },
  },
  {
    name: "API-Football Champions League (2025/26)",
    url: "api-football://fixtures/league/2/season/2025/next",
    niche: "bola",
    type: "api",
    adapter: "api_football",
    config: { endpoint: "fixtures", league: 2, season: 2025, next: 15 },
  },
  // TMDB — needs TMDB_API_KEY env. Same graceful-empty pattern.
  {
    name: "TMDB Trending Movies (day)",
    url: "tmdb://trending/movie/day/id-ID",
    niche: "film",
    type: "api",
    adapter: "tmdb",
    config: { endpoint: "trending_movie", timeWindow: "day", language: "id-ID", region: "ID" },
  },
  {
    name: "TMDB Trending Movies (week)",
    url: "tmdb://trending/movie/week/id-ID",
    niche: "film",
    type: "api",
    adapter: "tmdb",
    config: { endpoint: "trending_movie", timeWindow: "week", language: "id-ID", region: "ID" },
  },
  {
    name: "TMDB Popular Movies Indonesia",
    url: "tmdb://popular/movie/id-ID",
    niche: "film",
    type: "api",
    adapter: "tmdb",
    config: { endpoint: "popular_movie", language: "id-ID", region: "ID" },
  },
  {
    name: "TMDB Upcoming Movies Indonesia",
    url: "tmdb://upcoming/movie/id-ID",
    niche: "film",
    type: "api",
    adapter: "tmdb",
    config: { endpoint: "upcoming", language: "id-ID", region: "ID" },
  },
  {
    name: "TMDB Trending TV (day)",
    url: "tmdb://trending/tv/day/id-ID",
    niche: "tv",
    type: "api",
    adapter: "tmdb",
    config: { endpoint: "trending_tv", timeWindow: "day", language: "id-ID", region: "ID" },
  },
  {
    name: "TMDB Trending TV (week)",
    url: "tmdb://trending/tv/week/id-ID",
    niche: "tv",
    type: "api",
    adapter: "tmdb",
    config: { endpoint: "trending_tv", timeWindow: "week", language: "id-ID", region: "ID" },
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`Seeding ${SEEDS.length} Phase 2 (API) sources...`);
  let inserted = 0, updated = 0, failed = 0;

  for (const s of SEEDS) {
    try {
      const id = `cs_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
      const cfgJson = JSON.stringify(s.config);
      const res = await client.query(
        `
        INSERT INTO "pbn"."RssSource"
          ("id", "name", "url", "niche", "language", "region", "active", "type", "adapter", "config", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, 'id', 'ID', true, $5, $6, $7::jsonb, NOW(), NOW())
        ON CONFLICT ("url") DO UPDATE
          SET "name" = EXCLUDED."name",
              "niche" = EXCLUDED."niche",
              "active" = true,
              "type" = EXCLUDED."type",
              "adapter" = EXCLUDED."adapter",
              "config" = EXCLUDED."config",
              "updatedAt" = NOW()
        RETURNING xmax = 0 AS inserted_new
        `,
        [id, s.name, s.url, s.niche, s.type, s.adapter, cfgJson],
      );
      if (res.rows[0].inserted_new) inserted++;
      else updated++;
    } catch (err) {
      failed++;
      console.warn(`  FAIL ${s.name}: ${err.message?.slice(0, 200)}`);
    }
  }

  // Adapter breakdown
  const breakdown = await client.query(
    `SELECT "adapter", COUNT(*)::int AS c
     FROM "pbn"."RssSource"
     WHERE "active" = true
     GROUP BY "adapter"
     ORDER BY c DESC`,
  );

  console.log(`\nDone: ${inserted} inserted, ${updated} updated, ${failed} failed.`);
  console.log(`\nAdapter breakdown (active rows):`);
  for (const row of breakdown.rows) {
    console.log(`  ${row.adapter.padEnd(15)} ${row.c}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
