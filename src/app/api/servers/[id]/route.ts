import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";
import { prepareServerPassword, stripServerSecrets } from "@/lib/crypto";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
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

    return NextResponse.json(stripServerSecrets(server));
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
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.server.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Allow-list editable fields (no mass-assignment) and encrypt the password
    // only when a new non-empty one is supplied; an empty/absent password leaves
    // the stored credential untouched (audit G3 + G6).
    const data: Record<string, unknown> = {};
    for (const key of ["label", "name", "nameserver2", "host", "username", "status", "provider", "region", "tier", "stack"] as const) {
      if (typeof body[key] === "string") data[key] = body[key];
    }
    for (const key of ["port", "domainCap", "maxDeploysPerDay"] as const) {
      if (typeof body[key] === "number") data[key] = body[key];
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      const creds = prepareServerPassword(body.password);
      data.password = creds.password;
      data.passwordEnc = creds.passwordEnc;
    }

    const server = await prisma.server.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { domains: true },
        },
      },
    });

    return NextResponse.json(stripServerSecrets(server));
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
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
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
