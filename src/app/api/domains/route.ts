import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const isAdmin = user?.role === "admin";

    const domains = await prisma.domain.findMany({
      include: {
        theme: { select: { id: true, name: true, layoutName: true, isGenerated: true } },
        server: { select: { id: true, label: true, name: true, host: true } },
        domainSchedule: { select: { isActive: true } },
        _count: {
          select: { articles: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Add WP vs AI article counts per domain
    const domainIds = domains.map((d) => d.id);
    const wpCounts = await prisma.article.groupBy({
      by: ["domainId"],
      where: { domainId: { in: domainIds }, aiSourceUrl: { not: "" } },
      _count: true,
    });
    const wpMap = new Map(wpCounts.map((c) => [c.domainId, c._count]));

    const enriched = domains.map((d) => {
      const wpArticles = wpMap.get(d.id) || 0;
      const aiArticles = d._count.articles - wpArticles;
      // Mask server info for non-admin — ops shouldn't see NS/IP, but label is safe
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
        contentSource: wpArticles > 0 && aiArticles > 0
          ? "mixed"
          : wpArticles > 0
            ? "wordpress"
            : aiArticles > 0
              ? "ai"
              : "none",
      };
    });

    return NextResponse.json(enriched);
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
