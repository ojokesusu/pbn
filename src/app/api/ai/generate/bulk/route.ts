import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateArticleWithClaude, generateBackdates } from "@/lib/anthropic";
import { generateUniqueThemeForGenre } from "@/lib/theme-engine";
import { pollinationsFromGenre } from "@/lib/pollinations";

// Image keywords per genre for Pexels
const GENRE_KEYWORDS: Record<string, string[]> = {
  Teknologi: ["technology", "computer", "laptop", "digital"],
  Kesehatan: ["health", "fitness", "healthy food", "wellness"],
  Keuangan: ["business finance", "money", "investment", "office"],
  Travel: ["travel", "beach", "mountain", "adventure"],
  Kuliner: ["food", "cooking", "restaurant", "cuisine"],
  Fashion: ["fashion", "style", "clothing", "outfit"],
  Olahraga: ["sports", "fitness", "football", "gym"],
  Pendidikan: ["education", "student", "learning", "school"],
  Berita: ["newspaper", "press", "journalism", "media"],
  Otomotif: ["car", "automotive", "motorcycle", "vehicle"],
  Properti: ["real estate", "house", "architecture", "interior"],
  Hiburan: ["entertainment", "music", "movie", "concert"],
  Bisnis: ["business", "corporate", "entrepreneur", "teamwork"],
  "Seni & Budaya": ["art", "culture", "painting", "museum"],
  Lingkungan: ["nature", "forest", "green", "environment"],
  Parenting: ["family", "children", "baby", "parenting"],
  Gaming: ["gaming", "esports", "game", "controller"],
  Fotografi: ["photography", "camera", "photo", "lens"],
  Musik: ["music", "guitar", "concert", "piano"],
  Pertanian: ["farming", "agriculture", "garden", "harvest"],
  iGaming: ["gaming setup", "esports arena", "gaming controller", "cyber tournament"],
};

async function fetchPexelsImage(genre: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return `https://picsum.photos/seed/${Math.floor(Math.random() * 800) + 100}/1200/630`;

  try {
    const keywords = GENRE_KEYWORDS[genre] || GENRE_KEYWORDS["Berita"];
    const query = keywords[Math.floor(Math.random() * keywords.length)];
    const page = Math.floor(Math.random() * 3) + 1;
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

// Unified image fetcher — iGaming always uses Pollinations; others 50/50 split.
async function fetchArticleImage(genre: string, title?: string): Promise<string> {
  if (genre === "iGaming") return pollinationsFromGenre(genre, title);
  if (Math.random() < 0.5) return pollinationsFromGenre(genre, title);
  return fetchPexelsImage(genre);
}

// Inject extra Pollinations images into iGaming article content after <h2> sections.
function injectExtraImages(content: string, genre: string, title: string): string {
  if (genre !== "iGaming") return content;
  const positions: number[] = [];
  const regex = /<\/h2>/gi;
  let m;
  while ((m = regex.exec(content)) !== null) positions.push(m.index + m[0].length);
  if (positions.length === 0) return content;
  const count = Math.min(3, positions.length);
  let result = content;
  for (let i = count - 1; i >= 0; i--) {
    const seed = Math.floor(Math.random() * 1_000_000);
    const url = pollinationsFromGenre("iGaming", `${title} section ${i + 1}`, { seed });
    const tag = `\n<figure style="margin:2rem 0;text-align:center;"><img src="${url}" alt="${title}" loading="lazy" style="max-width:100%;height:auto;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);" /></figure>\n`;
    result = result.slice(0, positions[i]) + tag + result.slice(positions[i]);
  }
  return result;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

const AUTHOR_NAMES = [
  "Rina Puspitasari", "Ahmad Fauzi", "Dewi Lestari", "Budi Santoso",
  "Siti Nurhaliza", "Raden Pratama", "Maya Indah", "Fikri Ramadhan",
  "Anisa Rahmawati", "Denny Kurniawan", "Putri Wulandari", "Hendra Wijaya",
  "Laras Setiawan", "Fajar Nugroho", "Dian Permata", "Rizky Aditya",
];

interface BulkResult {
  domainId: string;
  url: string;
  status: "success" | "failed";
  message: string;
  articlesGenerated: number;
  themeGenerated: boolean;
}

// POST — bulk generate AI articles for domains without content
// body: { limit?: number, articlesPerDomain?: number, domainIds?: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { limit = 5, articlesPerDomain = 20, domainIds } = body;

    // Find domains with no articles.
    // Adult-flagged domains are excluded unconditionally — we never spend
    // Claude tokens on them.
    let domains;
    if (domainIds && Array.isArray(domainIds) && domainIds.length > 0) {
      domains = await prisma.domain.findMany({
        where: { id: { in: domainIds }, isAdult: false },
        include: { server: { select: { id: true } }, theme: true, _count: { select: { articles: true } } },
      });
    } else {
      domains = await prisma.domain.findMany({
        where: {
          server: { isNot: null },
          articles: { none: {} }, // no articles at all
          isAdult: false,
        },
        include: { server: { select: { id: true } }, theme: true, _count: { select: { articles: true } } },
        take: limit,
        orderBy: { createdAt: "asc" },
      });
    }

    if (domains.length === 0) {
      return NextResponse.json({
        message: "Tidak ada domain tanpa artikel",
        summary: { total: 0, success: 0, failed: 0, totalArticles: 0 },
        results: [],
      });
    }

    const results: BulkResult[] = [];
    let totalArticles = 0;

    for (const domain of domains) {
      const genre = domain.genre || "Berita";

      try {
        // 1. Auto-generate theme if none exists
        let themeGenerated = false;
        if (!domain.themeId) {
          const fresh = generateUniqueThemeForGenre(genre, Date.now() + Math.random() * 10000);
          const themeName = `AI Fresh - ${fresh.layoutName} - ${genre} (${fresh.cssPrefix})`;
          const theme = await prisma.theme.create({
            data: {
              name: themeName,
              templateName: fresh.layoutName,
              layoutName: fresh.layoutName,
              cssPrefix: fresh.cssPrefix,
              primaryColor: fresh.primaryColor,
              secondaryColor: fresh.secondaryColor,
              accentColor: fresh.accentColor,
              bgColor: fresh.bgColor,
              textColor: fresh.textColor,
              fontFamily: fresh.fontFamily,
              headingFont: fresh.headingFont,
              borderRadius: fresh.borderRadius,
              shadowStyle: fresh.shadowStyle,
              spacingScale: fresh.spacingScale,
              containerWidth: fresh.containerWidth,
              headerStyle: fresh.headerStyle,
              footerStyle: fresh.footerStyle,
              generatedCss: fresh.generatedCss,
              isGenerated: true,
            },
          });
          await prisma.domain.update({
            where: { id: domain.id },
            data: { themeId: theme.id },
          });
          themeGenerated = true;
        }

        // 2. Generate categories for this domain
        const catNames = ["Berita", "Tips", "Review", "Tutorial", "Opini"];
        const dbCats: Record<string, string> = {};
        for (const catName of catNames) {
          const slug = catName.toLowerCase().replace(/\s+/g, "-");
          const cat = await prisma.category.upsert({
            where: { domainId_slug: { domainId: domain.id, slug } },
            update: {},
            create: { name: catName, slug, description: `Artikel ${catName}`, domainId: domain.id },
          });
          dbCats[catName] = cat.id;
        }

        // 3. Generate backdated publish dates
        const publishDates = generateBackdates(articlesPerDomain, 5);

        // 4. Generate articles one by one with Claude
        const existingTitles: string[] = [];
        let generated = 0;

        for (let i = 0; i < articlesPerDomain; i++) {
          try {
            // Generate article text
            const article = await generateArticleWithClaude(genre, undefined, existingTitles);
            existingTitles.push(article.title);

            // Generate slug
            const slug = slugify(article.title) || `artikel-${Date.now()}-${i}`;

            // Check for duplicate slug
            const existing = await prisma.article.findUnique({
              where: { domainId_slug: { domainId: domain.id, slug } },
            });
            if (existing) continue;

            // Fetch featured image (iGaming → Pollinations, others → 50/50 Pexels+Pollinations)
            const featuredImage = await fetchArticleImage(genre, article.title);

            // Pick random author
            const authorName = AUTHOR_NAMES[Math.floor(Math.random() * AUTHOR_NAMES.length)];

            // Pick category
            const catId = dbCats[catNames[i % catNames.length]];

            // Inject extra inline images for iGaming (image-heavy layout)
            const enrichedContent = injectExtraImages(article.content, genre, article.title);

            // Create article with backdated publishedAt
            await prisma.article.create({
              data: {
                title: article.title,
                slug,
                content: enrichedContent,
                excerpt: article.excerpt,
                tags: article.tags,
                authorName,
                featuredImage,
                status: "published",
                categoryId: catId,
                domainId: domain.id,
                publishedAt: publishDates[i],
              },
            });
            generated++;

            // Small delay to avoid rate limiting
            if (i < articlesPerDomain - 1) {
              await new Promise(r => setTimeout(r, 500));
            }
          } catch (artErr) {
            console.error(`Article ${i + 1} for ${domain.url} failed:`, artErr);
            // Continue to next article
          }
        }

        totalArticles += generated;
        results.push({
          domainId: domain.id,
          url: domain.url,
          status: "success",
          message: `${generated}/${articlesPerDomain} artikel di-generate`,
          articlesGenerated: generated,
          themeGenerated,
        });
      } catch (err) {
        results.push({
          domainId: domain.id,
          url: domain.url,
          status: "failed",
          message: String(err).substring(0, 200),
          articlesGenerated: 0,
          themeGenerated: false,
        });
      }
    }

    return NextResponse.json({
      message: `Bulk AI generate selesai: ${results.filter(r => r.status === "success").length} domains, ${totalArticles} articles`,
      summary: {
        total: domains.length,
        success: results.filter(r => r.status === "success").length,
        failed: results.filter(r => r.status === "failed").length,
        totalArticles,
      },
      results,
    });
  } catch (error) {
    console.error("Bulk AI generate failed:", error);
    return NextResponse.json({ error: `Gagal: ${String(error)}` }, { status: 500 });
  }
}

// GET — stats about domains needing fresh content
export async function GET() {
  try {
    const emptyDomains = await prisma.domain.count({
      where: { server: { isNot: null }, articles: { none: {} } },
    });
    const withContent = await prisma.domain.count({
      where: { server: { isNot: null }, articles: { some: {} } },
    });
    const totalArticles = await prisma.article.count();

    return NextResponse.json({
      emptyDomains,
      withContent,
      totalArticles,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
