import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;

    const backlink = await prisma.backlink.findUnique({
      where: { id },
      include: {
        placements: {
          include: {
            domain: true,
            article: true,
          },
        },
      },
    });

    if (!backlink) {
      return NextResponse.json(
        { error: "Backlink not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(backlink);
  } catch (error) {
    console.error("Failed to fetch backlink:", error);
    return NextResponse.json(
      { error: "Failed to fetch backlink" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.backlink.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Backlink not found" },
        { status: 404 }
      );
    }

    const backlink = await prisma.backlink.update({
      where: { id },
      data: {
        anchorText: body.anchorText,
        targetUrl: body.targetUrl,
        type: body.type,
        status: body.status,
      },
    });

    return NextResponse.json(backlink);
  } catch (error) {
    console.error("Failed to update backlink:", error);
    return NextResponse.json(
      { error: "Failed to update backlink" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;

    const existing = await prisma.backlink.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Backlink not found" },
        { status: 404 }
      );
    }

    await prisma.backlink.delete({ where: { id } });

    return NextResponse.json({ message: "Backlink deleted successfully" });
  } catch (error) {
    console.error("Failed to delete backlink:", error);
    return NextResponse.json(
      { error: "Failed to delete backlink" },
      { status: 500 }
    );
  }
}
