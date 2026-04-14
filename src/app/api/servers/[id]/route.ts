import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const server = await prisma.server.findUnique({
      where: { id },
      include: {
        domains: {
          select: {
            id: true,
            name: true,
            url: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    return NextResponse.json(server);
  } catch (error) {
    console.error("Failed to fetch server:", error);
    return NextResponse.json(
      { error: "Failed to fetch server" },
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

    const existing = await prisma.server.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const server = await prisma.server.update({
      where: { id },
      data: body,
      include: {
        _count: {
          select: { domains: true },
        },
      },
    });

    return NextResponse.json(server);
  } catch (error) {
    console.error("Failed to update server:", error);
    return NextResponse.json(
      { error: "Failed to update server" },
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

    const existing = await prisma.server.findUnique({
      where: { id },
      include: { _count: { select: { domains: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (existing._count.domains > 0) {
      return NextResponse.json(
        {
          error:
            "Server ini masih memiliki domain terkait. Pindahkan domain terlebih dahulu sebelum menghapus server.",
        },
        { status: 400 }
      );
    }

    await prisma.server.delete({ where: { id } });

    return NextResponse.json({ message: "Server deleted successfully" });
  } catch (error) {
    console.error("Failed to delete server:", error);
    return NextResponse.json(
      { error: "Failed to delete server" },
      { status: 500 }
    );
  }
}
