// ── PBN Automation Scheduler Engine ──
// Handles: article generation, deployment, cache purge — all automated
// Rules: 4 articles/week/domain, random timing, gradual rollout

import { prisma } from "./db";
import { generateArticleWithClaude, generateBackdates } from "./anthropic";
import type { ArticleSourceContext } from "./anthropic";
import { deployDomain } from "./deploy";
import { ensureThemeForDomain } from "./theme-engine";
import { findZoneByName } from "./cloudflare";
import { submitToIndexNow } from "./google-ping";
import { distributeBacklinks } from "./backlink-distributor";
import { notify, checkMilestones } from "./notifications";
import { fetchNews, fetchFromActiveSources, fetchArticleFull } from "./rss-scraper";
import { fetchFromActiveContentSources } from "./content-sources";
import { pickImages } from "./images";
import { pickProvider } from "./serp";
import { SCHEDULER_CATEGORY_NAMES } from "./category-config";

// Daily rank-check tick batch size — caps SERP API spend per scheduler tick.
// Without this, a 1000-keyword backlog could blow the daily Serper budget in
// one tick. 5/tick × hourly cron = 120/day max, well under typical 1000/day plan.
const RANK_CHECK_BATCH_PER_TICK = 5;

// ── Health-check sub-tick config ──
// SchedulerConfig doesn't (yet) carry a healthCheckHour field, so we hardcode
// three UTC slots per day: 06:00, 14:00, 22:00. Inside each slot we accept any
// tick where minute <= 15 so a slightly-late cron still fires. The 4h
// lastChecked cutoff is the real idempotency gate — a stalled tick can't
// re-check the same domain twice in the same window.
// Batch=200 gives ~3 day full-fleet sweep across 3 windows; existing
// concurrency=10 handles 200/tick fine (20 sequential waves per tick).
const HEALTH_CHECK_HOURS: number[] = [6, 14, 22];
const HEALTH_CHECK_BATCH_PER_TICK = 200;
const HEALTH_CHECK_CUTOFF_MS = 4 * 60 * 60 * 1000; // 4h

// Per-server "unhealthy" notification dedup. Key: serverId. Value: epoch ms of
// last critical alert we fired. We only re-alert if the previous alert was
// >= 6h ago AND we previously observed a healthy state for that server (the
// state transition is detected by reading the Map: missing entry = no recent
// alert = treat current healthy reading as the baseline, then alert on the
// first unhealthy crossing). This keeps a 50% server from spamming every tick.
const SERVER_HEALTH_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastServerHealthAlertAt: Map<string, number> = new Map();

const AUTHOR_NAMES = [
  "Rina Puspitasari", "Ahmad Fauzi", "Dewi Lestari", "Budi Santoso",
  "Siti Nurhaliza", "Raden Pratama", "Maya Indah", "Fikri Ramadhan",
  "Anisa Rahmawati", "Denny Kurniawan", "Putri Wulandari", "Hendra Wijaya",
  "Laras Setiawan", "Fajar Nugroho", "Dian Permata", "Rizky Aditya",
];

const GENRE_KEYWORDS: Record<string, string[]> = {
  Teknologi: ["technology", "computer", "laptop"], Kesehatan: ["health", "fitness", "wellness"],
  Keuangan: ["finance", "money", "investment"], Travel: ["travel", "beach", "mountain"],
  Kuliner: ["food", "cooking", "restaurant"], Fashion: ["fashion", "style", "clothing"],
  Olahraga: ["sports", "fitness", "football"], Pendidikan: ["education", "student", "learning"],
  Berita: ["newspaper", "press", "media"], Otomotif: ["car", "automotive", "motorcycle"],
  Properti: ["real estate", "house", "interior"], Hiburan: ["entertainment", "music", "movie"],
  Bisnis: ["business", "corporate", "startup"], "Seni & Budaya": ["art", "culture", "painting"],
  Lingkungan: ["nature", "forest", "environment"], Parenting: ["family", "children", "baby"],
  Gaming: ["gaming", "esports", "game"], Fotografi: ["photography", "camera", "photo"],
  Musik: ["music", "guitar", "concert"], Pertanian: ["farming", "agriculture", "garden"],
  iGaming: ["gaming setup", "esports arena", "neon gaming", "gaming controller", "gaming chair", "cyber tournament"],
};

async function fetchPexelsImage(genre: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return `https://picsum.photos/seed/${Math.floor(Math.random() * 800) + 100}/1200/630`;
  try {
    const keywords = GENRE_KEYWORDS[genre] || ["news"];
    const query = keywords[Math.floor(Math.random() * keywords.length)];
    const page = Math.floor(Math.random() * 5) + 1;
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}`,
      { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.photos?.length > 0) {
        const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
        return photo.src.large2x || photo.src.large || photo.src.original;
      }
    }
  } catch {}
  return `https://picsum.photos/seed/${Math.floor(Math.random() * 800) + 100}/1200/630`;
}

// Unified image fetcher — Pexels for every genre.
// Pollinations was iGaming-exclusive but turned paid-only 2026-06-06 (HTTP 402),
// so iGaming now falls back to Pexels with iGaming keywords. Per memory there
// are 0 iGaming domains in production, so this baseline is acceptable.
async function fetchArticleImage(genre: string, _title?: string): Promise<string> {
  return fetchPexelsImage(genre);
}

// For iGaming articles we used to inject 2-3 extra Pollinations images after
// <h2> sections. The Pollinations service turned paid-only 2026-06-06 (HTTP
// 402) and was the only AI image source we had, so this is now a no-op.
// pickImages() in the main flow still supplies header + mid-body images via
// Pexels/Unsplash, so the rendered article is not image-less.
function injectExtraImages(content: string, _genre: string, _title: string): string {
  return content;
}

// Inject a <figure> with image into the body HTML at the midpoint —
// splits on the first </p> past the 50% character mark. Used by the new
// pickImages pipeline for the second (middle-body) image.
function injectMidBodyImage(
  content: string,
  imageUrl: string,
  alt: string,
  attribution: string,
): string {
  const midpoint = Math.floor(content.length / 2);
  const closingTag = "</p>";
  const afterMid = content.indexOf(closingTag, midpoint);
  const figure = `<figure><img src="${imageUrl}" alt="${alt}"/><figcaption>${attribution}</figcaption></figure>`;
  if (afterMid === -1) {
    // No </p> after midpoint → just append
    return content + figure;
  }
  const insertAt = afterMid + closingTag.length;
  return content.slice(0, insertAt) + figure + content.slice(insertAt);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
}

async function purgeCloudflareCache(domainUrl: string): Promise<boolean> {
  try {
    const domainName = domainUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    const dnsToken = process.env.CLOUDFLARE_API_TOKEN;
    const purgeToken = process.env.CLOUDFLARE_PURGE_TOKEN;
    if (!dnsToken || !purgeToken) return false;

    const zone = await findZoneByName(domainName);
    if (!zone) return false;

    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${purgeToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ purge_everything: true }),
    });
    const data = await res.json();
    return data.success || false;
  } catch {
    return false;
  }
}

// ── Hybrid RSS+rewrite mode helper ──
// Aggregates articles from operator-curated RssSource rows (active=true),
// scores each by niche-keyword overlap, and picks the best match. If no
// keyword hits anywhere, falls back to the most recent article. If zero
// RssSource rows exist at all, fetches Google News directly via fetchNews.
type DomainForHybrid = {
  id: string;
  genre: string | null;
  nicheMapping?: {
    keywords: string[];
    language: string;
    niche: string;
  } | null;
};

// Build a generic Google News query string from a NicheMapping (used only
// when RssSource table is empty so the hybrid flow still produces something).
function buildQueryFromNiche(
  mapping: DomainForHybrid["nicheMapping"],
  genre: string | null,
): string {
  const keywords = mapping?.keywords?.filter(k => k && k.trim().length > 0) ?? [];
  if (keywords.length > 0) {
    return keywords[Math.floor(Math.random() * keywords.length)];
  }
  return (mapping?.niche || genre || "berita").trim();
}

// Local extension of ArticleSourceContext that also carries the RSS item's
// imageUrl (if any). We don't widen the shared ArticleSourceContext type in
// anthropic.ts — consumers there only need title/content/url. The image flows
// straight to pickImages via the new rss_image adapter.
export type HybridContextWithImage = ArticleSourceContext & { imageUrl?: string };

export async function buildHybridContext(
  domain: DomainForHybrid,
  sourceLimit: number = 3,
): Promise<HybridContextWithImage | null> {
  try {
    const mapping = domain.nicheMapping;
    const language = mapping?.language || "id";
    const region = language.toUpperCase();
    const niche = (mapping?.niche || "").trim();
    const keywords = (mapping?.keywords ?? [])
      .filter(k => k && k.trim().length > 0)
      .map(k => k.toLowerCase());

    // 1. Niche-first dispatch via the ContentSource registry. Pull only from
    //    sources tagged with this domain's niche so politik domains never see
    //    food feeds. Falls through two layers:
    //      a) niche-specific active sources
    //      b) any active source for the language/region
    //      c) raw Google News query as last resort
    let articles: Awaited<ReturnType<typeof fetchFromActiveSources>> = [];

    if (niche) {
      const { items } = await fetchFromActiveContentSources({
        niche,
        language,
        region,
        limit: 20,
      });
      articles = items.map(it => ({
        title: it.title,
        link: it.url,
        summary: it.summary,
        contentSnippet: it.summary,
        published: it.publishedAt,
        source: it.source,
      }));
    }

    if (articles.length === 0) {
      // Niche-specific bucket empty (or no niche on this domain) → wider net.
      const { items } = await fetchFromActiveContentSources({
        language,
        region,
        limit: 20,
      });
      if (items.length > 0) {
        articles = items.map(it => ({
          title: it.title,
          link: it.url,
          summary: it.summary,
          contentSnippet: it.summary,
          published: it.publishedAt,
          source: it.source,
        }));
      }
    }

    if (articles.length === 0) {
      // Even the wider net is empty → fall back to direct Google News.
      const fallbackQuery = buildQueryFromNiche(mapping, domain.genre);
      articles = await fetchNews(fallbackQuery, language, region, 20);
    }

    if (!articles || articles.length === 0) return null;

    // 2. Score by keyword overlap in title + summary.
    //    Articles with no keyword hits get score 0 → bucketed for recency fallback.
    const usable = articles.filter(a => a.title && a.link);

    const scored = usable.map(a => {
      const haystack = `${a.title} ${a.summary || ""}`.toLowerCase();
      const score = keywords.reduce(
        (n, kw) => (haystack.includes(kw) ? n + 1 : n),
        0,
      );
      const publishedAt = a.published ? Date.parse(a.published) : 0;
      return { article: a, score, publishedAt };
    });

    // 3. Pick top by keyword score; if no article hits any keyword, pick most recent.
    scored.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);

    const anyKeywordHit = scored.length > 0 && scored[0].score > 0;
    let chosen;
    if (anyKeywordHit) {
      // Keep among top sourceLimit-scored candidates, pick highest-scoring.
      chosen = scored.slice(0, Math.max(1, sourceLimit))[0];
    } else {
      // No keyword match anywhere → most recent article wins.
      const byRecent = [...scored].sort((a, b) => b.publishedAt - a.publishedAt);
      chosen = byRecent[0];
    }
    if (!chosen) return null;

    const top = chosen.article;

    // Prefer full body; fall back to RSS summary
    let body = "";
    if (top.link) {
      body = await fetchArticleFull(top.link);
    }
    if (!body || body.length < 200) {
      body = top.summary || top.contentSnippet || "";
    }
    if (!body || body.length < 100) return null;

    return {
      title: top.title,
      content: body,
      url: top.link,
      imageUrl: (top as { imageUrl?: string }).imageUrl,
    };
  } catch (err) {
    console.warn(`[scheduler] buildHybridContext failed:`, err);
    return null;
  }
}

// Get or create scheduler config (singleton)
export async function getSchedulerConfig() {
  let config = await prisma.schedulerConfig.findFirst();
  if (!config) {
    config = await prisma.schedulerConfig.create({
      data: { isRunning: false },
    });
  }
  return config;
}

// Calculate next scheduled time for a domain
// Distributes evenly: if 4/week = every ~42 hours, with randomness
// Clamps into the daily window by picking a *random* hour across the whole window
// (not the first 2 hours) so deploys don't cluster in the morning.
function randomHourInWindow(timeStart: number, timeEnd: number): number {
  const span = Math.max(1, timeEnd - timeStart);
  return timeStart + Math.floor(Math.random() * span);
}

// Clamp a candidate time into the daily [timeStart, timeEnd] window interpreted
// as Asia/Jakarta (WIB) wall-clock hours — NOT the Railway container's UTC hours.
// The old code used getHours()/setHours() which on a UTC host treats the window
// 6–23 as 06:00–23:00 UTC = 13:00 WIB–06:00 WIB, leaving a dead gap 07:00–13:00
// WIB where nothing generates/deploys. We shift +7h into a "WIB frame" (so
// getUTCHours reads WIB wall-clock), clamp there, then shift back to the real UTC
// instant to store.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
function clampToWindowWIB(when: Date, timeStart: number, timeEnd: number): Date {
  const wib = new Date(when.getTime() + WIB_OFFSET_MS);
  const hour = wib.getUTCHours();
  if (hour < timeStart) {
    wib.setUTCHours(randomHourInWindow(timeStart, timeEnd));
  } else if (hour > timeEnd) {
    wib.setUTCDate(wib.getUTCDate() + 1);
    wib.setUTCHours(randomHourInWindow(timeStart, timeEnd));
  }
  wib.setUTCMinutes(Math.floor(Math.random() * 60));
  wib.setUTCSeconds(Math.floor(Math.random() * 60));
  return new Date(wib.getTime() - WIB_OFFSET_MS);
}

function calculateNextSchedule(articlesPerWeek: number, timeStart: number, timeEnd: number): Date {
  const hoursPerArticle = (7 * 24) / articlesPerWeek; // e.g., 42 hours for 4/week
  // Add randomness: ±50% jitter
  const jitter = hoursPerArticle * (0.5 + Math.random()); // 50%-150% of interval
  const msFromNow = jitter * 60 * 60 * 1000;

  // Clamp into the daily window in WIB (not the container's UTC hours).
  return clampToWindowWIB(new Date(Date.now() + msFromNow), timeStart, timeEnd);
}

// Idempotently ensure the 5 scheduler-managed Category rows exist for a
// domain. Returns { name -> id } for round-robin / random picking. Safe to
// call from both initialDomainSetup (fresh domain) and generateSingleArticle
// (imported domain that never went through initial setup).
async function ensureSchedulerCategories(domainId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of SCHEDULER_CATEGORY_NAMES) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const cat = await prisma.category.upsert({
      where: { domainId_slug: { domainId, slug } },
      update: {},
      create: { name, slug, description: `Artikel ${name}`, domainId },
    });
    out[name] = cat.id;
  }
  return out;
}

// Initial setup for a brand new domain: create theme + categories + backdated articles
export async function initialDomainSetup(
  domainId: string,
  articleCount: number = 5,
  contentModeOverride?: string,
  imageModeOverride?: "rss_first" | "stock_first",
): Promise<{
  success: boolean;
  articlesCreated: number;
  message: string;
}> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: { theme: true, nicheMapping: true, _count: { select: { articles: true } } },
  });
  if (!domain) return { success: false, articlesCreated: 0, message: "Domain not found" };
  // Adult-quarantine guard: never spend Claude tokens on adult domains.
  if ((domain as { isAdult?: boolean }).isAdult) {
    return { success: false, articlesCreated: 0, message: "Skipped: adult domain quarantined" };
  }

  const genre = domain.genre || "Berita";

  // Per-domain strategy.contentMode wins over the global scheduler config so
  // a blackhat domain can run pure_ai even when global default is hybrid_rss.
  const cfg = await getSchedulerConfig();
  const effectiveContentMode = contentModeOverride ?? cfg.contentMode;
  const hybridMode = effectiveContentMode === "hybrid_rss";
  const hybridLimit = cfg.hybridSourceLimit ?? 3;

  try {
    // 1. Generate theme if needed (race-safe; idempotent when themeId already set).
    if (!domain.themeId) {
      await ensureThemeForDomain(domainId, genre, "scheduler");
    }

    // 2. Create categories
    const dbCats = await ensureSchedulerCategories(domainId);
    const catNames = SCHEDULER_CATEGORY_NAMES;

    // 3. Generate backdated articles
    const publishDates = generateBackdates(articleCount, 4); // spread over 4 months
    const existingTitles: string[] = [];
    let created = 0;

    for (let i = 0; i < articleCount; i++) {
      try {
        // HYBRID mode: fetch a source article from Google News RSS to rewrite.
        // PURE_AI (default): sourceContext stays undefined → existing prompt flow.
        let sourceContext: HybridContextWithImage | undefined;
        if (hybridMode) {
          const ctx = await buildHybridContext(
            { id: domain.id, genre: domain.genre, nicheMapping: domain.nicheMapping },
            hybridLimit,
          );
          sourceContext = ctx ?? undefined;
        }

        const article = await generateArticleWithClaude(
          genre,
          undefined,
          existingTitles,
          sourceContext ? { sourceContext } : undefined,
        );
        existingTitles.push(article.title);
        const slug = slugify(article.title) || `artikel-${Date.now()}-${i}`;
        const existing = await prisma.article.findUnique({
          where: { domainId_slug: { domainId, slug } },
        });
        if (existing) continue;

        let featuredImage = await fetchArticleImage(genre, article.title);
        const authorName = AUTHOR_NAMES[Math.floor(Math.random() * AUTHOR_NAMES.length)];
        const catId = dbCats[catNames[i % catNames.length]];
        let enrichedContent = injectExtraImages(article.content, genre, article.title);

        // New image pipeline: pickImages for header + middle-body.
        // Image failure must NOT block article persistence — wrapped in try/catch.
        try {
          const images = await pickImages({
            niche: domain.nicheMapping?.niche,
            articleUrl: sourceContext?.url,
            rssImageUrl: sourceContext?.imageUrl,
            query: article.title,
            language: "id",
            imageMode: imageModeOverride,
          });
          if (images?.[0]?.url) {
            featuredImage = images[0].url;
          }
          if (images?.[1]?.url) {
            const mid = images[1];
            enrichedContent = injectMidBodyImage(
              enrichedContent,
              mid.url,
              article.title,
              mid.attribution ?? "",
            );
          }
        } catch (imgErr) {
          console.warn(`[scheduler] pickImages failed (initial setup):`, imgErr);
        }

        await prisma.article.create({
          data: {
            title: article.title, slug, content: enrichedContent,
            excerpt: article.excerpt, tags: article.tags,
            authorName, featuredImage, status: "published",
            categoryId: catId, domainId, publishedAt: publishDates[i],
            // Traceability: store source URL when generated via hybrid mode (empty for pure_ai)
            aiSourceUrl: sourceContext?.url ?? "",
          },
        });
        created++;
        if (i < articleCount - 1) await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Initial article ${i + 1} failed:`, err);
      }
    }

    return { success: true, articlesCreated: created, message: `${created}/${articleCount} articles created` };
  } catch (err) {
    return { success: false, articlesCreated: 0, message: String(err).substring(0, 200) };
  }
}

// Generate a single new article for a domain (ongoing content)
export async function generateSingleArticle(
  domainId: string,
  contentModeOverride?: string,
  imageModeOverride?: "rss_first" | "stock_first",
): Promise<{
  success: boolean;
  title?: string;
  message: string;
}> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: {
      articles: { select: { title: true }, orderBy: { createdAt: "desc" }, take: 15 },
      nicheMapping: true,
    },
  });
  if (!domain) return { success: false, message: "Domain not found" };
  // Adult-quarantine guard: never spend Claude tokens on adult domains.
  if ((domain as { isAdult?: boolean }).isAdult) {
    return { success: false, message: "Skipped: adult domain quarantined" };
  }

  const genre = domain.genre || "Berita";
  const existingTitles = domain.articles.map(a => a.title);

  try {
    // Per-domain strategy.contentMode wins over the global scheduler config.
    const cfg = await getSchedulerConfig();
    const effectiveContentMode = contentModeOverride ?? cfg.contentMode;
    let sourceContext: HybridContextWithImage | undefined;
    if (effectiveContentMode === "hybrid_rss") {
      const ctx = await buildHybridContext(
        { id: domain.id, genre: domain.genre, nicheMapping: domain.nicheMapping },
        cfg.hybridSourceLimit ?? 3,
      );
      sourceContext = ctx ?? undefined;
    }

    const article = await generateArticleWithClaude(
      genre,
      undefined,
      existingTitles,
      sourceContext ? { sourceContext } : undefined,
    );
    const slug = slugify(article.title) || `artikel-${Date.now()}`;

    const existing = await prisma.article.findUnique({
      where: { domainId_slug: { domainId, slug } },
    });
    if (existing) return { success: false, message: "Duplicate slug" };

    let featuredImage = await fetchArticleImage(genre, article.title);
    const authorName = AUTHOR_NAMES[Math.floor(Math.random() * AUTHOR_NAMES.length)];
    let enrichedContent = injectExtraImages(article.content, genre, article.title);

    // New image pipeline: pickImages for header + middle-body.
    // Image failure must NOT block article persistence — wrapped in try/catch.
    try {
      const images = await pickImages({
        niche: domain.nicheMapping?.niche,
        articleUrl: sourceContext?.url,
        rssImageUrl: sourceContext?.imageUrl,
        query: article.title,
        language: "id",
        imageMode: imageModeOverride,
      });
      if (images?.[0]?.url) {
        featuredImage = images[0].url;
      }
      if (images?.[1]?.url) {
        const mid = images[1];
        enrichedContent = injectMidBodyImage(
          enrichedContent,
          mid.url,
          article.title,
          mid.attribution ?? "",
        );
      }
    } catch (imgErr) {
      console.warn(`[scheduler] pickImages failed (single article):`, imgErr);
    }

    // Pick a category from the scheduler-managed set only — never from
    // legacy WP imports (BENCANA / ARSIP IJAZAH / UNCATEGORIZED / etc.)
    // Ensure the 5 scheduler categories exist first; safe to call repeatedly.
    const schedCats = await ensureSchedulerCategories(domainId);
    const schedCatIds = Object.values(schedCats);
    const catId = schedCatIds.length > 0
      ? schedCatIds[Math.floor(Math.random() * schedCatIds.length)]
      : null;

    await prisma.article.create({
      data: {
        title: article.title, slug, content: enrichedContent,
        excerpt: article.excerpt, tags: article.tags,
        authorName, featuredImage, status: "published",
        categoryId: catId, domainId, publishedAt: new Date(),
        // Traceability: source URL when via hybrid mode, empty for pure_ai
        aiSourceUrl: sourceContext?.url ?? "",
      },
    });

    return { success: true, title: article.title, message: "Article created" };
  } catch (err) {
    return { success: false, message: String(err).substring(0, 200) };
  }
}

// ── Daily rank-check sub-tick ──
// Picks up to RANK_CHECK_BATCH_PER_TICK active RankKeyword rows that haven't
// been checked in the last 23h, calls the configured SERP provider, and
// persists a RankSnapshot per keyword. Cost is captured per-snapshot
// (RankSnapshot.costUsd); TODO: roll into ApiUsage aggregate when that
// pipeline lands.
//
// Schedule guard: only runs when the current UTC hour matches
// SchedulerConfig.rankCheckHour (default 4 = 04:00 UTC). The 23h lastChecked
// filter is the real idempotency gate — the hour-gate is just a cheap
// short-circuit so most ticks of the day skip the DB query entirely.
async function processRankCheckTick(
  config: Record<string, unknown>,
  now: Date,
): Promise<{ checked: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  const rankHour = (config as { rankCheckHour?: number | null }).rankCheckHour ?? 4;
  if (now.getUTCHours() !== rankHour) {
    return { checked: 0, skipped: 0, errors };
  }

  const provider = pickProvider();
  const cutoff = new Date(now.getTime() - 23 * 60 * 60 * 1000);
  const candidates = await prisma.rankKeyword.findMany({
    where: {
      active: true,
      OR: [{ lastChecked: null }, { lastChecked: { lt: cutoff } }],
    },
    include: { domain: { select: { url: true } } },
    take: RANK_CHECK_BATCH_PER_TICK,
    orderBy: [{ lastChecked: { sort: "asc", nulls: "first" } }],
  });

  let checked = 0;
  let skipped = 0;
  for (const kw of candidates) {
    try {
      const resp = await provider.search({
        keyword: kw.keyword,
        locale: kw.locale,
        region: kw.region,
        device: (kw.device as "desktop" | "mobile") || "desktop",
        num: 100,
      });
      if (!resp) {
        console.warn(`[scheduler] rank-check provider returned null for "${kw.keyword}"`);
        skipped++;
        continue;
      }

      // Match rule precedence:
      //   1. If keyword is bound to a PBN domain → match on domain.url prefix.
      //   2. Else if explicit targetUrl set → match on that prefix.
      //   3. Else → not applicable (position = -1).
      let matchPrefix = "";
      if (kw.domainId && kw.domain?.url) {
        matchPrefix = kw.domain.url;
      } else if (kw.targetUrl) {
        matchPrefix = kw.targetUrl;
      }

      let position = -1;
      let foundUrl = "";
      if (matchPrefix) {
        const hit = resp.results.find(r => r.link?.startsWith(matchPrefix));
        if (hit) {
          position = hit.rank;
          foundUrl = hit.link;
        }
      }

      await prisma.rankSnapshot.create({
        data: {
          keywordId: kw.id,
          position,
          top10Json: resp.results.slice(0, 10) as unknown as object,
          foundUrl,
          costUsd: resp.costUsd ?? 0,
          provider: resp.provider ?? provider.key,
        },
      });
      await prisma.rankKeyword.update({
        where: { id: kw.id },
        data: { lastChecked: now },
      });
      checked++;
    } catch (err) {
      const msg = String(err).substring(0, 200);
      errors.push(`rank-check ${kw.keyword}: ${msg}`);
    }
  }

  return { checked, skipped, errors };
}

// ── Health-check sub-tick ──
// Periodic ping of non-adult Domain rows to keep isAlive / httpStatus /
// lastChecked fresh. Self-gated on UTC hour (HEALTH_CHECK_HOURS) AND a
// minute<=15 forgiveness window so a late-firing cron at minute 14 still
// counts. The 4h lastChecked cutoff is the real idempotency gate.
//
// Implementation note: Agent B's /api/health-check refactor was supposed to
// export a shared checkAndUpdate helper. As of this commit that helper isn't
// exported yet, so we inline a SIMPLIFIED checker here (homepage GET + basic
// alive decision, no WP detection, no SSL probe). When Agent B's helper
// lands, swap the inline checkAndUpdate body for the imported function — the
// rest of this sub-tick (batching, gating, return shape) stays as-is.
async function checkAndUpdate(domain: { id: string; url: string; lastDeployed?: Date | null; isAlive?: boolean; lastChecked?: Date | null }): Promise<{
  isAlive: boolean;
  httpStatus: number;
  responseMs: number;
  errorReason: string;
  errorMessage: string;
}> {
  const start = Date.now();
  let httpStatus = 0;
  let isAlive = false;
  let errorReason = "";
  let errorMessage = "";

  try {
    const res = await fetch(domain.url, {
      method: "GET",
      headers: { "User-Agent": "PBN-Manager-HealthCheck/1.0" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    httpStatus = res.status;
    isAlive = res.status >= 200 && res.status < 400;
    if (!isAlive) {
      errorReason = "http_status";
      errorMessage = `HTTP ${res.status}`;
    }
  } catch (err) {
    const msg = String(err);
    errorMessage = msg.substring(0, 200);
    if (msg.includes("TimeoutError") || msg.includes("timeout")) errorReason = "timeout";
    else if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) errorReason = "dns";
    else if (msg.includes("ECONNREFUSED")) errorReason = "conn_refused";
    else errorReason = "fetch_error";
  }

  const responseMs = Date.now() - start;

  // ── Deploy-wins guard ──────────────────────────────────────────────────
  // Railway US-East egress can't reliably reach Indonesian/EU PBN VPS, so a
  // single failed probe is weaker evidence than a recent deploy worker SSH
  // success. If the worker wrote files within the last 72h AND this probe
  // failed with a network-level / WAF / 5xx error, we refuse to flip
  // isAlive=false. We still update lastChecked + httpStatus + write the
  // health log so the operator can see the probe attempt — we just don't
  // overwrite the deploy worker's ground truth on isAlive.
  const DEPLOY_TRUST_WINDOW_MS = 72 * 60 * 60 * 1000;
  const networkLevelFail =
    !isAlive &&
    (errorReason === "timeout" ||
      errorReason === "dns" ||
      errorReason === "conn_refused" ||
      errorReason === "fetch_error" ||
      httpStatus === 403 ||
      httpStatus >= 500);
  const recentlyDeployed =
    !!domain.lastDeployed &&
    Date.now() - new Date(domain.lastDeployed).getTime() < DEPLOY_TRUST_WINDOW_MS;
  // Extended trust: if a previous probe (local probe, triage script, manual) confirmed
  // alive within the last 7 days AND current probe failed at network level (Railway
  // egress unreachable), trust the prior alive signal. Without this, every HC sweep
  // bleeds alive-flips back to dead because Railway US-East can't reach Indo VPS
  // even when origin is fine.
  const ALIVE_TRUST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const recentlyAliveConfirmed =
    domain.isAlive === true &&
    !!domain.lastChecked &&
    Date.now() - new Date(domain.lastChecked).getTime() < ALIVE_TRUST_WINDOW_MS;
  const trustDeployOverProbe = networkLevelFail && (recentlyDeployed || recentlyAliveConfirmed);

  // Persist Domain row + DomainHealthLog row. Both writes share the same
  // checkedAt timestamp so a downstream join lines up cleanly.
  const checkedAt = new Date();
  const domainUpdateData: { isAlive?: boolean; httpStatus: number; lastChecked: Date } = {
    httpStatus,
    lastChecked: checkedAt,
  };
  if (!trustDeployOverProbe) {
    domainUpdateData.isAlive = isAlive;
  }
  await prisma.domain.update({
    where: { id: domain.id },
    data: domainUpdateData,
  });
  try {
    await prisma.domainHealthLog.create({
      data: {
        domainId: domain.id,
        checkedAt,
        isAlive,
        httpStatus,
        responseMs,
        errorReason,
        errorMessage: errorMessage.substring(0, 500),
      },
    });
  } catch (logErr) {
    // Log persistence is non-critical — keep the Domain update if this fails.
    console.warn(`[scheduler] DomainHealthLog write failed for ${domain.url}:`, logErr);
  }

  return { isAlive, httpStatus, responseMs, errorReason, errorMessage };
}

async function processHealthCheckTick(
  now: Date,
): Promise<{ checked: number; dead: number; alive: number; errors: string[] }> {
  const errors: string[] = [];
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  // Hour-gate: only the three scheduled windows. Minute-gate: forgive the
  // first 15 minutes so a late cron still fires; after that, skip.
  if (!HEALTH_CHECK_HOURS.includes(utcHour) || utcMinute > 15) {
    return { checked: 0, dead: 0, alive: 0, errors };
  }

  const cutoff = new Date(now.getTime() - HEALTH_CHECK_CUTOFF_MS);
  const candidates = await prisma.domain.findMany({
    where: {
      isAdult: false,
      OR: [{ lastChecked: null }, { lastChecked: { lt: cutoff } }],
      NOT: { server: { status: "archived" } },
    },
    // lastDeployed + isAlive + lastChecked pulled so checkAndUpdate can gate
    // the flip-to-dead on (a) recent successful deploy OR (b) previously-confirmed
    // alive within last 7d. Both signals trump a single Railway US-egress probe
    // failure for Indo VPS.
    select: { id: true, url: true, lastDeployed: true, isAlive: true, lastChecked: true },
    orderBy: [{ lastChecked: { sort: "asc", nulls: "first" } }],
    take: HEALTH_CHECK_BATCH_PER_TICK,
  });

  let checked = 0;
  let alive = 0;
  let dead = 0;

  // Modest concurrency so 100 domains complete in ~10s rather than ~13min
  // serial. Mirrors the /api/health-check route's `concurrency = 10`.
  const concurrency = 10;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (d) => {
        try {
          const r = await checkAndUpdate(d);
          return r.isAlive;
        } catch (err) {
          errors.push(`health-check ${d.url}: ${String(err).substring(0, 100)}`);
          return null;
        }
      }),
    );
    for (const r of results) {
      if (r === null) continue;
      checked++;
      if (r) alive++;
      else dead++;
    }
  }

  return { checked, dead, alive, errors };
}

// Per-server health roll-up. Reads the current isAlive distribution per
// server and fires a 'critical' notification when a server with >= 10 domains
// drops below 50% alive. Dedup rule: a fresh alert only fires when either
//   (a) we have no recorded alert for this server, OR
//   (b) the last alert was >= SERVER_HEALTH_ALERT_COOLDOWN_MS ago AND the
//       server has recovered above the 50% threshold at least once since.
// In practice the cooldown alone is enough since we only call this after the
// health-check sub-tick — the Map prevents spamming the same critical state
// every tick of the day.
async function processServerHealthRollup(now: Date): Promise<{ alertsFired: number }> {
  let alertsFired = 0;
  const servers = await prisma.server.findMany({
    where: { status: { not: "archived" } },
    select: {
      id: true,
      name: true,
      // Exclude write-off domains: they are operator-marked dead and (per the Domain.writeOff schema note)
      // excluded from health counts. Counting them in the denominator deflated the alive-rate and fired
      // false "drops below 50% alive" alerts on servers that are actually healthy (e.g. 88-90% of ACTIVE
      // domains alive, but mostly write-off rows dragging the raw ratio under 50%).
      domains: { select: { isAlive: true }, where: { isAdult: false, writeOff: false } },
    },
  });

  for (const srv of servers) {
    const total = srv.domains.length;
    if (total < 10) continue;
    const aliveCount = srv.domains.filter((d) => d.isAlive).length;
    const aliveRate = aliveCount / total;

    if (aliveRate >= 0.5) {
      // Healthy reading — record baseline so the next dip below 0.5 alerts.
      // We DON'T clear the cooldown timestamp here; we just remember that
      // we're currently healthy by removing any stale entry.
      lastServerHealthAlertAt.delete(srv.id);
      continue;
    }

    const last = lastServerHealthAlertAt.get(srv.id);
    if (last && now.getTime() - last < SERVER_HEALTH_ALERT_COOLDOWN_MS) continue;

    const pct = Math.round(aliveRate * 100);
    try {
      await notify({
        type: "health-alert",
        title: `Server ${srv.name} health ${pct}% (${aliveCount}/${total} domains alive)`,
        message: `Server ${srv.name} drops below 50% alive (currently ${aliveCount}/${total}). Investigate.`,
        severity: "error",
        link: `/servers/${srv.id}`,
      });
      lastServerHealthAlertAt.set(srv.id, now.getTime());
      alertsFired++;
    } catch (err) {
      console.warn(`[scheduler] server-health alert failed for ${srv.name}:`, err);
    }
  }

  return { alertsFired };
}

// Process the scheduler tick — called by the cron endpoint
// Finds domains that are due for a new article, generates + deploys
export async function processSchedulerTick(): Promise<{
  processed: number;
  generated: number;
  deployed: number;
  purged: number;
  backlinksPlaced: number;
  ranksChecked: number;
  healthChecked: number;
  healthDead: number;
  healthAlive: number;
  errors: string[];
  perStrategySummary?: Record<string, { articles: number }>;
}> {
  const config = await getSchedulerConfig();
  if (!config.isRunning) return { processed: 0, generated: 0, deployed: 0, purged: 0, backlinksPlaced: 0, ranksChecked: 0, healthChecked: 0, healthDead: 0, healthAlive: 0, errors: [], perStrategySummary: {} };

  const now = new Date();
  const errors: string[] = [];
  let processed = 0, generated = 0, deployed = 0, purged = 0, backlinksPlaced = 0, ranksChecked = 0;
  let healthChecked = 0, healthDead = 0, healthAlive = 0;

  // ── Idempotency lock (EDIT 2) ──
  // Cron platforms (Railway, Vercel) sometimes fire overlapping ticks when a
  // previous run is slow. Without a lock, two ticks pick up the same dueDomains
  // and double-spend Claude tokens. tickLockUntil is a soft mutex: any tick
  // that sees a future value returns early; the owner clears it on exit. The
  // 10-min TTL is the crash safety net — if a tick dies before clearing, the
  // lock auto-expires and the next cron call takes over.
  // Atomic claim using the DATABASE clock (Postgres now()), NOT the container clock. A Railway container
  // whose wall clock drifts behind real time (observed ~7h after an idle/suspend) would otherwise set a
  // fresh lock and then compare it against its own wrong `new Date()`, see the lock as far in the future,
  // and never release it -- a permanent self-lock that stalls every tick. This conditional UPDATE claims
  // the lock only when it is free or already expired per the DB clock, and is race-safe (no read-then-write
  // gap): 0 rows affected means another tick already holds it. The 10-minute TTL is the crash safety net.
  let claimed = 0;
  try {
    claimed = await prisma.$executeRaw`
      UPDATE "pbn"."SchedulerConfig"
      SET "tickLockUntil" = now() + interval '10 minutes'
      WHERE "id" = ${config.id}
        AND ("tickLockUntil" IS NULL OR "tickLockUntil" < now())`;
  } catch (lockErr) {
    console.warn("[scheduler] failed to claim tickLockUntil:", lockErr);
    claimed = 1; // a DB error claiming the lock shouldn't block work -- proceed (matches old behavior on claim failure)
  }
  if (claimed === 0) {
    console.log(`[scheduler] tick already in progress (db-clock lock), skipping`);
    return { processed: 0, generated: 0, deployed: 0, purged: 0, backlinksPlaced: 0, ranksChecked: 0, healthChecked: 0, healthDead: 0, healthAlive: 0, errors: ["locked"], perStrategySummary: {} };
  }

  try {
  // ── Abort-on-cap (EDIT 1) ──
  // BudgetState is monthly (period=YYYY-MM, capCents default 30000=$300/mo).
  // We don't have a daily column, so we derive a daily ceiling = capCents/30
  // and compare against today's ApiUsage.costUsd sum. Asia/Jakarta day window:
  // today_start = UTC midnight - 7h (WIB = UTC+7).
  // If today already burned >= dailyCap, skip the article-gen loop entirely
  // but still let health-check + milestones run (monitoring keeps working
  // when budget is blown). Push "budget_cap_exceeded" into errors so the
  // dashboard surfaces it.
  let budgetCapExceeded = false;
  try {
    const currentPeriod = now.toISOString().slice(0, 7);
    const budget = await prisma.budgetState.findUnique({ where: { period: currentPeriod } });
    const monthlyCapCents = budget?.capCents ?? 30000;
    const dailyCapCents = Math.floor(monthlyCapCents / 30);

    // Asia/Jakarta day boundary: WIB = UTC+7, so a WIB day starts at
    // 17:00 UTC the previous calendar day.
    const jakartaOffsetMs = 7 * 60 * 60 * 1000;
    const jakartaNow = new Date(now.getTime() + jakartaOffsetMs);
    const jakartaMidnight = new Date(Date.UTC(
      jakartaNow.getUTCFullYear(),
      jakartaNow.getUTCMonth(),
      jakartaNow.getUTCDate(),
    ));
    const todayStartUtc = new Date(jakartaMidnight.getTime() - jakartaOffsetMs);

    const usageAgg = await prisma.apiUsage.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: todayStartUtc } },
    });
    const spentTodayCents = Math.round((usageAgg._sum.costUsd ?? 0) * 100);
    if (spentTodayCents >= dailyCapCents) {
      budgetCapExceeded = true;
      errors.push("budget_cap_exceeded");
      console.warn(`[scheduler] budget cap exceeded — today ${spentTodayCents}c >= daily cap ${dailyCapCents}c (monthly ${monthlyCapCents}c / 30). Article-gen loop skipped; health-check + milestones still run.`);
    }
  } catch (budgetErr) {
    // Don't block the tick on budget-check failure — log and continue.
    console.warn("[scheduler] budget abort-check failed:", budgetErr);
  }

  // Pre-load StrategyConfig rows once for the whole tick — used below to
  // attach per-domain strategy multipliers + override articlesPerWeek /
  // contentMode before the article-gen loop.
  // Wrapped in try/catch: if the StrategyConfig table is missing (fresh DB,
  // migration not run, transient DB error) we fall back to whitehat defaults
  // inline so the tick still produces something instead of throwing.
  type StrategyRow = {
    strategy: string;
    articlesPerWeek: number;
    perServerCapMult: number;
    contentMode: string;
    imageMode: string;
  };
  const WHITEHAT_DEFAULT: StrategyRow = {
    strategy: "whitehat",
    articlesPerWeek: 3,
    perServerCapMult: 0.5,
    contentMode: "hybrid_rss",
    imageMode: "rss_first",
  };
  let strategyRows: StrategyRow[] = [];
  try {
    strategyRows = (await prisma.strategyConfig.findMany()) as StrategyRow[];
  } catch (err) {
    console.warn(`[scheduler] StrategyConfig preload failed, falling back to whitehat defaults:`, err);
    strategyRows = [];
  }
  const strategyByKey: Record<string, StrategyRow> = {};
  for (const s of strategyRows) strategyByKey[s.strategy] = s;
  // Per-strategy run summary — keyed by strategy name, accumulated below.
  // Surfaced in the tick result so monitors can see how each bucket performed.
  const perStrategySummary: Record<string, { articles: number }> = {};
  // Base per-server cap from BacklinkConfig — read once, multiplied per-domain below.
  const backlinkCfg = await prisma.backlinkConfig.findFirst();
  const baseServerCap = backlinkCfg?.maxPerServerPerDay ?? 6;

  // Find domains that are due (nextScheduled <= now)
  // Skip adult domains entirely — they should never reach the article-gen pipeline.
  // When budgetCapExceeded, we skip the query entirely so the loop body short-circuits.
  const dueDomains = budgetCapExceeded ? [] : await prisma.domainSchedule.findMany({
    where: {
      isActive: true,
      nextScheduled: { lte: now },
      domain: { isAdult: false },
    },
    include: {
      domain: { include: { server: true, _count: { select: { articles: true } } } },
    },
    take: config.maxDomainsPerDay,
    orderBy: { nextScheduled: "asc" },
  });

  for (const schedule of dueDomains) {
    const domain = schedule.domain;
    processed++;

    // ── Strategy attachment (phase 1: surface only; phase 2 will gate placements by it) ──
    // Look up the StrategyConfig row matching this domain's bucket
    // (whitehat/greyhat/blackhat). Compute the two per-domain values the
    // distributor + cadence calc will read in phase 2:
    //   - perServerCapDaily: base * strategy.perServerCapMult
    //   - articlesPerWeek:   strategy override (falls back to global config)
    // We DON'T pass these into distributeBacklinks() yet — the distributor
    // change lives in a follow-up. For now we just stamp them onto the
    // in-memory domain row so downstream code (and logs) can see them.
    const strategyKey = (domain as { strategy?: string }).strategy || "whitehat";
    // Effective strategy row: DB row → inline whitehat default fallback. The
    // inline fallback covers two cases: (a) StrategyConfig preload threw and
    // strategyByKey is empty, (b) a domain's strategy enum value has no DB
    // row yet (e.g. operator added "greyhat" without seeding the row).
    const strategyCfg = strategyByKey[strategyKey] ?? WHITEHAT_DEFAULT;
    const perServerCapDaily = Math.max(1, Math.round(baseServerCap * strategyCfg.perServerCapMult));
    // OVERRIDE: per-domain articlesPerWeek wins over the global SchedulerConfig
    // value. This is the cadence input for calculateNextSchedule below.
    const domainArticlesPerWeek = strategyCfg.articlesPerWeek ?? config.articlesPerWeek;
    // OVERRIDE: per-domain contentMode wins over the global SchedulerConfig
    // value. Only applied if the strategy row carries an explicit contentMode
    // (defensive — WHITEHAT_DEFAULT always does, but a partial DB row might not).
    // Threaded into initialDomainSetup / generateSingleArticle below so they
    // pick the per-domain mode instead of re-reading the global one.
    const domainContentMode = strategyCfg.contentMode ?? config.contentMode;
    // OVERRIDE: per-domain imageMode wins. picker.ts demotes editorial sources
    // behind unsplash/pexels when 'stock_first' so blackhat domains render
    // clean stock photography instead of branded news shots.
    const rawImageMode = strategyCfg.imageMode ?? "rss_first";
    const domainImageMode: "rss_first" | "stock_first" =
      rawImageMode === "stock_first" ? "stock_first" : "rss_first";
    (domain as unknown as { strategy: { key: string; perServerCapDaily: number; articlesPerWeek: number; contentMode: string; imageMode: string } }).strategy = {
      key: strategyKey,
      perServerCapDaily,
      articlesPerWeek: domainArticlesPerWeek,
      contentMode: domainContentMode,
      imageMode: domainImageMode,
    };

    // Create job record
    const job = await prisma.schedulerJob.create({
      data: {
        domainId: domain.id,
        type: domain._count.articles === 0 ? "initial-setup" : "generate",
        status: "running",
        scheduledAt: schedule.nextScheduled || now,
        startedAt: now,
      },
    });

    try {
      let articlesCreated = 0;
      let filesDeployed = 0;

      if (domain._count.articles === 0) {
        // Initial setup: generate backdated articles
        const result = await initialDomainSetup(domain.id, config.initialArticles, domainContentMode, domainImageMode);
        articlesCreated = result.articlesCreated;
        if (!result.success) throw new Error(result.message);
      } else {
        // Ongoing: generate 1 new article
        const result = await generateSingleArticle(domain.id, domainContentMode, domainImageMode);
        articlesCreated = result.success ? 1 : 0;
        if (!result.success) throw new Error(result.message);
      }
      generated += articlesCreated;
      // Per-strategy roll-up: track how many articles each bucket produced
      // this tick so the monitor surface can compare whitehat/greyhat/blackhat.
      if (articlesCreated > 0) {
        const bucket = perStrategySummary[strategyKey] ?? { articles: 0 };
        bucket.articles += articlesCreated;
        perStrategySummary[strategyKey] = bucket;
      }

      // Auto-deploy if enabled
      if (config.autoDeploy && domain.server) {
        try {
          const deployResult = await deployDomain(domain.id);
          if (deployResult.status === "success") {
            filesDeployed = deployResult.filesDeployed;
            deployed++;
            await notify({
              type: "deploy-success",
              title: `✓ Deploy berhasil: ${domain.name}`,
              message: `${filesDeployed} file terpasang di ${domain.url}`,
              severity: "success",
              link: `/domains/${domain.id}`,
            });
          }
        } catch (err) {
          const msg = String(err).substring(0, 100);
          errors.push(`Deploy ${domain.url}: ${msg}`);
          await notify({
            type: "deploy-failed",
            title: `✗ Deploy gagal: ${domain.name}`,
            message: msg,
            severity: "error",
            link: `/domains/${domain.id}`,
          });
        }
      }

      // Auto-purge cache if enabled
      if (config.autoPurgeCache && filesDeployed > 0) {
        const purgeOk = await purgeCloudflareCache(domain.url);
        if (purgeOk) purged++;
      }

      // Auto-submit to IndexNow (Bing/Yandex) after successful deploy
      if (filesDeployed > 0) {
        try {
          await submitToIndexNow(domain.id);
        } catch {
          // IndexNow failure is non-critical — don't break the job
        }
      }

      // Update job as success
      await prisma.schedulerJob.update({
        where: { id: job.id },
        data: {
          status: "success",
          completedAt: new Date(),
          articlesCreated,
          filesDeployed,
          message: `${articlesCreated} articles, ${filesDeployed} files deployed`,
        },
      });

      // Update domain schedule: set next run time
      // Use strategy-aware articlesPerWeek (falls back to global config inside the attach block above).
      const nextTime = calculateNextSchedule(domainArticlesPerWeek, config.timeWindowStart, config.timeWindowEnd);
      await prisma.domainSchedule.update({
        where: { id: schedule.id },
        data: {
          lastGenerated: now,
          lastDeployedByScheduler: filesDeployed > 0 ? now : undefined,
          nextScheduled: nextTime,
          totalGenerated: { increment: articlesCreated },
        },
      });

    } catch (err) {
      const msg = String(err).substring(0, 200);
      errors.push(`${domain.url}: ${msg}`);
      await prisma.schedulerJob.update({
        where: { id: job.id },
        data: { status: "failed", completedAt: new Date(), message: msg },
      });

      // Still schedule next attempt (don't abandon the domain).
      // Same strategy-aware cadence as the success path.
      const nextTime = calculateNextSchedule(domainArticlesPerWeek, config.timeWindowStart, config.timeWindowEnd);
      await prisma.domainSchedule.update({
        where: { id: schedule.id },
        data: { nextScheduled: nextTime },
      });
    }
  }

  // ── After generation/deploy: distribute backlinks (anti-spam capped) ──
  // Respects daily limit + type priority (MS > MS 2 > LP > RTP > CN).
  // Safe to call every tick — does nothing if cap reached.
  // Phase D: build perServerCapDaily map from this tick's domains (each domain's
  // serverId → its strategy-adjusted daily cap) and pass it through so the
  // distributor enforces per-server placement caps instead of just the global
  // BacklinkConfig.maxPerServerPerDay × strategy.perServerCapMult.
  const perServerCapDailyMap: Record<string, number> = {};
  for (const schedule of dueDomains) {
    const d = schedule.domain as { serverId?: string | null; strategy?: string };
    const sid = d?.serverId;
    if (!sid) continue;
    const sKey = d.strategy || "whitehat";
    const sCfg = strategyByKey[sKey] ?? WHITEHAT_DEFAULT;
    const cap = Math.max(1, Math.round(baseServerCap * sCfg.perServerCapMult));
    // Keep the strictest cap if multiple domains on the same server disagree.
    const existing = perServerCapDailyMap[sid];
    perServerCapDailyMap[sid] =
      typeof existing === "number" ? Math.min(existing, cap) : cap;
  }
  try {
    const backlinkResult = await distributeBacklinks(perServerCapDailyMap);
    backlinksPlaced = backlinkResult.placed;
    if (backlinksPlaced > 0) {
      console.log(`[Scheduler] Distributed ${backlinksPlaced} backlinks (${backlinkResult.remainingToday} left today)`);
      await notify({
        type: "backlink-placed",
        title: `🔗 ${backlinksPlaced} backlink dipasang`,
        message: `Sisa hari ini: ${backlinkResult.remainingToday}/${backlinkResult.dailyLimit}`,
        severity: "info",
        link: "/backlinks",
      });
    }
  } catch (err) {
    errors.push(`Backlink distribute: ${String(err).substring(0, 100)}`);
  }

  // ── Daily rank-check sub-tick ──
  // Self-gated by UTC hour (config.rankCheckHour, default 4 = 04:00 UTC) and
  // by the 23h lastChecked window inside processRankCheckTick. Safe to call
  // every tick — does nothing 23 hours of the day.
  try {
    const rankResult = await processRankCheckTick(config as unknown as Record<string, unknown>, now);
    ranksChecked = rankResult.checked;
    if (rankResult.errors.length > 0) errors.push(...rankResult.errors);
    if (ranksChecked > 0) {
      console.log(`[Scheduler] Rank-check: ${ranksChecked} checked, ${rankResult.skipped} skipped`);
    }
  } catch (err) {
    errors.push(`Rank-check tick: ${String(err).substring(0, 100)}`);
  }

  // ── Health-check sub-tick ──
  // Self-gated by UTC hour (HEALTH_CHECK_HOURS = 06/14/22) + minute<=15 and
  // by the 4h lastChecked cutoff inside processHealthCheckTick. Safe to call
  // every tick — does nothing 21 of 24 hours.
  try {
    const hc = await processHealthCheckTick(now);
    healthChecked = hc.checked;
    healthDead = hc.dead;
    healthAlive = hc.alive;
    if (hc.errors.length > 0) errors.push(...hc.errors);
    if (healthChecked > 0) {
      console.log(`[Scheduler] Health-check: ${healthChecked} checked (${healthAlive} alive, ${healthDead} dead)`);
      // Server roll-up only makes sense right after a fresh batch of checks
      // — otherwise we'd be re-evaluating stale isAlive flags.
      try {
        const ru = await processServerHealthRollup(now);
        if (ru.alertsFired > 0) {
          console.log(`[Scheduler] Server health roll-up fired ${ru.alertsFired} critical alerts`);
        }
      } catch (err) {
        errors.push(`Server health rollup: ${String(err).substring(0, 100)}`);
      }
    }
  } catch (err) {
    errors.push(`Health-check tick: ${String(err).substring(0, 100)}`);
  }

  // Check for milestone notifications (fire once per threshold)
  try {
    await checkMilestones();
  } catch {
    // Non-critical
  }

  return { processed, generated, deployed, purged, backlinksPlaced, ranksChecked, healthChecked, healthDead, healthAlive, errors, perStrategySummary };
  } finally {
    // ── Release idempotency lock (EDIT 2) ──
    // Always clear tickLockUntil so the next cron call can pick up, even if
    // an unhandled throw escaped the tick body. If this update itself fails
    // the 10-min TTL is the safety net.
    try {
      await prisma.schedulerConfig.update({
        where: { id: config.id },
        data: { tickLockUntil: null },
      });
    } catch (unlockErr) {
      console.warn("[scheduler] failed to clear tickLockUntil:", unlockErr);
    }
  }
}

// Activate domains in the scheduler
export async function activateDomains(domainIds: string[], config?: { articlesPerWeek: number; timeStart: number; timeEnd: number }) {
  const cfg = config || { articlesPerWeek: 4, timeStart: 6, timeEnd: 23 };
  let activated = 0;

  // Filter out adult-flagged domains up front so they never enter the schedule.
  const safeDomains = await prisma.domain.findMany({
    where: { id: { in: domainIds }, isAdult: false },
    select: { id: true },
  });
  const allowed = new Set(safeDomains.map((d) => d.id));
  domainIds = domainIds.filter((id) => allowed.has(id));

  for (const domainId of domainIds) {
    // Stagger initial schedule times so they don't all run at once, then clamp
    // into the daily window in WIB (not the container's UTC hours).
    const staggerMs = activated * (Math.random() * 30 + 10) * 60 * 1000; // 10-40 min apart
    const nextTime = clampToWindowWIB(new Date(Date.now() + staggerMs), cfg.timeStart, cfg.timeEnd);

    await prisma.domainSchedule.upsert({
      where: { domainId },
      update: { isActive: true, nextScheduled: nextTime },
      create: { domainId, isActive: true, nextScheduled: nextTime },
    });
    activated++;
  }

  return activated;
}

// Deactivate domains from the scheduler
export async function deactivateDomains(domainIds: string[]) {
  await prisma.domainSchedule.updateMany({
    where: { domainId: { in: domainIds } },
    data: { isActive: false },
  });
}
