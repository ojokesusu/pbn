// Phase 3 ContentSource seed — Tier 3 cheerio scrapers.
// Only Esportsku is active out of the gate (proven 5 items live).
// The other 5 are seeded inactive with a lastError note explaining the
// state, so the dashboard surfaces them but the scheduler doesn't try to
// pull from them yet. Iterating selectors later is a one-row UPDATE.

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const SEEDS = [
  {
    name: "Esportsku Berita Gaming",
    url: "scraper://esportsku/category/berita-esports",
    niche: "gaming",
    type: "scraper",
    adapter: "scraper_esportsku",
    active: true,
    lastError: null,
  },
  {
    name: "Mommies Daily",
    url: "scraper://mommies-daily/",
    niche: "parenting",
    type: "scraper",
    adapter: "scraper_mommies",
    active: false,
    lastError: "selector pending — Next.js SSR title returns img markup, needs better selector",
  },
  {
    name: "Female Daily Editorial",
    url: "scraper://female-daily/editorial",
    niche: "beauty",
    type: "scraper",
    adapter: "scraper_female_daily",
    active: false,
    lastError: "selector pending — Next.js SSR title returns img markup, needs better selector",
  },
  {
    name: "Rumah.com Panduan",
    url: "scraper://rumah-com/panduan-properti",
    niche: "properti",
    type: "scraper",
    adapter: "scraper_rumah",
    active: false,
    lastError: "selector pending — SPA, articles not in initial HTML (needs Playwright)",
  },
  {
    name: "JobsDB Career Advice",
    url: "scraper://jobsdb/career-advice",
    niche: "karir",
    type: "scraper",
    adapter: "scraper_jobsdb",
    active: false,
    lastError: "HTTP 403 Cloudflare bot detection — needs Playwright or alternate path",
  },
  {
    name: "Glints Lowongan",
    url: "scraper://glints/lowongan-kerja",
    niche: "karir",
    type: "scraper",
    adapter: "scraper_glints",
    active: false,
    lastError: "HTTP 403 Cloudflare bot detection — needs Playwright or alternate path",
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`Seeding ${SEEDS.length} Phase 3 scraper sources...`);
  let inserted = 0, updated = 0, failed = 0;

  for (const s of SEEDS) {
    try {
      const id = `cs_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
      const res = await client.query(
        `
        INSERT INTO "pbn"."RssSource"
          ("id", "name", "url", "niche", "language", "region", "active", "type", "adapter", "config", "lastError", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, 'id', 'ID', $5, $6, $7, NULL, $8, NOW(), NOW())
        ON CONFLICT ("url") DO UPDATE
          SET "name" = EXCLUDED."name",
              "niche" = EXCLUDED."niche",
              "active" = EXCLUDED."active",
              "type" = EXCLUDED."type",
              "adapter" = EXCLUDED."adapter",
              "lastError" = EXCLUDED."lastError",
              "updatedAt" = NOW()
        RETURNING xmax = 0 AS inserted_new
        `,
        [id, s.name, s.url, s.niche, s.active, s.type, s.adapter, s.lastError],
      );
      if (res.rows[0].inserted_new) inserted++;
      else updated++;
    } catch (err) {
      failed++;
      console.warn(`  FAIL ${s.name}: ${err.message?.slice(0, 200)}`);
    }
  }

  const breakdown = await client.query(
    `SELECT "type", COUNT(*)::int AS c, COUNT(*) FILTER (WHERE "active" = true)::int AS active
     FROM "pbn"."RssSource"
     GROUP BY "type"
     ORDER BY c DESC`,
  );

  console.log(`\nDone: ${inserted} inserted, ${updated} updated, ${failed} failed.`);
  console.log(`\nContentSource by type (active / total):`);
  for (const row of breakdown.rows) {
    console.log(`  ${(row.type || "(null)").padEnd(10)} ${row.active} / ${row.c}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
