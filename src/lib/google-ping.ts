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
const INDEXNOW_DAILY_CAP = 10000;

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

// ── Helpers ──

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Per-day cap usage — exported for dashboards / pre-flight UI
export async function getIndexNowDailyUsage(): Promise<{ usedToday: number; cap: number; remaining: number }> {
  const usedToday = await prisma.indexNowLog.count({
    where: { submittedAt: { gte: startOfTodayUTC() } },
  });
  return {
    usedToday,
    cap: INDEXNOW_DAILY_CAP,
    remaining: Math.max(0, INDEXNOW_DAILY_CAP - usedToday),
  };
}

// Bulk-insert per-URL log rows. Failure to log must not crash submission flow.
async function logPerUrl(
  domainId: string,
  batchId: string,
  urlList: string[],
  httpStatus: number,
  success: boolean,
  errorMessage: string,
  attempt: number,
): Promise<void> {
  try {
    await prisma.indexNowLog.createMany({
      data: urlList.map((url) => ({
        domainId,
        batchId,
        url,
        httpStatus,
        success,
        errorMessage,
        attempt,
      })),
    });
  } catch {
    // Swallow — aggregate DeployLog still captures outcome.
  }
}

// Submit URLs for a single domain to IndexNow
// Signature preserved: (domainId: string) => Promise<IndexNowResult>
export async function submitToIndexNow(domainId: string): Promise<IndexNowResult> {
  const batchId = crypto.randomUUID();
  const submittedAt = new Date();

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

  // Build URL list: homepage + sitemap + about + latest articles
  const urlList = [
    siteUrl,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/about.html`,
    ...domain.articles.map((a) => `${siteUrl}/articles/${a.slug}.html`),
  ];

  // ── 1) Pre-submit validation: key.txt accessibility ──
  const keyUrl = `${siteUrl}/${key}.txt`;
  try {
    const keyRes = await fetch(keyUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!keyRes.ok) {
      await prisma.deployLog.create({
        data: {
          domainId,
          action: "indexnow",
          status: "failed",
          message: `IndexNow aborted: key.txt not accessible (HTTP ${keyRes.status})`,
          filesChanged: 0,
        },
      });
      return {
        domainId,
        url: domain.url,
        success: false,
        status: keyRes.status,
        message: "key.txt not accessible",
        urlsSubmitted: 0,
        submittedAt,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "key.txt fetch error";
    await prisma.deployLog.create({
      data: {
        domainId,
        action: "indexnow",
        status: "failed",
        message: `IndexNow aborted: key.txt not accessible (${message})`,
        filesChanged: 0,
      },
    });
    return {
      domainId,
      url: domain.url,
      success: false,
      status: 0,
      message: "key.txt not accessible",
      urlsSubmitted: 0,
      submittedAt,
    };
  }

  // ── 1b) Pre-flight daily 10k cap (Bing IndexNow per key per day) ──
  const usedToday = await prisma.indexNowLog.count({
    where: { submittedAt: { gte: startOfTodayUTC() } },
  });
  if (usedToday + urlList.length > INDEXNOW_DAILY_CAP) {
    await prisma.deployLog.create({
      data: {
        domainId,
        action: "indexnow",
        status: "failed",
        message: `IndexNow aborted: daily 10k cap reached (used=${usedToday}, requested=${urlList.length})`,
        filesChanged: 0,
      },
    });
    return {
      domainId,
      url: domain.url,
      success: false,
      status: 0,
      message: "daily 10k cap reached",
      urlsSubmitted: 0,
      submittedAt,
    };
  }

  // ── 2) Submit with retry-with-backoff ──
  const backoffMs = [200, 400, 800];
  const maxAttempts = 3;
  let attempt = 0;
  let lastStatus = 0;
  let lastError = "";
  let success = false;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host,
          key,
          keyLocation: keyUrl,
          urlList,
        }),
        signal: AbortSignal.timeout(15000),
      });
      lastStatus = res.status;

      if (res.status >= 200 && res.status < 300) {
        success = true;
        lastError = "";
        break;
      }

      // Retry on 429 + 5xx; bail on other 4xx
      const retryable = res.status === 429 || res.status >= 500;
      lastError = `HTTP ${res.status}`;
      if (!retryable) break;
    } catch (err) {
      // Timeout (AbortError) + network errors are retryable
      lastStatus = 0;
      lastError = err instanceof Error ? err.message : "network error";
    }

    if (attempt < maxAttempts) {
      const base = backoffMs[attempt - 1] ?? 800;
      const jitter = Math.floor(Math.random() * 100);
      await sleep(base + jitter);
    }
  }

  // ── 2b) Per-URL IndexNowLog rows (final attempt outcome) ──
  await logPerUrl(
    domainId,
    batchId,
    urlList,
    lastStatus,
    success,
    success ? "" : lastError.slice(0, 200),
    attempt,
  );

  // ── 3) Aggregate DeployLog (preserved for callers) ──
  const aggregateMessage = success
    ? `IndexNow: ${lastStatus} (${urlList.length} URLs, ${attempt} attempt${attempt > 1 ? "s" : ""})`
    : `IndexNow: failed after ${attempt} attempt${attempt > 1 ? "s" : ""} — ${lastError || "unknown"} (${urlList.length} URLs)`;

  await prisma.deployLog.create({
    data: {
      domainId,
      action: "indexnow",
      status: success ? "success" : "failed",
      message: aggregateMessage,
      filesChanged: success ? urlList.length : 0,
    },
  });

  return {
    domainId,
    url: domain.url,
    success,
    status: lastStatus,
    message: success ? "OK" : lastError || "failed",
    urlsSubmitted: success ? urlList.length : 0,
    submittedAt,
  };
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
