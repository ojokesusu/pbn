// ── PBN Automation Scheduler Engine ──
// Handles: article generation, deployment, cache purge — all automated
// Rules: 4 articles/week/domain, random timing, gradual rollout

import { prisma } from "./db";
import { generateArticleWithClaude, generateBackdates } from "./anthropic";
import type { ArticleSourceContext } from "./anthropic";
import { deployDomain } from "./deploy";
import { generateUniqueThemeForGenre } from "./theme-engine";
import { findZoneByName } from "./cloudflare";
import { submitToIndexNow } from "./google-ping";
import { distributeBacklinks } from "./backlink-distributor";
import { notify, checkMilestones } from "./notifications";
import { pollinationsFromGenre } from "./pollinations";
import { fetchNews, fetchFromActiveSources, fetchArticleFull } from "./rss-scraper";

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

// Unified image fetcher — picks between Pexels (stock) and Pollinations (AI).
// iGaming always uses Pollinations (unique per-article AI image).
// Other genres: 50/50 alternating for content variety.
async function fetchArticleImage(genre: string, title?: string): Promise<string> {
  if (genre === "iGaming") {
    return pollinationsFromGenre(genre, title);
  }
  const usePollinations = Math.random() < 0.5;
  if (usePollinations) {
    return pollinationsFromGenre(genre, title);
  }
  return fetchPexelsImage(genre);
}

// For iGaming articles, inject 2-3 extra Pollinations images after <h2> sections
// so the rendered page feels image-heavy and visually rich (client request).
// Non-iGaming genres pass through unchanged.
function injectExtraImages(content: string, genre: string, title: string): string {
  if (genre !== "iGaming") return content;

  const h2Positions: number[] = [];
  const h2Regex = /<\/h2>/gi;
  let match;
  while ((match = h2Regex.exec(content)) !== null) {
    h2Positions.push(match.index + match[0].length);
  }
  if (h2Positions.length === 0) return content;

  // Insert up to 3 images, one after each of the first 3 h2 closing tags
  const injectCount = Math.min(3, h2Positions.length);
  let result = content;
  for (let i = injectCount - 1; i >= 0; i--) {
    const pos = h2Positions[i];
    const seed = Math.floor(Math.random() * 1_000_000);
    const url = pollinationsFromGenre("iGaming", `${title} section ${i + 1}`, { seed });
    const imgTag = `\n<figure style="margin:2rem 0;text-align:center;"><img src="${url}" alt="${title}" loading="lazy" style="max-width:100%;height:auto;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);" /></figure>\n`;
    result = result.slice(0, pos) + imgTag + result.slice(pos);
  }
  return result;
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

export async function buildHybridContext(
  domain: DomainForHybrid,
  sourceLimit: number = 3,
): Promise<ArticleSourceContext | null> {
  try {
    const mapping = domain.nicheMapping;
    const language = mapping?.language || "id";
    const region = language.toUpperCase();
    const keywords = (mapping?.keywords ?? [])
      .filter(k => k && k.trim().length > 0)
      .map(k => k.toLowerCase());

    // 1. Check whether ANY active RssSource exists (regardless of language).
    //    Used to decide between curated-feed flow and Google News fallback.
    const totalActive = await prisma.rssSource.count({ where: { active: true } });

    let articles: Awaited<ReturnType<typeof fetchFromActiveSources>> = [];

    if (totalActive === 0) {
      // No curated sources configured at all → fall back to direct Google News.
      const fallbackQuery = buildQueryFromNiche(mapping, domain.genre);
      articles = await fetchNews(fallbackQuery, language, region, 20);
    } else {
      // Pull from curated sources matching the niche language. Note:
      // fetchFromActiveSources itself falls back to Google News if no active
      // source matches the given language/region.
      articles = await fetchFromActiveSources(language, region, 20);
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

function calculateNextSchedule(articlesPerWeek: number, timeStart: number, timeEnd: number): Date {
  const hoursPerArticle = (7 * 24) / articlesPerWeek; // e.g., 42 hours for 4/week
  // Add randomness: ±50% jitter
  const jitter = hoursPerArticle * (0.5 + Math.random()); // 50%-150% of interval
  const msFromNow = jitter * 60 * 60 * 1000;

  const next = new Date(Date.now() + msFromNow);
  // Clamp to time window — if outside, re-randomize across the WHOLE window
  const hours = next.getHours();
  if (hours < timeStart) {
    next.setHours(randomHourInWindow(timeStart, timeEnd));
  } else if (hours > timeEnd) {
    next.setDate(next.getDate() + 1);
    next.setHours(randomHourInWindow(timeStart, timeEnd));
  }
  // Randomize minutes
  next.setMinutes(Math.floor(Math.random() * 60));
  next.setSeconds(Math.floor(Math.random() * 60));

  return next;
}

// Initial setup for a brand new domain: create theme + categories + backdated articles
export async function initialDomainSetup(domainId: string, articleCount: number = 5): Promise<{
  success: boolean;
  articlesCreated: number;
  message: string;
}> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: { theme: true, nicheMapping: true, _count: { select: { articles: true } } },
  });
  if (!domain) return { success: false, articlesCreated: 0, message: "Domain not found" };

  const genre = domain.genre || "Berita";

  // Read scheduler config once — used to decide hybrid vs pure_ai per article
  const cfg = await getSchedulerConfig();
  const hybridMode = cfg.contentMode === "hybrid_rss";
  const hybridLimit = cfg.hybridSourceLimit ?? 3;

  try {
    // 1. Generate theme if needed
    if (!domain.themeId) {
      const fresh = generateUniqueThemeForGenre(genre, Date.now() + Math.random() * 10000);
      const theme = await prisma.theme.create({
        data: {
          name: `Auto - ${fresh.layoutName} - ${genre} (${fresh.cssPrefix})`,
          templateName: fresh.layoutName, layoutName: fresh.layoutName,
          cssPrefix: fresh.cssPrefix, primaryColor: fresh.primaryColor,
          secondaryColor: fresh.secondaryColor, accentColor: fresh.accentColor,
          bgColor: fresh.bgColor, textColor: fresh.textColor,
          fontFamily: fresh.fontFamily, headingFont: fresh.headingFont,
          borderRadius: fresh.borderRadius, shadowStyle: fresh.shadowStyle,
          spacingScale: fresh.spacingScale, containerWidth: fresh.containerWidth,
          headerStyle: fresh.headerStyle, footerStyle: fresh.footerStyle,
          generatedCss: fresh.generatedCss, isGenerated: true,
        },
      });
      await prisma.domain.update({ where: { id: domainId }, data: { themeId: theme.id } });
    }

    // 2. Create categories
    const catNames = ["Berita", "Tips", "Review", "Tutorial", "Opini"];
    const dbCats: Record<string, string> = {};
    for (const name of catNames) {
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const cat = await prisma.category.upsert({
        where: { domainId_slug: { domainId, slug } },
        update: {},
        create: { name, slug, description: `Artikel ${name}`, domainId },
      });
      dbCats[name] = cat.id;
    }

    // 3. Generate backdated articles
    const publishDates = generateBackdates(articleCount, 4); // spread over 4 months
    const existingTitles: string[] = [];
    let created = 0;

    for (let i = 0; i < articleCount; i++) {
      try {
        // HYBRID mode: fetch a source article from Google News RSS to rewrite.
        // PURE_AI (default): sourceContext stays undefined → existing prompt flow.
        let sourceContext: ArticleSourceContext | undefined;
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

        const featuredImage = await fetchArticleImage(genre, article.title);
        const authorName = AUTHOR_NAMES[Math.floor(Math.random() * AUTHOR_NAMES.length)];
        const catId = dbCats[catNames[i % catNames.length]];
        const enrichedContent = injectExtraImages(article.content, genre, article.title);

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
export async function generateSingleArticle(domainId: string): Promise<{
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

  const genre = domain.genre || "Berita";
  const existingTitles = domain.articles.map(a => a.title);

  try {
    // HYBRID mode: fetch RSS source for rewrite. PURE_AI (default): no source.
    const cfg = await getSchedulerConfig();
    let sourceContext: ArticleSourceContext | undefined;
    if (cfg.contentMode === "hybrid_rss") {
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

    const featuredImage = await fetchArticleImage(genre, article.title);
    const authorName = AUTHOR_NAMES[Math.floor(Math.random() * AUTHOR_NAMES.length)];
    const enrichedContent = injectExtraImages(article.content, genre, article.title);

    // Find a random category for this domain
    const categories = await prisma.category.findMany({ where: { domainId }, take: 5 });
    const catId = categories.length > 0 ? categories[Math.floor(Math.random() * categories.length)].id : null;

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

// Process the scheduler tick — called by the cron endpoint
// Finds domains that are due for a new article, generates + deploys
export async function processSchedulerTick(): Promise<{
  processed: number;
  generated: number;
  deployed: number;
  purged: number;
  backlinksPlaced: number;
  errors: string[];
}> {
  const config = await getSchedulerConfig();
  if (!config.isRunning) return { processed: 0, generated: 0, deployed: 0, purged: 0, backlinksPlaced: 0, errors: [] };

  const now = new Date();
  const errors: string[] = [];
  let processed = 0, generated = 0, deployed = 0, purged = 0, backlinksPlaced = 0;

  // Find domains that are due (nextScheduled <= now)
  const dueDomains = await prisma.domainSchedule.findMany({
    where: {
      isActive: true,
      nextScheduled: { lte: now },
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
        const result = await initialDomainSetup(domain.id, config.initialArticles);
        articlesCreated = result.articlesCreated;
        if (!result.success) throw new Error(result.message);
      } else {
        // Ongoing: generate 1 new article
        const result = await generateSingleArticle(domain.id);
        articlesCreated = result.success ? 1 : 0;
        if (!result.success) throw new Error(result.message);
      }
      generated += articlesCreated;

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
      const nextTime = calculateNextSchedule(config.articlesPerWeek, config.timeWindowStart, config.timeWindowEnd);
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

      // Still schedule next attempt (don't abandon the domain)
      const nextTime = calculateNextSchedule(config.articlesPerWeek, config.timeWindowStart, config.timeWindowEnd);
      await prisma.domainSchedule.update({
        where: { id: schedule.id },
        data: { nextScheduled: nextTime },
      });
    }
  }

  // ── After generation/deploy: distribute backlinks (anti-spam capped) ──
  // Respects daily limit + type priority (MS > MS 2 > LP > RTP > CN).
  // Safe to call every tick — does nothing if cap reached.
  try {
    const backlinkResult = await distributeBacklinks();
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

  // Check for milestone notifications (fire once per threshold)
  try {
    await checkMilestones();
  } catch {
    // Non-critical
  }

  return { processed, generated, deployed, purged, backlinksPlaced, errors };
}

// Activate domains in the scheduler
export async function activateDomains(domainIds: string[], config?: { articlesPerWeek: number; timeStart: number; timeEnd: number }) {
  const cfg = config || { articlesPerWeek: 4, timeStart: 6, timeEnd: 23 };
  let activated = 0;

  for (const domainId of domainIds) {
    // Stagger initial schedule times so they don't all run at once
    const staggerMs = activated * (Math.random() * 30 + 10) * 60 * 1000; // 10-40 min apart
    const nextTime = new Date(Date.now() + staggerMs);
    // Clamp to time window — random hour across the whole window, not just timeStart
    if (nextTime.getHours() < cfg.timeStart) {
      nextTime.setHours(randomHourInWindow(cfg.timeStart, cfg.timeEnd));
    }
    if (nextTime.getHours() > cfg.timeEnd) {
      nextTime.setDate(nextTime.getDate() + 1);
      nextTime.setHours(randomHourInWindow(cfg.timeStart, cfg.timeEnd));
    }
    nextTime.setMinutes(Math.floor(Math.random() * 60));

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
