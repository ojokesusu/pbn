// ── Backlink Distributor ──
// Shared logic for distributing backlinks into articles.
// Used by both manual API (POST /api/backlinks/distribute) and the
// server-side scheduler tick.
//
// PERMANENT RULES (do not change without explicit user permission):
//   1. Type priority — MS > MS 2 > LP > RTP > CN — high-priority types
//      always get placed first until exhausted.
//   2. Daily anti-spam limit — max N placements per 24h (BacklinkConfig.maxPerDay).
//   3. Per-domain cap — max maxPerDomain placements per domain.
//   4. Per-article cap — max maxPerArticle placements per article.
//   5. Anchor text MUST be a natural word/phrase already present in the
//      article body. The <a> wraps an existing token in place. Never
//      insert foreign text (hostnames, raw URLs, "Baca selengkapnya di…").
//      If no natural anchor can be placed in an article, skip it — the
//      distributor will move on to the next eligible article.
//      Explicit Backlink.anchorText is honored ONLY if that string already
//      appears naturally in the article body. Otherwise fall through to
//      random-word extraction from the article.
//   6. Niche/topic match — when ANCHOR_CATEGORY_MATCH=true, backlinks with
//      a niche (e.g. "igaming") only land on articles with a matching
//      topicCategory (e.g. "olahraga", "hiburan"). Prevents an "igaming"
//      backlink landing in a "kriminal" article. Empty niche or empty
//      article category → legacy behavior (match all).

import { prisma } from "./db";

const TYPE_PRIORITY: Record<string, number> = {
  "MS": 100,
  "MS 2": 90,
  "LP": 80,
  "RTP": 70,
  "CN": 60,
};

function priorityOf(type: string | null | undefined): number {
  if (!type) return 0;
  return TYPE_PRIORITY[type.trim()] ?? 0;
}

// Niche → allowed article topicCategory whitelist.
// "*" means matches anything. Unknown niches are permissive (fall through to
// legacy match) so adding a new niche on a backlink without updating this map
// never silently breaks distribution.
const NICHE_ALLOWED_CATEGORIES: Record<string, string[]> = {
  igaming:   ["olahraga", "hiburan", "casino", "umum"],
  finance:   ["ekonomi", "bisnis", "investasi", "umum"],
  health:    ["kesehatan", "lifestyle", "umum"],
  ecommerce: ["bisnis", "teknologi", "lifestyle", "umum"],
  travel:    ["wisata", "lifestyle", "umum"],
  tech:      ["teknologi", "umum"],
  news:      ["*"],
};

function nicheMatchesArticle(
  niche: string | null | undefined,
  articleCategory: string | null | undefined
): boolean {
  const n = (niche || "").trim().toLowerCase();
  const c = (articleCategory || "").trim().toLowerCase();
  // Legacy compat: either side untagged → match (don't block existing data)
  if (!n || !c) return true;
  const allowed = NICHE_ALLOWED_CATEGORIES[n];
  // Unknown niche → permissive
  if (!allowed) return true;
  if (allowed.includes("*")) return true;
  return allowed.includes(c);
}

function extractCandidateWords(htmlContent: string): string[] {
  const plainText = htmlContent.replace(/<[^>]+>/g, " ");
  const words = plainText
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\w]/g, ""))
    .filter((w) => w.length >= 4);

  const phrases: string[] = [];
  const cleanWords = plainText.split(/\s+/).filter((w) => w.length >= 3);
  for (let i = 0; i < cleanWords.length - 1; i++) {
    const phrase = `${cleanWords[i]} ${cleanWords[i + 1]}`.replace(/[<>]/g, "");
    if (phrase.length >= 6 && phrase.length <= 40) phrases.push(phrase);
  }

  return [...new Set([...words, ...phrases])].sort(() => Math.random() - 0.5);
}

function insertBacklinkIntoContent(
  content: string,
  anchorText: string,
  targetUrl: string
): string | null {
  const escapedAnchor = anchorText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `(?<![<\\/a-zA-Z"'=])\\b(${escapedAnchor})\\b(?![^<]*>)(?![^<]*<\\/a>)`,
    "i"
  );

  const match = content.match(regex);
  if (!match || match.index === undefined) return null;

  const before = content.slice(0, match.index);
  const after = content.slice(match.index + match[0].length);

  const lastOpenA = before.lastIndexOf("<a ");
  const lastCloseA = before.lastIndexOf("</a>");
  if (lastOpenA > lastCloseA) return null;

  const link = `<a href="${targetUrl}" target="_blank" rel="noopener">${match[0]}</a>`;
  return before + link + after;
}

export type DistributeResult = {
  placed: number;
  totalArticles: number;
  targetArticles: number;
  dailyLimit: number;
  placedToday: number;
  remainingToday: number;
  details: Array<{ articleTitle: string; domain: string; anchor: string; url: string; type: string }>;
  message: string;
};

export async function distributeBacklinks(): Promise<DistributeResult> {
  // Config
  let config = await prisma.backlinkConfig.findFirst();
  if (!config) {
    config = await prisma.backlinkConfig.create({
      data: { maxPerDomain: 3, maxPerArticle: 1, percentArticles: 30, maxPerDay: 15 },
    });
  }

  // Anti-spam: daily limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const placedToday = await prisma.backlinkPlacement.count({
    where: { createdAt: { gte: todayStart } },
  });
  const dailyLimit = config.maxPerDay || 15;
  const remainingToday = Math.max(0, dailyLimit - placedToday);

  if (remainingToday <= 0) {
    return {
      placed: 0,
      totalArticles: 0,
      targetArticles: 0,
      dailyLimit,
      placedToday,
      remainingToday: 0,
      details: [],
      message: `Batas harian tercapai (${dailyLimit}/hari). Coba lagi besok.`,
    };
  }

  const backlinks = await prisma.backlink.findMany({
    where: { status: "active" },
    include: { placements: true },
  });

  if (backlinks.length === 0) {
    return {
      placed: 0,
      totalArticles: 0,
      targetArticles: 0,
      dailyLimit,
      placedToday,
      remainingToday,
      details: [],
      message: "Tidak ada backlink aktif.",
    };
  }

  const articles = await prisma.article.findMany({
    where: { status: "published" },
    include: { domain: true, backlinkPlacements: true },
  });

  if (articles.length === 0) {
    return {
      placed: 0,
      totalArticles: 0,
      targetArticles: 0,
      dailyLimit,
      placedToday,
      remainingToday,
      details: [],
      message: "Tidak ada artikel published.",
    };
  }

  const targetArticleCount = Math.max(1, Math.floor(articles.length * (config.percentArticles / 100)));

  const articlesByDomain: Record<string, typeof articles> = {};
  for (const article of articles) {
    if (!article.domainId) continue;
    if (!articlesByDomain[article.domainId]) articlesByDomain[article.domainId] = [];
    articlesByDomain[article.domainId].push(article);
  }

  const existingPlacementsByDomain: Record<string, number> = {};
  for (const article of articles) {
    if (!article.domainId) continue;
    existingPlacementsByDomain[article.domainId] =
      (existingPlacementsByDomain[article.domainId] ?? 0) + article.backlinkPlacements.length;
  }

  // Sort by priority — MS first, etc.
  const sortedBacklinks = [...backlinks].sort((a, b) => {
    const dp = priorityOf(b.type) - priorityOf(a.type);
    if (dp !== 0) return dp;
    const dl = a.placements.length - b.placements.length;
    if (dl !== 0) return dl;
    return Math.random() - 0.5;
  });

  const enableNicheMatch = process.env.ANCHOR_CATEGORY_MATCH === "true";

  let totalPlaced = 0;
  const details: DistributeResult["details"] = [];

  for (const [domainId, domainArticles] of Object.entries(articlesByDomain)) {
    const existingCount = existingPlacementsByDomain[domainId] ?? 0;
    const remainingSlots = config.maxPerDomain - existingCount;
    if (remainingSlots <= 0) continue;

    const shuffledArticles = [...domainArticles].sort(() => Math.random() - 0.5);
    const targetForDomain = Math.min(
      Math.ceil(shuffledArticles.length * (config.percentArticles / 100)),
      remainingSlots
    );

    let placedInDomain = 0;

    for (const article of shuffledArticles) {
      if (placedInDomain >= targetForDomain) break;
      if (totalPlaced >= targetArticleCount) break;
      if (totalPlaced >= remainingToday) break;
      if (article.backlinkPlacements.length >= config.maxPerArticle) continue;

      const existingBacklinkIds = new Set(article.backlinkPlacements.map((p) => p.backlinkId));
      const availableBacklink = sortedBacklinks.find((bl) => {
        if (existingBacklinkIds.has(bl.id)) return false;
        if (enableNicheMatch && !nicheMatchesArticle(bl.niche, article.topicCategory)) return false;
        return true;
      });
      if (!availableBacklink) continue;

      // Build candidate list (rule #5): explicit anchor only if it appears
      // naturally in the body, then fall back to random words/phrases
      // extracted from the article itself.
      const candidates: string[] = [];
      const explicitAnchor = (availableBacklink.anchorText || "").trim();
      if (explicitAnchor) {
        const escaped = explicitAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${escaped}\\b`, "i").test(article.content)) {
          candidates.push(explicitAnchor);
        }
      }
      candidates.push(...extractCandidateWords(article.content).slice(0, 20));

      let newContent: string | null = null;
      let anchorText = "";
      for (const candidate of candidates) {
        const attempt = insertBacklinkIntoContent(
          article.content,
          candidate,
          availableBacklink.targetUrl
        );
        if (attempt) {
          newContent = attempt;
          anchorText = candidate;
          break;
        }
      }

      // No natural anchor placement possible → skip article. Never force
      // a foreign string insertion (rule #5).
      if (!newContent) continue;

      await prisma.article.update({
        where: { id: article.id },
        data: { content: newContent },
      });

      await prisma.backlinkPlacement.create({
        data: {
          backlinkId: availableBacklink.id,
          articleId: article.id,
          domainId,
          usedAnchor: anchorText,
        },
      });

      details.push({
        articleTitle: article.title,
        domain: article.domain?.name ?? domainId,
        anchor: anchorText,
        url: availableBacklink.targetUrl,
        type: availableBacklink.type || "—",
      });

      placedInDomain++;
      totalPlaced++;
    }
  }

  return {
    placed: totalPlaced,
    totalArticles: articles.length,
    targetArticles: targetArticleCount,
    dailyLimit,
    placedToday: placedToday + totalPlaced,
    remainingToday: remainingToday - totalPlaced,
    details,
    message: `Berhasil menyisipkan ${totalPlaced} backlink ke artikel`,
  };
}
