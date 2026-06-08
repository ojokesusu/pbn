import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLiveCount, getDeadCount, getEverDeployedCount } from "@/lib/domain-stats";
import * as tls from "tls";
import { URL as NodeURL } from "url";

type ErrorReason =
  | "ok"
  | "timeout"
  | "dns"
  | "waf_block"
  | "http_4xx"
  | "http_5xx"
  | "unknown";

interface DomainCheckResult {
  isAlive: boolean;
  httpStatus: number;
  hasWordPress: boolean;
  wpPostCount: number;
  responseMs: number;
  errorReason: ErrorReason;
  sslDaysLeft: number;
  wpVersion: string | null;
  error?: string;
}

interface CheckResult extends DomainCheckResult {
  domainId: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Promise pool — keeps at most `concurrency` promises in-flight at any time.
// Pure JS, no external dependency.
// ---------------------------------------------------------------------------
async function promisePool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        // Should not happen — worker is expected to catch its own errors
        results[i] = e as R;
      }
    }
  }

  const runners: Promise<void>[] = [];
  const n = Math.min(concurrency, items.length);
  for (let i = 0; i < n; i++) runners.push(runner());
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// SSL expiry check — uses Node tls.connect, pulls valid_to from peer cert.
// 5s timeout. Returns -1 on any failure (incl. non-https or invalid URL).
// ---------------------------------------------------------------------------
function checkSsl(url: string, startedAt: number): Promise<number> {
  return new Promise((resolve) => {
    let parsed: NodeURL;
    try {
      parsed = new NodeURL(url);
    } catch {
      return resolve(-1);
    }
    if (parsed.protocol !== "https:") return resolve(-1);

    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port) : 443;

    let settled = false;
    const finish = (v: number) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(v);
    };

    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: 5000,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) return finish(-1);
          const validTo = new Date(cert.valid_to).getTime();
          if (Number.isNaN(validTo)) return finish(-1);
          const days = Math.floor((validTo - startedAt) / (1000 * 60 * 60 * 24));
          finish(days);
        } catch {
          finish(-1);
        }
      }
    );

    socket.setTimeout(5000, () => finish(-1));
    socket.on("error", () => finish(-1));
  });
}

// ---------------------------------------------------------------------------
// WAF detection — inspect headers on 403 responses.
// ---------------------------------------------------------------------------
function isWafBlock(headers: Headers): boolean {
  if (headers.get("cf-ray")) return true;
  if (headers.get("x-amz-cf-id")) return true;
  // Akamai uses several x-akamai-* headers
  for (const key of headers.keys()) {
    if (key.toLowerCase().startsWith("x-akamai-")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// HTTP + WP probe — runs in parallel with SSL check via Promise.all upstream.
// ---------------------------------------------------------------------------
async function httpProbe(url: string): Promise<{
  isAlive: boolean;
  httpStatus: number;
  hasWordPress: boolean;
  wpPostCount: number;
  errorReason: ErrorReason;
  wpVersion: string | null;
  error?: string;
}> {
  const out = {
    isAlive: false,
    httpStatus: 0,
    hasWordPress: false,
    wpPostCount: 0,
    errorReason: "unknown" as ErrorReason,
    wpVersion: null as string | null,
    error: undefined as string | undefined,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "PBN-Manager-HealthCheck/1.0" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
  } catch (err) {
    const msg = String(err);
    out.error = msg.substring(0, 100);
    if (/timeout|aborted|TimeoutError/i.test(msg)) {
      out.errorReason = "timeout";
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS/i.test(msg)) {
      out.errorReason = "dns";
    } else {
      out.errorReason = "unknown";
    }
    return out;
  }

  out.httpStatus = res.status;
  out.isAlive = res.status >= 200 && res.status < 400;

  if (out.isAlive) {
    out.errorReason = "ok";
  } else if (res.status === 403) {
    out.errorReason = isWafBlock(res.headers) ? "waf_block" : "http_4xx";
  } else if (res.status >= 400 && res.status < 500) {
    out.errorReason = "http_4xx";
  } else if (res.status >= 500) {
    out.errorReason = "http_5xx";
  } else {
    out.errorReason = "unknown";
  }

  // WordPress probe — only if base is alive
  if (out.isAlive) {
    try {
      const wpRes = await fetch(`${url}/wp-json/wp/v2/posts?per_page=1`, {
        method: "GET",
        headers: { "User-Agent": "PBN-Manager-HealthCheck/1.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (wpRes.ok) {
        const totalHeader = wpRes.headers.get("X-WP-Total");
        if (totalHeader) {
          out.hasWordPress = true;
          out.wpPostCount = parseInt(totalHeader) || 0;
        } else {
          const data = (await wpRes.json()) as unknown;
          if (Array.isArray(data)) {
            out.hasWordPress = true;
            out.wpPostCount = data.length;
          }
        }
        // best-effort wpVersion via Link header / X-Powered-By / generator endpoint
        const link = wpRes.headers.get("link") || "";
        const poweredBy = wpRes.headers.get("x-powered-by") || "";
        const wpHeaderMatch =
          /WordPress\/?([\d.]+)/i.exec(link) ||
          /WordPress\/?([\d.]+)/i.exec(poweredBy);
        if (wpHeaderMatch) out.wpVersion = wpHeaderMatch[1];
      }

      // Fallback: try /wp-json root for version
      if (out.hasWordPress && !out.wpVersion) {
        try {
          const rootRes = await fetch(`${url}/wp-json/`, {
            method: "GET",
            headers: { "User-Agent": "PBN-Manager-HealthCheck/1.0" },
            signal: AbortSignal.timeout(4000),
          });
          if (rootRes.ok) {
            const rootJson = (await rootRes.json()) as { description?: string; name?: string; gmt_offset?: number; namespaces?: string[]; _meta?: { wp_version?: string } };
            const meta = rootJson?._meta;
            if (meta?.wp_version) out.wpVersion = meta.wp_version;
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      // WP API not available — that's fine
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Single-domain orchestrator — runs HTTP + SSL in parallel.
// ---------------------------------------------------------------------------
async function checkDomain(url: string): Promise<DomainCheckResult> {
  const startedAt = Date.now();
  const [http, sslDays] = await Promise.all([
    httpProbe(url),
    checkSsl(url, startedAt),
  ]);
  const responseMs = Date.now() - startedAt;

  return {
    isAlive: http.isAlive,
    httpStatus: http.httpStatus,
    hasWordPress: http.hasWordPress,
    wpPostCount: http.wpPostCount,
    responseMs,
    errorReason: http.errorReason,
    sslDaysLeft: sslDays,
    wpVersion: http.wpVersion,
    error: http.error,
  };
}

// ---------------------------------------------------------------------------
// POST — check domains in batches
// body: { all?: boolean, limit?: number, offset?: number, domainId?: string, filter?: "dead" | "deployed" }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { all, limit, offset, domainId, filter } = body as {
      all?: boolean;
      limit?: number;
      offset?: number;
      domainId?: string;
      filter?: "dead" | "deployed" | "suspect";
    };

    let domains: Array<{ id: string; url: string; isAlive: boolean; firstFailureAt: Date | null; avgResponseMs: number; lastDeployed: Date | null }>;

    const selectShape = {
      id: true,
      url: true,
      isAlive: true,
      firstFailureAt: true,
      avgResponseMs: true,
      // lastDeployed read so the writer below can refuse to flip isAlive=false
      // on domains that the deploy worker successfully wrote to within 72h —
      // Railway US-East egress can't reach most Indo/EU PBN VPS, so a single
      // failed probe is weaker evidence than a fresh SSH-confirmed deploy.
      lastDeployed: true,
    } as const;

    if (domainId) {
      const d = await prisma.domain.findUnique({
        where: { id: domainId },
        select: selectShape,
      });
      if (!d) return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 });
      domains = [d];
    } else if (filter === "dead") {
      domains = await prisma.domain.findMany({
        where: {
          isAlive: false,
          lastChecked: { not: null },
          NOT: { server: { status: "archived" } },
        },
        select: selectShape,
        orderBy: { lastChecked: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else if (filter === "deployed") {
      domains = await prisma.domain.findMany({
        where: {
          lastDeployed: { not: null },
          NOT: { server: { status: "archived" } },
        },
        select: selectShape,
        orderBy: { lastChecked: { sort: "asc", nulls: "first" } },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else if (filter === "suspect") {
      // Suspect false-dead: marked dead by Railway probe but deploy worker
      // successfully wrote files in the last 3 days. Re-probe these so the
      // operator can see how many actually flip back to alive on retry.
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      domains = await prisma.domain.findMany({
        where: {
          isAlive: false,
          isAdult: false,
          lastDeployed: { gte: threeDaysAgo },
          NOT: { server: { status: "archived" } },
        },
        select: selectShape,
        orderBy: { lastDeployed: "desc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else if (all) {
      domains = await prisma.domain.findMany({
        where: { NOT: { server: { status: "archived" } } },
        select: selectShape,
        orderBy: { createdAt: "asc" },
        take: limit || undefined,
        skip: offset || undefined,
      });
    } else {
      return NextResponse.json({ error: "Specify domainId, all=true, or filter" }, { status: 400 });
    }

    const domainById = new Map(domains.map((d) => [d.id, d]));
    const healthLogs: Array<{
      domainId: string;
      checkedAt: Date;
      isAlive: boolean;
      httpStatus: number;
      hasWordPress: boolean;
      wpPostCount: number;
      responseMs: number;
      errorReason: ErrorReason;
      sslDaysLeft: number;
      wpVersion?: string;
    }> = [];

    // ---- Promise pool, concurrency=16 -------------------------------------
    const results: CheckResult[] = await promisePool(domains, 16, async (d) => {
      const checkedAt = new Date();
      const check = await checkDomain(d.url);

      const prev = domainById.get(d.id)!;

      // firstFailureAt logic
      let firstFailureAt: Date | null | undefined = undefined;
      if (check.isAlive) {
        firstFailureAt = null;
      } else if (!prev.isAlive && prev.firstFailureAt) {
        // already failing — leave unchanged
        firstFailureAt = undefined;
      } else {
        // transition alive->dead, or no prior failure stamp
        firstFailureAt = checkedAt;
      }

      // Rolling avg responseMs: round((oldAvg * 9 + new) / 10), or new if old is 0
      const oldAvg = prev.avgResponseMs || 0;
      const newAvg = oldAvg === 0
        ? check.responseMs
        : Math.round((oldAvg * 9 + check.responseMs) / 10);

      // SSL expires-at: if sslDaysLeft >= 0, derive a date
      let sslExpiresAt: Date | null | undefined = undefined;
      if (check.sslDaysLeft >= 0) {
        sslExpiresAt = new Date(checkedAt.getTime() + check.sslDaysLeft * 86400_000);
      } else if (check.sslDaysLeft === -1) {
        sslExpiresAt = undefined; // do not overwrite when not measured
      }

      // ── Deploy-wins guard ────────────────────────────────────────────
      // A fresh deploy worker SSH success is a stronger ground truth than a
      // single Railway HTTP probe. If the probe failed with a network-level
      // / WAF / 5xx error AND the worker wrote files within the last 72h,
      // we omit isAlive from the update (and skip firstFailureAt churn) so
      // recalibration is not silently wiped by an unreachable-egress probe.
      const DEPLOY_TRUST_WINDOW_MS = 72 * 60 * 60 * 1000;
      const probeFailedNetwork =
        !check.isAlive &&
        (check.errorReason === "timeout" ||
          check.errorReason === "dns" ||
          check.errorReason === "waf_block" ||
          check.errorReason === "http_5xx" ||
          check.errorReason === "unknown" ||
          check.httpStatus === 403 ||
          check.httpStatus >= 500);
      const recentlyDeployed =
        !!prev.lastDeployed &&
        Date.now() - new Date(prev.lastDeployed).getTime() < DEPLOY_TRUST_WINDOW_MS;
      const trustDeployOverProbe = probeFailedNetwork && recentlyDeployed;

      const updateData: Record<string, unknown> = {
        httpStatus: check.httpStatus,
        hasWordPress: check.hasWordPress,
        wpPostCount: check.wpPostCount,
        lastChecked: checkedAt,
        avgResponseMs: newAvg,
        sslDaysLeft: check.sslDaysLeft,
      };
      if (!trustDeployOverProbe) {
        updateData.isAlive = check.isAlive;
        if (firstFailureAt !== undefined) updateData.firstFailureAt = firstFailureAt;
      }
      if (sslExpiresAt !== undefined) updateData.sslExpiresAt = sslExpiresAt;
      if (check.wpVersion) updateData.wpVersion = check.wpVersion;
      if (check.errorReason === "waf_block") updateData.lastWafBlock = checkedAt;

      await prisma.domain.update({
        where: { id: d.id },
        data: updateData,
      });

      // Accumulate log payload — bulk inserted at end of batch
      healthLogs.push({
        domainId: d.id,
        checkedAt,
        isAlive: check.isAlive,
        httpStatus: check.httpStatus,
        hasWordPress: check.hasWordPress,
        wpPostCount: check.wpPostCount,
        responseMs: check.responseMs,
        errorReason: check.errorReason,
        sslDaysLeft: check.sslDaysLeft,
        wpVersion: check.wpVersion ?? undefined,
      });

      return {
        domainId: d.id,
        url: d.url,
        ...check,
      };
    });

    // ---- Bulk insert health logs ONCE at end of batch ---------------------
    if (healthLogs.length > 0) {
      try {
        await prisma.domainHealthLog.createMany({
          data: healthLogs,
          skipDuplicates: true,
        });
      } catch (e) {
        console.error("DomainHealthLog bulk insert failed:", e);
      }
    }

    const summary = {
      total: results.length,
      alive: results.filter(r => r.isAlive).length,
      dead: results.filter(r => !r.isAlive).length,
      withWordPress: results.filter(r => r.hasWordPress).length,
      totalPosts: results.reduce((sum, r) => sum + r.wpPostCount, 0),
      wafBlocked: results.filter(r => r.errorReason === "waf_block").length,
      avgResponseMs: results.length
        ? Math.round(results.reduce((s, r) => s + r.responseMs, 0) / results.length)
        : 0,
      sslExpiringSoon: results.filter(r => r.sslDaysLeft >= 0 && r.sslDaysLeft < 30).length,
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
    const [domains, alive, dead, everDeployed] = await Promise.all([
      prisma.domain.findMany({
        where: {
          isAdult: false,
          NOT: { server: { status: "archived" } },
        },
        select: {
          id: true,
          isAlive: true,
          httpStatus: true,
          hasWordPress: true,
          wpPostCount: true,
          lastChecked: true,
          lastDeployed: true,
        },
      }),
      getLiveCount(),
      getDeadCount(),
      getEverDeployedCount(),
    ]);

    const checked = domains.filter((d) => d.lastChecked).length;
    const withWp = domains.filter((d) => d.hasWordPress).length;
    const totalPosts = domains.reduce((sum, d) => sum + d.wpPostCount, 0);

    // Sub-categorize the dead pool so the operator can act on the right
    // root cause instead of staring at one inflated number:
    //   neverDeployed      = no content live yet — fix by adding to deploy queue.
    //   suspectFalseDead   = deployed in last 3 days but probe says dead —
    //                        almost certainly Railway egress unreachable, not real.
    //   genuinelyDead      = deployed >3 days ago, still dead — real broken.
    const suspectWindowMs = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let neverDeployed = 0;
    let suspectFalseDead = 0;
    let genuinelyDead = 0;
    for (const d of domains) {
      if (d.isAlive) continue;
      if (!d.lastDeployed) {
        neverDeployed++;
      } else if (now - new Date(d.lastDeployed).getTime() < suspectWindowMs) {
        suspectFalseDead++;
      } else {
        genuinelyDead++;
      }
    }

    return NextResponse.json({
      total: domains.length,
      checked,
      alive,
      dead,
      everDeployed,
      neverDeployed,
      suspectFalseDead,
      genuinelyDead,
      withWordPress: withWp,
      totalPosts,
      lastCheck:
        domains
          .map((d) => d.lastChecked)
          .filter(Boolean)
          .sort()
          .pop() || null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
