import ejs from "ejs";
import path from "path";
import fs from "fs/promises";
import { prisma } from "./db";
import { getIndexNowKey, getIndexNowKeyFileContent } from "./google-ping";
import { SCHEDULER_CATEGORY_SLUGS } from "./category-config";

const SCHEDULER_SLUGS = new Set<string>(SCHEDULER_CATEGORY_SLUGS);

const BUILD_DIR = path.join(process.cwd(), "builds");

// ── Inter-PBN Linking: fetch random deployed domains to cross-link ──
interface PbnLink {
  name: string;
  url: string;
  genre: string;
}

async function getRandomPbnLinks(excludeDomainId: string, count: number): Promise<PbnLink[]> {
  // Get all deployed domains except the current one
  const deployed = await prisma.domain.findMany({
    where: {
      lastDeployed: { not: null },
      id: { not: excludeDomainId },
    },
    select: { name: true, url: true, genre: true },
  });

  if (deployed.length === 0) return [];

  // Shuffle and pick `count` random domains
  const shuffled = deployed.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((d) => ({
    name: d.name,
    url: d.url.replace(/\/$/, ""),
    genre: d.genre || "",
  }));
}

interface GeneratedFile {
  path: string;
  content: string;
}

// --- SEO Helper Functions ---

interface SeoPageData {
  pageType: "homepage" | "article" | "category" | "about";
  title: string;
  description: string;
  url: string;
  siteName: string;
  siteUrl: string;
  image?: string;
  publishedAt?: string;
  authorName?: string;
  categoryName?: string;
  categorySlug?: string;
  articleSlug?: string;
}

function generateOgTags(data: SeoPageData): string {
  const ogType = data.pageType === "article" ? "article" : "website";
  const lines = [
    `<!-- Open Graph -->`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:title" content="${escapeHtml(data.title)}">`,
    `<meta property="og:description" content="${escapeHtml(data.description)}">`,
    `<meta property="og:url" content="${data.url}">`,
    `<meta property="og:site_name" content="${escapeHtml(data.siteName)}">`,
    `<meta property="og:locale" content="id_ID">`,
  ];
  if (data.image) {
    lines.push(`<meta property="og:image" content="${data.image}">`);
    lines.push(`<meta property="og:image:alt" content="${escapeHtml(data.title)}">`);
  }
  if (data.pageType === "article" && data.publishedAt) {
    lines.push(`<meta property="article:published_time" content="${data.publishedAt}">`);
  }
  // Twitter Card
  lines.push(`<!-- Twitter Card -->`);
  lines.push(`<meta name="twitter:card" content="${data.image ? "summary_large_image" : "summary"}">`);
  lines.push(`<meta name="twitter:title" content="${escapeHtml(data.title)}">`);
  lines.push(`<meta name="twitter:description" content="${escapeHtml(data.description)}">`);
  if (data.image) {
    lines.push(`<meta name="twitter:image" content="${data.image}">`);
  }
  return lines.join("\n  ");
}

function generateFaviconSvg(letter: string, primaryColor: string): string {
  const l = letter.toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${primaryColor}"/>
  <text x="32" y="44" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">${l}</text>
</svg>`;
}

function generateRssFeed(siteUrl: string, siteName: string, siteDescription: string, articles: Array<{title: string; slug: string; excerpt: string; publishedAt: string; authorName: string; category: string}>): string {
  const items = articles.slice(0, 20).map(a => `    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${siteUrl}/articles/${a.slug}.html</link>
      <guid isPermaLink="true">${siteUrl}/articles/${a.slug}.html</guid>
      <description><![CDATA[${a.excerpt}]]></description>
      <author>${a.authorName}</author>
      <category>${a.category}</category>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
    </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>id</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

function generateWebSiteSchema(siteName: string, siteUrl: string, siteDescription: string): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": siteName,
    "url": siteUrl,
    "description": siteDescription,
    "inLanguage": "id",
    "publisher": {
      "@type": "Organization",
      "name": siteName,
      "url": siteUrl,
    },
  };
  return `<script type="application/ld+json">\n  ${JSON.stringify(schema, null, 2).replace(/\n/g, "\n  ")}\n  </script>`;
}

function generateBreadcrumbSchema(siteUrl: string, siteName: string, breadcrumbs: Array<{name: string; url: string}>): string {
  const items = breadcrumbs.map((b, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "name": b.name,
    "item": b.url,
  }));
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items,
  };
  return `<script type="application/ld+json">\n  ${JSON.stringify(schema, null, 2).replace(/\n/g, "\n  ")}\n  </script>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Decode common HTML entities (numeric + named) used in WordPress content
function decodeHtmlEntities(str: string): string {
  if (!str) return str;
  return str
    // Numeric decimal entities
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    // Numeric hex entities
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Common named entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’");
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function injectBeforeHeadClose(html: string, injection: string): string {
  return html.replace("</head>", `  ${injection}\n</head>`);
}

// --- Logo Generator ---

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function generateLogoSvg(siteName: string, primaryColor: string, secondaryColor: string): string {
  const initials = getInitials(siteName);
  const style = hashString(siteName) % 8;
  const fontSize = initials.length > 1 ? "22" : "28";
  const yPos = initials.length > 1 ? "33" : "34";
  const textEl = `<text x="24" y="${yPos}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">${initials}</text>`;
  const textElColored = textEl.replace('fill="#fff"', `fill="${primaryColor}"`);

  switch (style) {
    case 0: // Circle
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="23" fill="${primaryColor}"/>${textEl}</svg>`;
    case 1: // Rounded square
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="10" fill="${primaryColor}"/>${textEl}</svg>`;
    case 2: // Hexagon
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><polygon points="24,2 44,14 44,34 24,46 4,34 4,14" fill="${primaryColor}"/>${textEl}</svg>`;
    case 3: // Shield
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 54"><path d="M24,2 L44,12 L44,30 C44,42 24,52 24,52 C24,52 4,42 4,30 L4,12 Z" fill="${primaryColor}"/>${textEl}</svg>`;
    case 4: // Diamond
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="4" fill="${primaryColor}" transform="rotate(45 24 24)"/>${textEl}</svg>`;
    case 5: // Gradient circle
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primaryColor}"/><stop offset="100%" stop-color="${secondaryColor}"/></linearGradient></defs><circle cx="24" cy="24" r="23" fill="url(#lg)"/>${textEl}</svg>`;
    case 6: // Outlined circle
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="${primaryColor}" stroke-width="3"/>${textElColored}</svg>`;
    case 7: // Squircle (superellipse approx)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24,2 C38,2 46,10 46,24 C46,38 38,46 24,46 C10,46 2,38 2,24 C2,10 10,2 24,2Z" fill="${primaryColor}"/>${textEl}</svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="23" fill="${primaryColor}"/>${textEl}</svg>`;
  }
}

function injectLogoInHeader(html: string, siteUrl: string, siteName: string): string {
  // Start searching after <body> to skip <title> and other head tags
  const bodyStart = html.indexOf("<body");
  if (bodyStart === -1) return html;

  const afterBody = html.substring(bodyStart);
  const escapedName = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Find first >siteName< after <body> (header/nav area — works with <header>, <nav>, <div>, etc.)
  const regex = new RegExp(`>(\\s*)(${escapedName})(\\s*<)`);
  const match = regex.exec(afterBody);
  if (!match || match.index === undefined) return html;

  const logoImg = `<img src="${siteUrl}/logo.svg" alt="${siteName}" style="height:48px;width:auto;display:inline-block!important;vertical-align:middle;margin-right:12px">`;
  const insertPos = bodyStart + match.index + 1 + match[1].length;
  return html.substring(0, insertPos) + logoImg + html.substring(insertPos);
}

export async function generateSite(domainId: string): Promise<{ files: GeneratedFile[]; buildPath: string }> {
  // Fetch all data for this domain
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: {
      theme: true,
      articles: {
        where: { status: "published" },
        include: { comments: true, category: true },
        orderBy: { publishedAt: "desc" },
      },
      categories: true,
    },
  });

  if (!domain) throw new Error("Domain not found");

  const theme = domain.theme || {
    templateName: "developer",
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    accentColor: "#f59e0b",
    bgColor: "#ffffff",
    textColor: "#111827",
    fontFamily: "Inter",
    headerStyle: "centered",
    footerStyle: "simple",
    customCss: "",
    isGenerated: false,
    generatedCss: "",
    cssPrefix: "",
    headingFont: "Inter",
    borderRadius: "8px",
    shadowStyle: "0 1px 3px rgba(0,0,0,0.1)",
    spacingScale: "1",
    containerWidth: "1100px",
    layoutName: "single-column",
  };

  const isGenerated = theme.isGenerated && theme.generatedCss;
  let templateName = isGenerated ? theme.layoutName : (theme.templateName || "developer");

  // Auto-migrate old layouts (deleted) to new ones
  // If the theme uses a layout that no longer exists, regenerate it on the fly
  const NEW_LAYOUTS = ["berita", "blog", "magazine"];
  if (isGenerated && !NEW_LAYOUTS.includes(templateName)) {
    const { generateUniqueThemeForGenre } = await import("./theme-engine");
    const fresh = generateUniqueThemeForGenre(domain.genre || "Teknologi", Date.now() + Math.random() * 10000);
    // Update the theme record with new layout + CSS
    await prisma.theme.update({
      where: { id: theme.id },
      data: {
        layoutName: fresh.layoutName,
        templateName: fresh.layoutName,
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
      },
    });
    // Update the in-memory theme object so the rest of generateSite() uses the new values
    theme.layoutName = fresh.layoutName;
    theme.templateName = fresh.layoutName;
    theme.cssPrefix = fresh.cssPrefix;
    theme.primaryColor = fresh.primaryColor;
    theme.secondaryColor = fresh.secondaryColor;
    theme.accentColor = fresh.accentColor;
    theme.bgColor = fresh.bgColor;
    theme.textColor = fresh.textColor;
    theme.fontFamily = fresh.fontFamily;
    theme.headingFont = fresh.headingFont;
    theme.borderRadius = fresh.borderRadius;
    theme.shadowStyle = fresh.shadowStyle;
    theme.spacingScale = fresh.spacingScale;
    theme.containerWidth = fresh.containerWidth;
    theme.headerStyle = fresh.headerStyle;
    theme.footerStyle = fresh.footerStyle;
    theme.generatedCss = fresh.generatedCss;
    templateName = fresh.layoutName;
  } else if (isGenerated) {
    // Always regenerate CSS from current params, so updates to theme-layouts.ts
    // automatically apply on next deploy without re-running the migration
    const { generateCssForLayout } = await import("./theme-engine");
    const freshCss = generateCssForLayout(theme.layoutName, theme.cssPrefix, {
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      accentColor: theme.accentColor,
      bgColor: theme.bgColor,
      textColor: theme.textColor,
      fontFamily: theme.fontFamily,
      headingFont: theme.headingFont || theme.fontFamily,
      borderRadius: theme.borderRadius,
      shadowStyle: theme.shadowStyle,
      spacingScale: theme.spacingScale,
      containerWidth: theme.containerWidth,
      headerStyle: theme.headerStyle,
      footerStyle: theme.footerStyle,
    });
    theme.generatedCss = freshCss;
    // Persist for visibility (optional but useful)
    await prisma.theme.update({
      where: { id: theme.id },
      data: { generatedCss: freshCss },
    });
  }

  const TEMPLATES_DIR = isGenerated
    ? path.join(process.cwd(), "src", "templates", "base-layouts", templateName)
    : path.join(process.cwd(), "src", "templates", theme.templateName || "developer");

  const siteUrl = domain.url.replace(/\/$/, "");
  const siteName = domain.name;
  const siteDescription = `${domain.name} - Your source for the latest articles and insights`;

  // ── Inter-PBN Linking ──
  // Pick 2-4 random OTHER deployed PBN domains to link to from footer/content.
  // This creates crawl paths so Google discovers new domains via already-indexed ones.
  const pbnLinks = await getRandomPbnLinks(domainId, 4);

  // Common template data
  const commonData = {
    siteName,
    siteUrl,
    siteDescription,
    fontFamily: theme.fontFamily,
    headerStyle: theme.headerStyle,
    footerStyle: theme.footerStyle,
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    bgColor: theme.bgColor,
    textColor: theme.textColor,
    // Render nav using ONLY scheduler-managed category slugs. Legacy WP
    // imports (BENCANA / AJI SEMARANG / ARSIP IJAZAH / UNCATEGORIZED / etc.)
    // are kept in the DB so historic articles still resolve, but they NEVER
    // surface in nav anymore — the previous "≥2 articles" heuristic let
    // big legacy buckets out-rank fresh scheduler categories.
    categories: (() => {
      const catWithCount = domain.categories
        .filter((c) => SCHEDULER_SLUGS.has(c.slug))
        .map((c) => ({
          name: decodeHtmlEntities(c.name),
          slug: c.slug,
          description: c.description,
          count: domain.articles.filter(a => a.categoryId === c.id).length,
        }));
      catWithCount.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return catWithCount.slice(0, 6).map(c => ({ name: c.name, slug: c.slug, description: c.description }));
    })(),
    // Extra variables for engine-generated themes
    headingFont: theme.headingFont || theme.fontFamily,
    borderRadius: theme.borderRadius || "8px",
    shadowStyle: theme.shadowStyle || "0 1px 3px rgba(0,0,0,0.1)",
    spacingScale: theme.spacingScale || "1",
    containerWidth: theme.containerWidth || "1100px",
    generatedCss: theme.generatedCss || "",
    cssPrefix: theme.cssPrefix || "",
    // Inter-PBN links for footer (2-4 random deployed domains)
    pbnLinks,
  };

  const files: GeneratedFile[] = [];

  // Read templates
  const [indexTemplate, articleTemplate, categoryTemplate, aboutTemplate] =
    await Promise.all([
      fs.readFile(path.join(TEMPLATES_DIR, "index.ejs"), "utf-8"),
      fs.readFile(path.join(TEMPLATES_DIR, "article.ejs"), "utf-8"),
      fs.readFile(path.join(TEMPLATES_DIR, "category.ejs"), "utf-8"),
      fs.readFile(path.join(TEMPLATES_DIR, "about.ejs"), "utf-8"),
    ]);

  // For generated themes, use a shared sitemap template and skip separate CSS
  const sitemapTemplatePath = isGenerated
    ? path.join(process.cwd(), "src", "templates", "developer", "sitemap.ejs")
    : path.join(TEMPLATES_DIR, "sitemap.ejs");
  const sitemapTemplate = await fs.readFile(sitemapTemplatePath, "utf-8");

  const cssTemplate = isGenerated
    ? ""
    : await fs.readFile(path.join(TEMPLATES_DIR, "assets", "style.css"), "utf-8");

  // Format articles for templates
  const formattedArticles = domain.articles.map((a) => ({
    title: decodeHtmlEntities(a.title),
    slug: a.slug,
    content: a.content,
    excerpt: decodeHtmlEntities(a.excerpt || a.content.replace(/<[^>]*>/g, "").substring(0, 160) + "..."),
    category: decodeHtmlEntities(a.category?.name || ""),
    categorySlug: a.category?.slug || "",
    tags: a.tags,
    authorName: a.authorName,
    featuredImage: a.featuredImage,
    // Indonesian-formatted human-readable date for templates
    publishedAt: a.publishedAt
      ? new Date(a.publishedAt).toLocaleDateString("id-ID", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
    // ISO format for SEO meta tags
    publishedAtIso: a.publishedAt?.toISOString() || "",
    publishedDate: a.publishedAt
      ? new Date(a.publishedAt).toLocaleDateString("id-ID", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
  }));

  // Common SEO links injected into every page's <head>
  const faviconLink = `<link rel="icon" type="image/svg+xml" href="${siteUrl}/favicon.svg">`;
  const rssLink = `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteName)}" href="${siteUrl}/feed.xml">`;
  const commonSeoLinks = `${faviconLink}\n  ${rssLink}`;

  // Get first article image as fallback OG image for non-article pages
  const fallbackImage = formattedArticles.find(a => a.featuredImage)?.featuredImage || "";

  // For homepage display: prioritize articles with featured images for hero/cards.
  // Stable sort: articles with images first, otherwise keep original (newest) order.
  const homepageArticles = [...formattedArticles].sort((a, b) => {
    const aHas = a.featuredImage ? 1 : 0;
    const bHas = b.featuredImage ? 1 : 0;
    return bHas - aHas;
  });

  // 1. Generate index.html + inject SEO
  let indexHtml = ejs.render(indexTemplate, {
    ...commonData,
    articles: homepageArticles,
  });
  const indexOg = generateOgTags({
    pageType: "homepage",
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    siteName,
    siteUrl,
    image: fallbackImage,
  });
  const websiteSchema = generateWebSiteSchema(siteName, siteUrl, siteDescription);
  indexHtml = injectBeforeHeadClose(indexHtml, `${commonSeoLinks}\n  ${indexOg}\n  ${websiteSchema}`);
  files.push({ path: "index.html", content: indexHtml });

  // 2. Generate article pages + inject SEO
  for (const article of domain.articles) {
    const formatted = formattedArticles.find((a) => a.slug === article.slug)!;
    const comments = article.comments.map((c) => ({
      authorName: c.authorName,
      content: c.content,
      avatarUrl: c.avatarUrl,
      date: new Date(c.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    }));

    let articleHtml = ejs.render(articleTemplate, {
      ...commonData,
      article: formatted,
      comments,
    });
    const articleUrl = `${siteUrl}/articles/${article.slug}.html`;
    const articleOg = generateOgTags({
      pageType: "article",
      title: `${formatted.title} - ${siteName}`,
      description: formatted.excerpt,
      url: articleUrl,
      siteName,
      siteUrl,
      image: formatted.featuredImage || fallbackImage,
      publishedAt: formatted.publishedAtIso,
      authorName: formatted.authorName,
      categoryName: formatted.category,
      categorySlug: formatted.categorySlug,
      articleSlug: article.slug,
    });
    const breadcrumbs = generateBreadcrumbSchema(siteUrl, siteName, [
      { name: "Beranda", url: siteUrl },
      ...(formatted.category ? [{ name: formatted.category, url: `${siteUrl}/category/${formatted.categorySlug}.html` }] : []),
      { name: formatted.title, url: articleUrl },
    ]);
    articleHtml = injectBeforeHeadClose(articleHtml, `${commonSeoLinks}\n  ${articleOg}\n  ${breadcrumbs}`);

    // ── Inject inter-PBN link inside article content ──
    // Add a "Baca Juga" (Related Reading) link naturally inside the article body.
    // Only 1 link per article, randomly picked from pbnLinks. Not every article gets one.
    if (pbnLinks.length > 0 && Math.random() < 0.6) {
      const pbnLink = pbnLinks[Math.floor(Math.random() * pbnLinks.length)];
      const bacaJugaHtml = `<p><strong>Baca Juga:</strong> <a href="${pbnLink.url}" target="_blank" rel="noopener">${pbnLink.name}</a></p>`;
      // Insert before the last </p> or </div> in the article content area
      articleHtml = articleHtml.replace(
        /(<\/article>)/i,
        `${bacaJugaHtml}\n$1`
      );
    }

    files.push({ path: `articles/${article.slug}.html`, content: articleHtml });
  }

  // 3. Generate category pages + inject SEO
  for (const category of domain.categories) {
    const categoryArticles = formattedArticles
      .filter((a) => a.categorySlug === category.slug)
      // Sort: articles with images first
      .sort((a, b) => (b.featuredImage ? 1 : 0) - (a.featuredImage ? 1 : 0));

    let categoryHtml = ejs.render(categoryTemplate, {
      ...commonData,
      category: {
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
      articles: categoryArticles,
    });
    const catUrl = `${siteUrl}/category/${category.slug}.html`;
    const catOg = generateOgTags({
      pageType: "category",
      title: `${category.name} - ${siteName}`,
      description: category.description || `Artikel tentang ${category.name}`,
      url: catUrl,
      siteName,
      siteUrl,
      image: fallbackImage,
    });
    const catBreadcrumbs = generateBreadcrumbSchema(siteUrl, siteName, [
      { name: "Beranda", url: siteUrl },
      { name: category.name, url: catUrl },
    ]);
    categoryHtml = injectBeforeHeadClose(categoryHtml, `${commonSeoLinks}\n  ${catOg}\n  ${catBreadcrumbs}`);
    files.push({ path: `category/${category.slug}.html`, content: categoryHtml });
  }

  // 4. Generate about.html + inject SEO
  let aboutHtml = ejs.render(aboutTemplate, commonData);
  const aboutOg = generateOgTags({
    pageType: "about",
    title: `Tentang - ${siteName}`,
    description: `Tentang ${siteName}. ${siteDescription}`,
    url: `${siteUrl}/about.html`,
    siteName,
    siteUrl,
    image: fallbackImage,
  });
  aboutHtml = injectBeforeHeadClose(aboutHtml, `${commonSeoLinks}\n  ${aboutOg}`);
  files.push({ path: "about.html", content: aboutHtml });

  // 5. Generate sitemap.xml
  const sitemapXml = ejs.render(sitemapTemplate, {
    ...commonData,
    articles: formattedArticles,
  });
  files.push({ path: "sitemap.xml", content: sitemapXml });

  // 6. Generate robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml`;
  files.push({ path: "robots.txt", content: robotsTxt });

  // 6a. Generate .htaccess — override any existing WordPress .htaccess
  // Forces Apache to serve index.html first, disables WP rewrites, adds caching
  const htaccessContent = `# PBN Static Site - Auto-generated, replaces WordPress .htaccess
# Prefer static HTML over PHP
DirectoryIndex index.html index.htm index.php

# Disable WordPress rewrite rules
<IfModule mod_rewrite.c>
RewriteEngine Off
</IfModule>

# Cache static assets aggressively
<IfModule mod_expires.c>
ExpiresActive On
ExpiresByType text/html "access plus 1 hour"
ExpiresByType text/css "access plus 1 month"
ExpiresByType image/svg+xml "access plus 1 month"
ExpiresByType image/jpeg "access plus 1 month"
ExpiresByType image/png "access plus 1 month"
ExpiresByType image/webp "access plus 1 month"
ExpiresByType application/rss+xml "access plus 1 hour"
</IfModule>

# Block direct access to old WordPress files
<FilesMatch "^(wp-config\\.php|wp-config-sample\\.php|wp-blog-header\\.php|wp-load\\.php|wp-settings\\.php|wp-cron\\.php|wp-mail\\.php|wp-trackback\\.php|wp-signup\\.php|wp-activate\\.php|wp-links-opml\\.php|wp-comments-post\\.php|xmlrpc\\.php|readme\\.html|license\\.txt)$">
  Require all denied
</FilesMatch>

# Block access to WordPress admin/includes directories
RedirectMatch 404 ^/wp-admin/.*$
RedirectMatch 404 ^/wp-includes/.*$
RedirectMatch 404 ^/wp-content/plugins/.*$
RedirectMatch 404 ^/wp-content/themes/.*$

# Custom error pages
ErrorDocument 404 /index.html
`;
  files.push({ path: ".htaccess", content: htaccessContent });

  // 6b. Override index.php — failsafe in case .htaccess is ignored
  // Just redirects to index.html
  const indexPhpContent = `<?php
// PBN Static Site - WordPress disabled
header("Location: /index.html");
exit;
`;
  files.push({ path: "index.php", content: indexPhpContent });

  // 6c. Override wp-config.php — neutralize WordPress entirely
  const wpConfigContent = `<?php
// PBN Static Site - WordPress disabled
header("Location: /index.html");
exit;
`;
  files.push({ path: "wp-config.php", content: wpConfigContent });

  // 7. Generate RSS feed (feed.xml)
  const rssFeed = generateRssFeed(siteUrl, siteName, siteDescription, formattedArticles);
  files.push({ path: "feed.xml", content: rssFeed });

  // 8. Generate SVG favicon
  const faviconLetter = siteName.charAt(0) || "S";
  const faviconColor = theme.primaryColor || "#2563eb";
  const faviconSvg = generateFaviconSvg(faviconLetter, faviconColor);
  files.push({ path: "favicon.svg", content: faviconSvg });

  // 9. Generate SVG logo for header
  const logoSvg = generateLogoSvg(siteName, theme.primaryColor || "#2563eb", theme.secondaryColor || "#1e40af");
  files.push({ path: "logo.svg", content: logoSvg });

  // 9b. Generate IndexNow key file for Bing/Yandex indexing
  const indexNowKey = getIndexNowKey();
  files.push({ path: `${indexNowKey}.txt`, content: getIndexNowKeyFileContent() });

  // 10. Generate style.css with theme colors (skip for engine-generated themes)
  if (!isGenerated) {
    const css = ejs.render(cssTemplate, {
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      accentColor: theme.accentColor,
      bgColor: theme.bgColor,
      textColor: theme.textColor,
      fontFamily: theme.fontFamily,
    });
    files.push({ path: "assets/style.css", content: css });

    // 11. Add custom CSS if any
    if (theme.customCss) {
      const fullCss = css + "\n\n/* Custom Styles */\n" + theme.customCss;
      files[files.length - 1].content = fullCss;
    }
  }

  // 12. For engine-generated themes, replace {{PREFIX}} with cssPrefix in all HTML files
  if (isGenerated && theme.cssPrefix) {
    for (const file of files) {
      if (file.path.endsWith(".html")) {
        file.content = file.content.replace(/\{\{PREFIX\}\}/g, theme.cssPrefix);
      }
    }
  }

  // 13. Inject logo into header of all HTML pages
  for (const file of files) {
    if (file.path.endsWith(".html")) {
      file.content = injectLogoInHeader(file.content, siteUrl, siteName);
    }
  }

  // Write files to build directory
  const buildPath = path.join(BUILD_DIR, domainId);
  await fs.rm(buildPath, { recursive: true, force: true });

  for (const file of files) {
    const filePath = path.join(buildPath, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, "utf-8");
  }

  return { files, buildPath };
}

export async function previewSite(domainId: string): Promise<GeneratedFile[]> {
  const result = await generateSite(domainId);
  return result.files;
}
