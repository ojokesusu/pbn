import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import slugify from "slugify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get("domainId");
    const search = (searchParams.get("search") || "").trim();
    // Legacy callers (no ?page/?perPage) get the original array shape so we
    // don't break consumers like /, /deploy, /import/wordpress, etc.
    const isPaginated = searchParams.has("page") || searchParams.has("perPage");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const perPageRaw = parseInt(searchParams.get("perPage") || "100", 10) || 100;
    const perPage = Math.min(500, Math.max(1, perPageRaw));

    // Build where clause — domainId narrows the dataset, search is OR across
    // title/author and the relation names. Prisma `mode: insensitive` works
    // on Postgres (Supabase) which is what we run in prod.
    const where: Record<string, unknown> = {};
    if (domainId) where.domainId = domainId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { authorName: { contains: search, mode: "insensitive" } },
        { domain: { is: { name: { contains: search, mode: "insensitive" } } } },
        { category: { is: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }

    // Run count + page in parallel — Postgres handles both queries together
    // much faster than waiting in series.
    const [total, data] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        // List view doesn't need the full HTML body — drop `content` and
        // `excerpt` which together can be 50–200 KB per row × 7,879 rows.
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          authorName: true,
          featuredImage: true,
          publishedAt: true,
          createdAt: true,
          aiSourceUrl: true,
          domain: { select: { id: true, name: true, url: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        ...(isPaginated ? { take: perPage, skip: (page - 1) * perPage } : {}),
      }),
    ]);

    if (!isPaginated) {
      // Backwards-compat: legacy callers expect a plain array.
      return NextResponse.json(data);
    }
    return NextResponse.json({ data, total, page, perPage });
  } catch (error) {
    console.error("Failed to fetch articles:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      title,
      slug: providedSlug,
      content,
      excerpt,
      categoryId,
      tags,
      authorName,
      featuredImage,
      status,
      aiSourceUrl,
      domainId,
    } = body;

    if (!title || !content || !domainId) {
      return NextResponse.json(
        { error: "Title, content, and domainId are required" },
        { status: 400 }
      );
    }

    const slug =
      providedSlug ||
      slugify(title, { lower: true, strict: true });

    const publishedAt =
      status === "published" ? new Date() : null;

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        content,
        excerpt: excerpt ?? "",
        categoryId: categoryId ?? null,
        tags: tags ?? "",
        authorName: authorName ?? "Admin",
        featuredImage: featuredImage ?? "",
        status: status ?? "draft",
        aiSourceUrl: aiSourceUrl ?? "",
        domainId,
        publishedAt,
      },
      include: {
        domain: true,
        category: true,
      },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    console.error("Failed to create article:", error);
    return NextResponse.json(
      { error: "Failed to create article" },
      { status: 500 }
    );
  }
}
