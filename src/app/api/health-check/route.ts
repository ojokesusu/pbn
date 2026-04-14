import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface CheckResult {
  domainId: string;
  url: string;
  isAlive: boolean;
  httpStatus: number;
  hasWordPress: boolean;
  wpPostCount: number;
  error?: string;
}

// Check a single domain — ping + detect WP
async function checkDomain(url: string): Promise<{
  isAlive: boolean;
  httpStatus: number;
  hasWordPress: boolean;
  wpPostCount: number;
  error?: string;
}> {
  const result = {
    isAlive: false,
    httpStatus: 0,
    hasWordPress: false,
    wpPostCount: 0,
    error: undefined as string | undefined,
  };

  // Step 1: Ping the homepage
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "PBN-Manager-HealthCheck/1.0" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    result.httpStatus = res.status;
    result.isAlive = res.status >= 200 && res.status < 400;
  } catch (err) {
    result.error = String(err).substring(0, 100);
    return result;
  }

  // Step 2: Try WordPress REST API
  if (result.isAlive) {
    try {
      const wpRes = await fetch(`${url}/wp-json/wp/v2/posts?per_page=1`, {
        method: "GET",
        headers: { "User-Agent": "PBN-Manager-HealthCheck/1.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (wpRes.ok) {
        const totalHeader = wpRes.headers.get("X-WP-Total");
        if (totalHeader) {
          result.hasWordPress = true;
          result.wpPostCount = parseInt(totalHeader) || 0;
        } else {
          // Check body — might still be WP
          const data = (await wpRes.json()) as unknown;
          if (Array.isArray(data)) {
            result.hasWordPress = true;
            result.wpPostCount = data.length;
          }
        }
      }
    } catch {
      // WP API not available — that's fine, just no WP
    }
  }

  return result;
}

// POST — check domains in batches
// body: { all?: boolean, limit?: number, offset?: number, domainId?: string, filter?: "dead" | "deployed" }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { all, limit, offset, domainId, filter } = body as {
      all?: boolean;
      limit?: number;
      offset?: number;
      domainId?: string;
      filter?: "dead" | "deployed";
    };

    let domains: Array<{ id: string; url: string }>;

    if (domainId) {
      const d = await prisma.domain.findUnique({
        where: { id: domainId },
        select: { id: true, url: true },
      });
      if (!d) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 });
      domains = [d];
    } else if (filter === "dead") {
      // Only re-check domains currently marked dead (much faster than full scan)
      domains = await prisma.domain.findMany({
        where: { isAlive: false, lastChecked: { not: null } },
        select: { id: true, url: true },
        orderBy: { lastChecked: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else if (filter === "deployed") {
      // Only check deployed domains — highest priority for monitoring
      domains = await prisma.domain.findMany({
        where: { lastDeployed: { not: null } },
        select: { id: true, url: true },
        orderBy: { lastChecked: { sort: "asc", nulls: "first" } },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else if (all) {
      domains = await prisma.domain.findMany({
        select: { id: true, url: true },
        orderBy: { createdAt: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else {
      return NextResponse.json({ error: "Specify domainId, all=true, or filter" }, { status: 400 });
    }

    // Check domains in parallel (but limit concurrency to avoid overwhelming)
    const concurrency = 10;
    const results: CheckResult[] = [];

    for (let i = 0; i < domains.length; i += concurrency) {
      const batch = domains.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (d) => {
          const check = await checkDomain(d.url);
          // Update DB
          await prisma.domain.update({
            where: { id: d.id },
            data: {
              isAlive: check.isAlive,
              httpStatus: check.httpStatus,
              hasWordPress: check.hasWordPress,
              wpPostCount: check.wpPostCount,
              lastChecked: new Date(),
            },
          });
          return {
            domainId: d.id,
            url: d.url,
            ...check,
          };
        })
      );
      results.push(...batchResults);
    }

    const summary = {
      total: results.length,
      alive: results.filter(r => r.isAlive).length,
      dead: results.filter(r => !r.isAlive).length,
      withWordPress: results.filter(r => r.hasWordPress).length,
      totalPosts: results.reduce((sum, r) => sum + r.wpPostCount, 0),
    };

    return NextResponse.json({
      message: `Check selesai: ${summary.alive} alive, ${summary.dead} dead, ${summary.withWordPress} dengan WP`,
      summary,
      results,
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { error: `Health check gagal: ${String(error)}` },
      { status: 500 }
    );
  }
}

// GET — return summary stats from last health check
export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      select: {
        id: true,
        isAlive: true,
        httpStatus: true,
        hasWordPress: true,
        wpPostCount: true,
        lastChecked: true,
      },
    });

    const checked = domains.filter(d => d.lastChecked).length;
    const alive = domains.filter(d => d.isAlive).length;
    const withWp = domains.filter(d => d.hasWordPress).length;
    const totalPosts = domains.reduce((sum, d) => sum + d.wpPostCount, 0);

    return NextResponse.json({
      total: domains.length,
      checked,
      alive,
      dead: checked - alive,
      withWordPress: withWp,
      totalPosts,
      lastCheck: domains
        .map(d => d.lastChecked)
        .filter(Boolean)
        .sort()
        .pop() || null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
