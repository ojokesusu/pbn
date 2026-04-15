import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const MASKED = "******";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const isAdmin = user?.role === "admin";

    const domain = await prisma.domain.findUnique({
      where: { id },
      include: {
        theme: true,
        server: true,
        articles: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Mask server credentials for non-admin — keep id so relations still work
    if (!isAdmin && domain.server) {
      domain.server = {
        ...domain.server,
        name: MASKED,
        nameserver2: MASKED,
        host: MASKED,
        username: MASKED,
        password: MASKED,
      };
    }

    return NextResponse.json(domain);
  } catch (error) {
    console.error("Failed to fetch domain:", error);
    return NextResponse.json(
      { error: "Failed to fetch domain" },
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

    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const domain = await prisma.domain.update({
      where: { id },
      data: body,
      include: {
        theme: true,
        server: { select: { id: true, label: true, name: true, host: true } },
        _count: {
          select: { articles: true },
        },
      },
    });

    return NextResponse.json(domain);
  } catch (error) {
    console.error("Failed to update domain:", error);
    return NextResponse.json(
      { error: "Failed to update domain" },
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

    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    await prisma.domain.delete({ where: { id } });

    return NextResponse.json({ message: "Domain deleted successfully" });
  } catch (error) {
    console.error("Failed to delete domain:", error);
    return NextResponse.json(
      { error: "Failed to delete domain" },
      { status: 500 }
    );
  }
}
