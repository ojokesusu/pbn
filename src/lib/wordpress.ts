// ── WordPress REST API Scraper (shared library) ──
// Used by both single import and bulk import

import { prisma } from "@/lib/db";
import { ensureThemeForDomain } from "@/lib/theme-engine";

export interface WpPost {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  categories: number[];
  tags: number[];
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
    author?: Array<{ name?: string }>;
  };
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

export interface WpTag {
  id: number;
  name: string;
  slug: string;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function cleanUrl(url: string): string {
  return url.replace(/\/+$/, "").trim();
}

async function fetchAllPages<T>(baseUrl: string, perPage = 100, maxPages = 50, timeout = 12000): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}per_page=${perPage}&page=${page}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PBN-Manager/1.0" },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) break;

      const data = (await res.json()) as T[];
      if (!Array.isArray(data) || data.length === 0) break;

      all.push(...data);

      const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "1");
      if (page >= totalPages) break;
      page++;
    } catch {
      break;
    }
  }

  return all;
}

export interface BulkImportResult {
  domainId: string;
  url: string;
  status: "success" | "failed" | "skipped";
  message: string;
  imported: number;
  totalAvailable: number;
  themeGenerated: boolean;
}

interface BulkImportOptions {
  maxArticlesPerSite?: number;
  prioritizeBacklinkTargets?: boolean;
}

// Score articles for "best" selection
function scoreArticle(post: WpPost): number {
  let score = 0;
  // Newer = higher
  const daysOld = (Date.now() - new Date(post.date).getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < 30) score += 100;
  else if (daysOld < 180) score += 50;
  else if (daysOld < 365) score += 25;
  // Has featured image
  if (post._embedded?.["wp:featuredmedia"]?.[0]?.source_url) score += 30;
  // Longer content = better
  const contentLength = (post.content?.rendered || "").length;
  if (contentLength > 5000) score += 30;
  else if (contentLength > 2000) score += 20;
  else if (contentLength > 500) score += 10;
  // Has categories
  if (post.categories && post.categories.length > 0) score += 10;
  // Has tags
  if (post.tags && post.tags.length > 0) score += 5;
  return score;
}

// Pick best N articles, prioritizing those targeted by backlinks
function pickBestArticles(
  posts: WpPost[],
  siteUrl: string,
  backlinkTargets: Set<string>,
  maxCount: number
): WpPost[] {
  if (posts.length <= maxCount) return posts;

  // Phase 1: Articles linked from our backlinks (MUST keep)
  const targeted: WpPost[] = [];
  const others: WpPost[] = [];

  for (const post of posts) {
    const fullUrl = `${siteUrl}/${post.slug}`.toLowerCase();
    const fullUrlSlash = `${siteUrl}/${post.slug}/`.toLowerCase();
    if (backlinkTargets.has(fullUrl) || backlinkTargets.has(fullUrlSlash)) {
      targeted.push(post);
    } else {
      others.push(post);
    }
  }

  // Phase 2: Sort others by score, take top
  const sorted = others.sort((a, b) => scoreArticle(b) - scoreArticle(a));

  // Combine: targeted first, then top scored
  const remaining = Math.max(0, maxCount - targeted.length);
  return [...targeted, ...sorted.slice(0, remaining)];
}

// Import a single WordPress site into a domain
export async function importWordPressForDomain(
  domainId: string,
  options: BulkImportOptions = {}
): Promise<BulkImportResult> {
  const maxArticles = options.maxArticlesPerSite ?? 20;

  // Get domain
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: { theme: true },
  });

  if (!domain) {
    return {
      domainId,
      url: "",
      status: "failed",
      message: "Domain tidak ditemukan",
      imported: 0,
      totalAvailable: 0,
      themeGenerated: false,
    };
  }

  const siteUrl = cleanUrl(domain.url);
  const apiBase = `${siteUrl}/wp-json/wp/v2`;

  try {
    // Get backlink targets if enabled
    let backlinkTargets = new Set<string>();
    if (options.prioritizeBacklinkTargets !== false) {
      const backlinks = await prisma.backlink.findMany({
        select: { targetUrl: true },
      });
      backlinkTargets = new Set(
        backlinks.map(b => b.targetUrl.toLowerCase().replace(/\/+$/, ""))
          .concat(backlinks.map(b => b.targetUrl.toLowerCase().endsWith("/") ? b.targetUrl.toLowerCase() : b.targetUrl.toLowerCase() + "/"))
      );
    }

    // Fetch posts (with embedded data)
    const allPosts = await fetchAllPages<WpPost>(`${apiBase}/posts?_embed`, 100, 20);
    if (allPosts.length === 0) {
      return {
        domainId,
        url: siteUrl,
        status: "failed",
        message: "Tidak ada post di site ini (REST API kosong / diblokir)",
        imported: 0,
        totalAvailable: 0,
        themeGenerated: false,
      };
    }

    // Fetch categories & tags
    const wpCategories = await fetchAllPages<WpCategory>(`${apiBase}/categories`, 100, 10);
    const wpTags = await fetchAllPages<WpTag>(`${apiBase}/tags`, 100, 10);
    const categoryMap = new Map(wpCategories.map(c => [c.id, c]));
    const tagMap = new Map(wpTags.map(t => [t.id, t]));

    // Pick best N
    const selectedPosts = pickBestArticles(allPosts, siteUrl, backlinkTargets, maxArticles);

    // Auto-generate theme if domain has none (race-safe via shared helper).
    let themeGenerated = false;
    if (!domain.themeId) {
      await ensureThemeForDomain(domainId, domain.genre, "wp-bulk");
      themeGenerated = true;
    }

    // Create categories in DB
    const dbCategoryMap = new Map<number, string>();
    for (const wpCat of wpCategories) {
      if (wpCat.count === 0 && wpCat.slug === "uncategorized") continue;
      try {
        const cat = await prisma.category.upsert({
          where: { domainId_slug: { domainId, slug: wpCat.slug } },
          update: { name: stripHtml(wpCat.name) },
          create: {
            name: stripHtml(wpCat.name),
            slug: wpCat.slug,
            description: stripHtml(wpCat.description),
            domainId,
          },
        });
        dbCategoryMap.set(wpCat.id, cat.id);
      } catch {
        // ignore individual category errors
      }
    }

    // Import selected posts
    let imported = 0;
    for (const post of selectedPosts) {
      const title = stripHtml(post.title.rendered);
      const slug = post.slug;

      // Skip if already exists
      const existing = await prisma.article.findUnique({
        where: { domainId_slug: { domainId, slug } },
      });
      if (existing) continue;

      const primaryCatId = post.categories?.[0];
      const dbCatId = primaryCatId ? dbCategoryMap.get(primaryCatId) : undefined;

      const tagNames = (post.tags || [])
        .map(id => tagMap.get(id)?.name)
        .filter(Boolean)
        .join(", ");

      const featuredImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
      const authorName = post._embedded?.author?.[0]?.name || "Admin";

      try {
        await prisma.article.create({
          data: {
            title,
            slug,
            content: post.content.rendered,
            excerpt: stripHtml(post.excerpt.rendered),
            categoryId: dbCatId || null,
            tags: tagNames,
            authorName,
            featuredImage,
            status: "published",
            aiSourceUrl: `${siteUrl}/${slug}/`,
            domainId,
            publishedAt: new Date(post.date),
          },
        });
        imported++;
      } catch {
        // skip duplicates / errors
      }
    }

    return {
      domainId,
      url: siteUrl,
      status: "success",
      message: `${imported} dari ${allPosts.length} artikel diimport`,
      imported,
      totalAvailable: allPosts.length,
      themeGenerated,
    };
  } catch (error) {
    return {
      domainId,
      url: siteUrl,
      status: "failed",
      message: String(error).substring(0, 200),
      imported: 0,
      totalAvailable: 0,
      themeGenerated: false,
    };
  }
}
