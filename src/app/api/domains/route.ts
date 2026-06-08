import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const isAdmin = user?.role === "admin";

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const deploy = searchParams.get("deploy") || "";        // "" | "deployed" | "not-deployed"
    const health = searchParams.get("health") || "";        // "" | "alive" | "dead" | "unchecked"
    const genre = searchParams.get("genre") || "";          // exact match
    const content = searchParams.get("content") || "";      // "" | "has-articles" | "no-articles" | "wp-only" | "ai-only" | "mixed"
    const template = searchParams.get("template") || "";    // "" | "magazine" | "blog" | "berita" | "none"
    const scheduler = searchParams.get("scheduler") || "";  // "" | "active" | "inactive"
    // Adult quarantine: ?isAdult=true returns only quarantined; ?isAdult=false
    // (or unset on the /domains page) excludes them so the legit pool stays clean.
    // Unset = no filter (default behavior for legacy callers that need all rows).
    const isAdultParam = searchParams.get("isAdult");
    const isAdultFilter: boolean | null =
      isAdultParam === "true" ? true : isAdultParam === "false" ? false : null;
    // Pagination opt-in. Legacy callers (home, deploy, import, health-check…)
    // pass no ?page/?perPage and get the plain array shape they used to.
    const isPaginated = searchParams.has("page") || searchParams.has("perPage");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const perPageRaw = parseInt(searchParams.get("perPage") || "100", 10) || 100;
    const perPage = Math.min(500, Math.max(1, perPageRaw));

    // ---- Build the where clause ----
    // Most filters map cleanly to Prisma `where`; the WP-vs-AI ones (`content`,
    // and the article-count classification) are computed in JS after we fetch
    // a slim row + aggregated counts, since they depend on `aiSourceUrl`
    // groupings that don't fit naturally into the same query.
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { url: { contains: search, mode: "insensitive" } },
        { genre: { contains: search, mode: "insensitive" } },
        { server: { is: { name: { contains: search, mode: "insensitive" } } } },
        { server: { is: { host: { contains: search, mode: "insensitive" } } } },
      ];
    }
    if (genre) where.genre = genre;
    if (deploy === "deployed") where.lastDeployed = { not: null };
    if (deploy === "not-deployed") where.lastDeployed = null;
    if (health === "alive") {
      where.isAlive = true;
      where.writeOff = false;
    }
    if (health === "dead") {
      where.isAlive = false;
      where.writeOff = false;
      where.lastChecked = { not: null };
    }
    if (health === "unchecked") {
      where.lastChecked = null;
      where.writeOff = false;
    }
    if (template === "none") where.theme = { is: { layoutName: null } };
    else if (template) where.theme = { is: { layoutName: template } };
    if (scheduler === "active") where.domainSchedule = { is: { isActive: true } };
    if (scheduler === "inactive") {
      where.OR = [
        ...((where.OR as unknown[]) || []),
        { domainSchedule: null },
        { domainSchedule: { is: { isActive: false } } },
      ];
    }
    if (isAdultFilter !== null) where.isAdult = isAdultFilter;

    // ---- Legacy path: no ?page param ----
    // Several places (home dashboard, deploy, import/wordpress, etc.) still
    // call /api/domains expecting a plain array of all domains. Detect that
    // and short-circuit with the original simple shape so we don't break them.
    if (!isPaginated) {
      const allDomains = await prisma.domain.findMany({
        where,
        include: {
          theme: { select: { id: true, name: true, layoutName: true, isGenerated: true } },
          server: { select: { id: true, label: true, name: true, host: true } },
          domainSchedule: { select: { isActive: true } },
          _count: { select: { articles: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const allIds = allDomains.map((d) => d.id);
      const wpCountsLegacy = allIds.length
        ? await prisma.article.groupBy({
            by: ["domainId"],
            where: { domainId: { in: allIds }, aiSourceUrl: { not: "" } },
            _count: true,
          })
        : [];
      const wpMapLegacy = new Map(wpCountsLegacy.map((c) => [c.domainId, c._count]));
      const enrichedLegacy = allDomains.map((d) => {
        const wpArticles = wpMapLegacy.get(d.id) || 0;
        const aiArticles = d._count.articles - wpArticles;
        const safeServer = isAdmin
          ? d.server
          : d.server
            ? { id: d.server.id, label: d.server.label, name: "******", host: "******" }
            : null;
        return {
          ...d,
          server: safeServer,
          schedulerActive: d.domainSchedule?.isActive ?? false,
          wpArticles,
          aiArticles,
          contentSource:
            wpArticles > 0 && aiArticles > 0
              ? "mixed"
              : wpArticles > 0
                ? "wordpress"
                : aiArticles > 0
                  ? "ai"
                  : "none",
        };
      });
      return NextResponse.json(enrichedLegacy);
    }

    // ---- Paginated path: /domains list page ----
    // Run all the heavy queries in parallel — count, current page,
    // stats counts, distinct genres. Postgres handles a fan-out like this
    // much faster than awaiting in series.
    const [
      total,
      domains,
      genres,
      statTotal,
      statDeployed,
      statAlive,
      statDead,
      statWithArticles,
      statMagazine,
      statBlog,
      statBerita,
      statScheduler,
      statAdult,
      perDomainTotalArticles,
      perDomainWpArticles,
    ] = await Promise.all([
      prisma.domain.count({ where }),
      prisma.domain.findMany({
        where,
        select: {
          id: true,
          name: true,
          url: true,
          genre: true,
          status: true,
          isAlive: true,
          lastChecked: true,
          lastDeployed: true,
          isAdult: true,
          adultDetectedAt: true,
          strategy: true,
          createdAt: true,
          updatedAt: true,
          theme: { select: { id: true, name: true, layoutName: true, isGenerated: true } },
          server: { select: { id: true, label: true, name: true, host: true } },
          domainSchedule: { select: { isActive: true } },
          _count: { select: { articles: true } },
        },
        orderBy: { createdAt: "desc" },
        take: perPage,
        skip: (page - 1) * perPage,
      }),
      prisma.domain.findMany({ select: { genre: true }, distinct: ["genre"] }),
      // Stats are unfiltered — they reflect totals across the whole table so
      // the dashboard "493 / 43 alive / ..." numbers stay stable as the user
      // narrows the visible list.
      prisma.domain.count(),
      prisma.domain.count({ where: { lastDeployed: { not: null } } }),
      prisma.domain.count({ where: { isAlive: true, writeOff: false } }),
      prisma.domain.count({ where: { isAlive: false, writeOff: false, lastChecked: { not: null } } }),
      prisma.domain.count({ where: { articles: { some: {} } } }),
      prisma.domain.count({ where: { theme: { is: { layoutName: "magazine" } } } }),
      prisma.domain.count({ where: { theme: { is: { layoutName: "blog" } } } }),
      prisma.domain.count({ where: { theme: { is: { layoutName: "berita" } } } }),
      prisma.domain.count({ where: { domainSchedule: { is: { isActive: true } } } }),
      // Adult quarantine count — drives the badge on /domains and the sidebar.
      // Unfiltered like the other stats so it stays stable across views.
      prisma.domain.count({ where: { isAdult: true } }),
      // Per-domain breakdowns we need to derive contentSource stats. These
      // run on the (~8k row) articles table, which is fast with a domainId
      // index — small enough to scan in tens of ms.
      prisma.article.groupBy({ by: ["domainId"], _count: true }),
      prisma.article.groupBy({
        by: ["domainId"],
        where: { aiSourceUrl: { not: "" } },
        _count: true,
      }),
    ]);

    // Derive wpOnly / aiOnly / mixed across the whole table so the filter
    // chips show stable totals regardless of which page the user is on.
    const totalsByDomain = new Map(perDomainTotalArticles.map((g) => [g.domainId, g._count]));
    const wpByDomain = new Map(perDomainWpArticles.map((g) => [g.domainId, g._count]));
    let statWpOnly = 0;
    let statAiOnly = 0;
    let statMixed = 0;
    for (const [dId, totalCount] of totalsByDomain) {
      const wp = wpByDomain.get(dId) ?? 0;
      const ai = totalCount - wp;
      if (wp > 0 && ai > 0) statMixed += 1;
      else if (wp > 0) statWpOnly += 1;
      else if (ai > 0) statAiOnly += 1;
    }

    // WP vs AI article counts only for the *visible* page — keeps the article
    // groupBy bounded even when the user scrolls deep into the list.
    const visibleIds = domains.map((d) => d.id);
    const wpCounts = visibleIds.length
      ? await prisma.article.groupBy({
          by: ["domainId"],
          where: { domainId: { in: visibleIds }, aiSourceUrl: { not: "" } },
          _count: true,
        })
      : [];
    const wpMap = new Map(wpCounts.map((c) => [c.domainId, c._count]));

    let enriched = domains.map((d) => {
      const totalArticles = d._count.articles;
      const wpArticles = wpMap.get(d.id) || 0;
      const aiArticles = totalArticles - wpArticles;
      const safeServer = isAdmin
        ? d.server
        : d.server
          ? { id: d.server.id, label: d.server.label, name: "******", host: "******" }
          : null;
      return {
        ...d,
        server: safeServer,
        schedulerActive: d.domainSchedule?.isActive ?? false,
        wpArticles,
        aiArticles,
        contentSource:
          wpArticles > 0 && aiArticles > 0
            ? "mixed"
            : wpArticles > 0
              ? "wordpress"
              : aiArticles > 0
                ? "ai"
                : "none",
      };
    });

    // `content` filter depends on the WP/AI breakdown so it can only be
    // applied here. We accept that it filters within the current page only
    // — users who care about exact WP/AI counts can use the stats panel.
    if (content === "has-articles") enriched = enriched.filter((d) => d._count.articles > 0);
    else if (content === "no-articles") enriched = enriched.filter((d) => d._count.articles === 0);
    else if (content === "wp-only") enriched = enriched.filter((d) => d.contentSource === "wordpress");
    else if (content === "ai-only") enriched = enriched.filter((d) => d.contentSource === "ai");
    else if (content === "mixed") enriched = enriched.filter((d) => d.contentSource === "mixed");

    return NextResponse.json({
      data: enriched,
      total,
      page,
      perPage,
      stats: {
        total: statTotal,
        deployed: statDeployed,
        alive: statAlive,
        dead: statDead,
        withArticles: statWithArticles,
        wpOnly: statWpOnly,
        aiOnly: statAiOnly,
        mixed: statMixed,
        magazine: statMagazine,
        blog: statBlog,
        berita: statBerita,
        schedulerActive: statScheduler,
        schedulerInactive: statTotal - statScheduler,
        adult: statAdult,
      },
      genres: genres.map((g) => g.genre).filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("Failed to fetch domains:", error);
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, url, status, serverId, genre } = body;

    if (!name || !url) {
      return NextResponse.json({ error: "Name and URL are required" }, { status: 400 });
    }

    const domain = await prisma.domain.create({
      data: {
        name,
        url,
        status: status ?? "active",
        serverId: serverId ?? null,
        genre: genre ?? "",
      },
      include: {
        theme: { select: { id: true, name: true, layoutName: true, isGenerated: true } },
        server: { select: { id: true, label: true, name: true, host: true } },
        _count: { select: { articles: true } },
      },
    });

    return NextResponse.json({ ...domain, wpArticles: 0, aiArticles: 0, contentSource: "none" }, { status: 201 });
  } catch (error) {
    console.error("Failed to create domain:", error);
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 });
  }
}
