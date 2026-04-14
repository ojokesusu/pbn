import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const theme = await prisma.theme.findUnique({
      where: { id },
      include: {
        domains: true,
      },
    });

    if (!theme) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    return NextResponse.json(theme);
  } catch (error) {
    console.error("Failed to fetch theme:", error);
    return NextResponse.json(
      { error: "Failed to fetch theme" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.theme.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    const theme = await prisma.theme.update({
      where: { id },
      data: body,
      include: {
        _count: {
          select: { domains: true },
        },
      },
    });

    return NextResponse.json(theme);
  } catch (error) {
    console.error("Failed to update theme:", error);
    return NextResponse.json(
      { error: "Failed to update theme" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.theme.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    await prisma.theme.delete({ where: { id } });

    return NextResponse.json({ message: "Theme deleted successfully" });
  } catch (error) {
    console.error("Failed to delete theme:", error);
    return NextResponse.json(
      { error: "Failed to delete theme" },
      { status: 500 }
    );
  }
}
