// ── IndexNow + Indexing ──
// Submits URLs to IndexNow API for Bing & Yandex indexing
// Google discovery: via inter-PBN links + robots.txt/sitemap.xml (no API needed)
//
// How IndexNow works:
// 1. Generate a key (once)
// 2. Host {key}.txt on each domain root (done during deploy)
// 3. POST URLs to https://api.indexnow.org/indexnow
// Docs: https://www.indexnow.org/documentation

import { prisma } from "./db";
import crypto from "crypto";

// ── IndexNow Key ──
// One key shared across all PBN domains. Stored in .env or generated once.
const INDEXNOW_KEY_LENGTH = 32;

export function getIndexNowKey(): string {
  // Use env var if set, otherwise generate deterministic key from a seed
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;
  // Generate a stable key based on DB URL (so it's the same across restarts)
  const seed = process.env.DATABASE_URL || "pbn-indexnow-default";
  return crypto.createHash("md5").update(seed).digest("hex");
}

// Generate the {key}.txt file content for deployment
export function getIndexNowKeyFileContent(): string {
  return getIndexNowKey();
}

// Get the key file name (e.g., "abc123def456.txt")
export function getIndexNowKeyFileName(): string {
  return `${getIndexNowKey()}.txt`;
}

// ── IndexNow Submission ──

export interface IndexNowResult {
  domainId: string;
  url: string;
  success: boolean;
  status: number;
  message: string;
  urlsSubmitted: number;
  submittedAt: Date;
}

// Submit URLs for a single domain to IndexNow
export async function submitToIndexNow(domainId: string): Promise<IndexNowResult> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: {
      articles: {
        where: { status: "published" },
        select: { slug: true },
        orderBy: { publishedAt: "desc" },
        take: 50, // Submit up to 50 URLs per domain
      },
    },
  });

  if (!domain) throw new Error("Domain not found");

  const siteUrl = domain.url.replace(/\/+$/, "");
  const host = siteUrl.replace(/^https?:\/\//, "");
  const key = getIndexNowKey();

  // Build URL list: homepage + sitemap + articles
  const urlList = [
    siteUrl,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/about.html`,
    ...domain.articles.map((a) => `${siteUrl}/articles/${a.slug}.html`),
  ];

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${siteUrl}/${key}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const success = res.status >= 200 && res.status < 300;
    const message = success ? "OK" : `HTTP ${res.status}`;

    // Log the submission
    await prisma.deployLog.create({
      data: {
        domainId,
        action: "indexnow",
        status: success ? "success" : "failed",
        message: `IndexNow: ${res.status} (${urlList.length} URLs)`,
        filesChanged: urlList.length,
      },
    });

    return {
      domainId,
      url: domain.url,
      success,
      status: res.status,
      message,
      urlsSubmitted: urlList.length,
      submittedAt: new Date(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";

    await prisma.deployLog.create({
      data: {
        domainId,
        action: "indexnow",
        status: "failed",
        message: `IndexNow: ${message}`,
        filesChanged: 0,
      },
    });

    return {
      domainId,
      url: domain.url,
      success: false,
      status: 0,
      message,
      urlsSubmitted: 0,
      submittedAt: new Date(),
    };
  }
}

// ── Legacy ping (kept for backward compat, but deprecated) ──

export interface PingResult {
  domainId: string;
  url: string;
  google: { success: boolean; status: number; message: string };
  bing: { success: boolean; status: number; message: string };
  pingedAt: Date;
}

export async function pingDomain(domainId: string): Promise<PingResult> {
  // Now uses IndexNow instead of deprecated ping endpoints
  const result = await submitToIndexNow(domainId);

  return {
    domainId: result.domainId,
    url: result.url,
    google: { success: false, status: 404, message: "Deprecated — use inter-PBN links" },
    bing: {
      success: result.success,
      status: result.status,
      message: result.success ? `IndexNow OK (${result.urlsSubmitted} URLs)` : result.message,
    },
    pingedAt: result.submittedAt,
  };
}

// ── Stats ──

export async function getPingStats(): Promise<{
  totalPinged: number;
  successCount: number;
  failedCount: number;
  lastPinged: Date | null;
  recentPings: Array<{
    domainId: string;
    domainName: string;
    domainUrl: string;
    status: string;
    message: string;
    pingedAt: Date;
  }>;
}> {
  const actions = { in: ["ping", "indexnow"] };
  const [totalPinged, successCount, failedCount, recentPings] = await Promise.all([
    prisma.deployLog.count({ where: { action: actions } }),
    prisma.deployLog.count({ where: { action: actions, status: "success" } }),
    prisma.deployLog.count({ where: { action: actions, status: "failed" } }),
    prisma.deployLog.findMany({
      where: { action: actions },
      include: { domain: { select: { name: true, url: true } } },
      orderBy: { deployedAt: "desc" },
      take: 50,
    }),
  ]);

  const lastPing = recentPings[0];

  return {
    totalPinged,
    successCount,
    failedCount,
    lastPinged: lastPing?.deployedAt || null,
    recentPings: recentPings.map((p) => ({
      domainId: p.domainId,
      domainName: p.domain.name,
      domainUrl: p.domain.url,
      status: p.status,
      message: p.message,
      pingedAt: p.deployedAt,
    })),
  };
}
