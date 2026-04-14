import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import slugify from "slugify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get("domainId");

    const where = domainId ? { domainId } : {};

    const articles = await prisma.article.findMany({
      where,
      include: {
        domain: true,
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(articles);
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
