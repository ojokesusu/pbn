import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureThemeForDomain } from "@/lib/theme-engine";

// ── WordPress REST API Scraper ──

interface WpPost {
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

interface WpCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

interface WpTag {
  id: number;
  name: string;
  slug: string;
}

interface WpSiteInfo {
  name: string;
  description: string;
  url: string;
}

function stripHtml(html: string): string {
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

function cleanUrl(url: string): string {
  return url.replace(/\/+$/, "").trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "PBN-Manager/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function fetchAllPages<T>(baseUrl: string, perPage = 100): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const maxPages = 50; // safety limit

  while (page <= maxPages) {
    const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}per_page=${perPage}&page=${page}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PBN-Manager/1.0" },
        signal: AbortSignal.timeout(15000),
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wpUrl, domainId, action } = body;

    if (!wpUrl) {
      return NextResponse.json({ error: "WordPress URL diperlukan" }, { status: 400 });
    }

    const siteUrl = cleanUrl(wpUrl);
    const apiBase = `${siteUrl}/wp-json/wp/v2`;

    // ── Step 1: Check if WP REST API is available ──
    let siteInfo: WpSiteInfo;
    try {
      siteInfo = await fetchJson<WpSiteInfo>(`${siteUrl}/wp-json`);
    } catch {
      return NextResponse.json({
        error: `Tidak bisa akses WordPress REST API di ${siteUrl}. Pastikan site aktif dan REST API tidak diblokir.`,
      }, { status: 400 });
    }

    // ── Step 2: Fetch categories ──
    const wpCategories = await fetchAllPages<WpCategory>(`${apiBase}/categories`);
    const categoryMap = new Map(wpCategories.map(c => [c.id, c]));

    // ── Step 3: Fetch tags ──
    const wpTags = await fetchAllPages<WpTag>(`${apiBase}/tags`);
    const tagMap = new Map(wpTags.map(t => [t.id, t]));

    // ── Step 4: Fetch all posts with embedded data ──
    const wpPosts = await fetchAllPages<WpPost>(`${apiBase}/posts?_embed`);

    // ── Preview mode ──
    if (action === "preview") {
      return NextResponse.json({
        site: {
          name: siteInfo.name || siteUrl,
          description: siteInfo.description || "",
          url: siteInfo.url || siteUrl,
        },
        stats: {
          posts: wpPosts.length,
          categories: wpCategories.filter(c => c.count > 0).length,
          tags: wpTags.length,
        },
        posts: wpPosts.slice(0, 10).map(p => ({
          title: stripHtml(p.title.rendered),
          slug: p.slug,
          date: p.date,
          categories: p.categories.map(id => categoryMap.get(id)?.name || "Uncategorized"),
          featuredImage: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "",
          author: p._embedded?.author?.[0]?.name || "Admin",
          excerpt: stripHtml(p.excerpt.rendered).substring(0, 150),
        })),
        categories: wpCategories.filter(c => c.count > 0).map(c => ({
          name: c.name,
          slug: c.slug,
          count: c.count,
        })),
      });
    }

    // ── Import mode — need domainId ──
    if (!domainId) {
      return NextResponse.json({ error: "domainId diperlukan untuk import" }, { status: 400 });
    }

    // Verify domain exists
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      include: { theme: true },
    });

    if (!domain) {
      return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 });
    }

    // ── Step 5: Auto-generate theme if domain has none (race-safe via shared helper) ──
    if (!domain.themeId) {
      await ensureThemeForDomain(domainId, domain.genre, "wp-import");
    }

    // ── Step 6: Create categories in DB ──
    const dbCategoryMap = new Map<number, string>(); // wpCatId -> dbCatId

    for (const wpCat of wpCategories) {
      if (wpCat.count === 0 && wpCat.slug === "uncategorized") continue;

      try {
        const cat = await prisma.category.upsert({
          where: {
            domainId_slug: { domainId, slug: wpCat.slug },
          },
          update: { name: stripHtml(wpCat.name) },
          create: {
            name: stripHtml(wpCat.name),
            slug: wpCat.slug,
            description: stripHtml(wpCat.description),
            domainId,
          },
        });
        dbCategoryMap.set(wpCat.id, cat.id);
      } catch (err) {
        console.error(`Failed to create category ${wpCat.name}:`, err);
      }
    }

    // ── Step 7: Import posts as articles ──
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const post of wpPosts) {
      const title = stripHtml(post.title.rendered);
      const slug = post.slug;

      // Skip if already exists
      const existing = await prisma.article.findUnique({
        where: { domainId_slug: { domainId, slug } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Get category
      const primaryCatId = post.categories[0];
      const dbCatId = primaryCatId ? dbCategoryMap.get(primaryCatId) : undefined;

      // Get tags as comma-separated
      const tagNames = post.tags
        .map(id => tagMap.get(id)?.name)
        .filter(Boolean)
        .join(", ");

      // Get featured image
      const featuredImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";

      // Get author
      const authorName = post._embedded?.author?.[0]?.name || "Admin";

      try {
        await prisma.article.create({
          data: {
            title,
            slug,
            content: post.content.rendered, // Keep HTML content
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
      } catch (err) {
        errors.push(`"${title}": ${String(err).substring(0, 100)}`);
      }
    }

    return NextResponse.json({
      message: `Import selesai! ${imported} artikel diimport, ${skipped} di-skip (sudah ada).`,
      results: {
        siteName: siteInfo.name || siteUrl,
        imported,
        skipped,
        categories: dbCategoryMap.size,
        themeGenerated: !domain.themeId,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("WordPress import failed:", error);
    return NextResponse.json(
      { error: `Import gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}
