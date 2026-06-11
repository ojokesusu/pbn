// Backfill articles whose featuredImage is empty/missing. Article.featuredImage
// schema default is "" (NOT NULL), so the WHERE filter is
// `featuredImage IS NULL OR featuredImage = ''` — covers both legacy rows
// (pre-default migration) and freshly seeded rows that never got an image.
//
// Pipeline per row: query Unsplash with the title → fall back to Pexels →
// fall back to picsum.photos seed-based URL (so the EJS template at least
// renders a placeholder instead of a broken <img>).
//
// Rate limits we respect:
//   Unsplash demo tier:   50 req/hour per key → ~75s between calls is safe
//   Pexels demo tier:    200 req/hour per key → only used as fallback
//
// Usage:
//   --dry-run       preview without writing
//   --limit N       stop after N articles (default: all)
//   --batch N       DB write batch size (default: 50)

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const batchArg = process.argv.find((a) => a.startsWith("--batch="));
const BATCH = batchArg ? parseInt(batchArg.split("=")[1], 10) : 50;

// Pacing — Unsplash demo tier is 50/hour. ~75s between calls keeps us well
// under cap and avoids 403 rate-limit bursts. Bump to 30s if Sandi has a
// production-tier key (5000/hour).
// Pexels-only mode: Unsplash key missing, so we run on Pexels demo tier
// (200/hour = 18s/req minimum). 20s gives a small buffer against bursts.
const UNSPLASH_INTERVAL_MS = 20_000;

function isString(s) {
  return typeof s === "string" && s.length > 0;
}

async function unsplashSearch(key, query) {
  const params = new URLSearchParams({
    query,
    per_page: "1",
    orientation: "landscape",
    content_filter: "high",
  });
  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.warn(`  unsplash ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json();
  const url = data?.results?.[0]?.urls?.regular;
  return isString(url) ? url : null;
}

async function pexelsSearch(key, query) {
  const params = new URLSearchParams({
    query,
    per_page: "1",
    orientation: "landscape",
  });
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.warn(`  pexels ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json();
  const url = data?.photos?.[0]?.src?.large;
  return isString(url) ? url : null;
}

function picsumFallback() {
  // Deterministic-ish placeholder so the EJS template renders a real image
  // rather than a broken <img>. Seeded on Math.random so rows still get
  // visual variation across the batch.
  const seed = Math.floor(Math.random() * 800) + 100;
  return `https://picsum.photos/seed/${seed}/1200/630`;
}

async function pickImage(unsplashKey, pexelsKeys, title) {
  let url = null;
  if (unsplashKey) {
    try {
      url = await unsplashSearch(unsplashKey, title);
    } catch (e) {
      console.warn(`  unsplash threw: ${e?.cause?.code || e?.message}`);
    }
  }
  if (!url) {
    for (const k of pexelsKeys) {
      try {
        url = await pexelsSearch(k, title);
        if (url) break;
      } catch (e) {
        console.warn(`  pexels threw: ${e?.cause?.code || e?.message}`);
      }
    }
  }
  // Last-resort placeholder so featuredImage is never empty after backfill.
  if (!url) url = picsumFallback();
  return url;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKeys = [process.env.PEXELS_API_KEY, process.env.PEXELS_API_KEY_2].filter(isString);
  if (!unsplashKey && pexelsKeys.length === 0) {
    console.error("No UNSPLASH_ACCESS_KEY and no PEXELS_API_KEY — aborting");
    process.exit(1);
  }
  console.log(`Keys present: unsplash=${!!unsplashKey} pexels=${pexelsKeys.length}`);
  console.log(`Mode: ${DRY ? "DRY RUN" : "WRITE"}`);
  console.log(`Limit: ${LIMIT === Infinity ? "all" : LIMIT}`);
  console.log(`Pacing: ${UNSPLASH_INTERVAL_MS}ms between Unsplash calls`);

  // Replace not just EMPTY featuredImage, but also dead-source URLs that render
  // as broken images on the static deploy:
  //   - /wp-content/uploads/... → legacy WordPress media path; only the article
  //     TEXT was scraped on import, the media library was never migrated, so the
  //     static HTML 404s on these (confirmed: img naturalWidth=0 in-browser).
  //   - pollinations.ai → the image service turned paid (HTTP 402), all dead.
  // These are NON-empty, so the original `IS NULL OR = ''` filter skipped them
  // and they stayed broken on live pages.
  const articles = await client.query(
    `SELECT a.id, a.title, d.name AS domain_name
     FROM "pbn"."Article" a JOIN "pbn"."Domain" d ON d.id = a."domainId"
     WHERE a."featuredImage" IS NULL
        OR a."featuredImage" = ''
        OR a."featuredImage" LIKE '%/wp-content/%'
        OR a."featuredImage" LIKE '%pollinations%'
     -- Process DEAD-source images first (they show a broken <img> icon on live
     -- pages — worst UX), THEN empty (no image, no broken icon). The wp-content
     -- rows were all bulk-imported on one old date, so a plain createdAt DESC
     -- buried them at the back of the queue.
     ORDER BY
       CASE WHEN a."featuredImage" LIKE '%/wp-content/%' THEN 0
            WHEN a."featuredImage" LIKE '%pollinations%' THEN 1
            ELSE 2 END,
       a."createdAt" DESC`,
  );
  const target = articles.rows.slice(0, LIMIT);
  console.log(`\nBackfilling ${target.length} of ${articles.rows.length} affected articles\n`);

  let written = 0;
  const pending = [];

  for (let i = 0; i < target.length; i++) {
    const art = target[i];
    const newUrl = await pickImage(unsplashKey, pexelsKeys, art.title);

    pending.push({ id: art.id, url: newUrl });
    written++;
    console.log(`  [${i + 1}/${target.length}] ${art.domain_name} :: ${art.title.substring(0, 50)} -> ${newUrl.substring(0, 80)}`);

    // Flush batch
    if (pending.length >= BATCH || i === target.length - 1) {
      if (!DRY) {
        await client.query("BEGIN");
        try {
          for (const p of pending) {
            await client.query(
              `UPDATE "pbn"."Article" SET "featuredImage" = $1 WHERE id = $2`,
              [p.url, p.id],
            );
          }
          await client.query("COMMIT");
          console.log(`    -- flushed batch of ${pending.length}, total written: ${written}`);
        } catch (e) {
          await client.query("ROLLBACK");
          console.error("    batch failed:", e.message);
          throw e;
        }
      } else {
        console.log(`    -- [DRY] would flush ${pending.length}`);
      }
      pending.length = 0;
    }

    // Rate-limit pacing
    if (i < target.length - 1) await new Promise((r) => setTimeout(r, UNSPLASH_INTERVAL_MS));
  }

  console.log(`\nDONE: ${written} updated with new image URL`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
