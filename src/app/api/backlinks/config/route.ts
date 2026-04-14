import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    let config = await prisma.backlinkConfig.findFirst();

    // Create default config if none exists
    if (!config) {
      config = await prisma.backlinkConfig.create({
        data: {
          maxPerDomain: 3,
          maxPerArticle: 1,
          percentArticles: 30,
        },
      });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to fetch backlink config:", error);
    return NextResponse.json(
      { error: "Failed to fetch backlink config" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { maxPerDomain, maxPerArticle, percentArticles } = body;

    let config = await prisma.backlinkConfig.findFirst();

    if (config) {
      config = await prisma.backlinkConfig.update({
        where: { id: config.id },
        data: {
          maxPerDomain: maxPerDomain ?? config.maxPerDomain,
          maxPerArticle: maxPerArticle ?? config.maxPerArticle,
          percentArticles: percentArticles ?? config.percentArticles,
        },
      });
    } else {
      config = await prisma.backlinkConfig.create({
        data: {
          maxPerDomain: maxPerDomain ?? 3,
          maxPerArticle: maxPerArticle ?? 1,
          percentArticles: percentArticles ?? 30,
        },
      });
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to update backlink config:", error);
    return NextResponse.json(
      { error: "Failed to update backlink config" },
      { status: 500 }
    );
  }
}
