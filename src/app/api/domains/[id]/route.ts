import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, denyIfNotAdmin } from "@/lib/auth";

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
        domainSchedule: { select: { isActive: true } },
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
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Allow-list: only the fields the edit form legitimately sends. Passing the
    // raw body straight to update() let any column be set (mass-assignment) —
    // e.g. flipping isAdult/writeOff/serverId to bypass quarantine. Audit G6.
    const allowed: Record<string, unknown> = {};
    if (typeof body.name === "string") allowed.name = body.name;
    if (typeof body.url === "string") allowed.url = body.url;
    if (typeof body.genre === "string") allowed.genre = body.genre;
    if (typeof body.status === "string") allowed.status = body.status;
    if (body.serverId === null || typeof body.serverId === "string") allowed.serverId = body.serverId;
    if (body.themeId === null || typeof body.themeId === "string") allowed.themeId = body.themeId;

    const domain = await prisma.domain.update({
      where: { id },
      data: allowed,
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

// PATCH — partial update. Currently used for the adult-quarantine toggle from
// /domains/adult ("Unflag" sets isAdult=false and clears adultDetectedAt).
// Kept narrow on purpose: only allow-listed fields are accepted so this can't
// be repurposed as a generic editor by mistake.
export async function PATCH(
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

    const data: Record<string, unknown> = {};
    if (typeof body.isAdult === "boolean") {
      data.isAdult = body.isAdult;
      // When unflagging, also clear the detection timestamp so the audit trail
      // shows the domain was deliberately re-admitted rather than never flagged.
      data.adultDetectedAt = body.isAdult ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No supported fields provided" },
        { status: 400 }
      );
    }

    const domain = await prisma.domain.update({
      where: { id },
      data,
      include: {
        theme: true,
        server: { select: { id: true, label: true, name: true, host: true } },
        _count: { select: { articles: true } },
      },
    });

    return NextResponse.json(domain);
  } catch (error) {
    console.error("Failed to patch domain:", error);
    return NextResponse.json(
      { error: "Failed to patch domain" },
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
