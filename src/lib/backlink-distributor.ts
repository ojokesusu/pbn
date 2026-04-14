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
//   5. Anchor distribution — 60% branded, 30% naked URL, 10% keyword.

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
      const availableBacklink = sortedBacklinks.find((bl) => !existingBacklinkIds.has(bl.id));
      if (!availableBacklink) continue;

      let anchorText = availableBacklink.anchorText;
      if (!anchorText) {
        const roll = Math.random();
        if (roll < 0.6) {
          try {
            anchorText = new URL(availableBacklink.targetUrl).hostname.replace(/^www\./, "");
          } catch {
            anchorText = availableBacklink.targetUrl;
          }
        } else if (roll < 0.9) {
          anchorText = availableBacklink.targetUrl;
        } else {
          const candidates = extractCandidateWords(article.content);
          if (candidates.length > 0) {
            anchorText = candidates[0];
          } else {
            try {
              anchorText = new URL(availableBacklink.targetUrl).hostname.replace(/^www\./, "");
            } catch {
              anchorText = availableBacklink.targetUrl;
            }
          }
        }
      }

      let newContent: string | null = insertBacklinkIntoContent(
        article.content,
        anchorText,
        availableBacklink.targetUrl
      );

      if (!newContent) {
        const link = `<a href="${availableBacklink.targetUrl}" target="_blank" rel="noopener">${anchorText}</a>`;
        const paragraphs = article.content.match(/<\/p>/g);
        if (paragraphs && paragraphs.length > 1) {
          const insertIdx = Math.floor(Math.random() * (paragraphs.length - 1)) + 1;
          let count = 0;
          newContent = article.content.replace(/<\/p>/g, (match) => {
            count++;
            if (count === insertIdx) return ` Baca selengkapnya di ${link}.</p>`;
            return match;
          });
        }
      }

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
