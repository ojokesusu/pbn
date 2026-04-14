import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const backlinks = await prisma.backlink.findMany({
      include: {
        placements: {
          include: {
            domain: { select: { id: true, name: true, url: true } },
            article: { select: { id: true, title: true, slug: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(backlinks);
  } catch (error) {
    console.error("Failed to fetch backlinks:", error);
    return NextResponse.json(
      { error: "Failed to fetch backlinks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { anchorText, targetUrl, type, status } = body;

    if (!targetUrl) {
      return NextResponse.json(
        { error: "targetUrl is required" },
        { status: 400 }
      );
    }

    const backlink = await prisma.backlink.create({
      data: {
        anchorText: anchorText ?? "",
        targetUrl,
        type: type ?? "",
        status: status ?? "active",
      },
    });

    return NextResponse.json(backlink, { status: 201 });
  } catch (error) {
    console.error("Failed to create backlink:", error);
    return NextResponse.json(
      { error: "Failed to create backlink" },
      { status: 500 }
    );
  }
}
