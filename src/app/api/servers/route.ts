import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    // Legacy callers (e.g. /domains/new server dropdown) get the array shape.
    const isPaginated = searchParams.has("page") || searchParams.has("perPage");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const perPageRaw = parseInt(searchParams.get("perPage") || "100", 10) || 100;
    const perPage = Math.min(500, Math.max(1, perPageRaw));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { label: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { host: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { nameserver2: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, servers] = await Promise.all([
      prisma.server.count({ where }),
      prisma.server.findMany({
        where,
        include: { _count: { select: { domains: true } } },
        orderBy: { createdAt: "desc" },
        ...(isPaginated ? { take: perPage, skip: (page - 1) * perPage } : {}),
      }),
    ]);

    if (!isPaginated) {
      return NextResponse.json(servers);
    }
    return NextResponse.json({ data: servers, total, page, perPage });
  } catch (error) {
    console.error("Failed to fetch servers:", error);
    return NextResponse.json(
      { error: "Failed to fetch servers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json();

    const { label, name, nameserver2, host, username, password, port, status } = body;

    if (!name || !host) {
      return NextResponse.json(
        { error: "Name and host are required" },
        { status: 400 }
      );
    }

    // Auto-generate sequential label if none provided (e.g. "Server-490")
    let finalLabel = (label as string | undefined)?.trim();
    if (!finalLabel) {
      const count = await prisma.server.count();
      finalLabel = `Server-${String(count + 1).padStart(3, "0")}`;
    }

    const server = await prisma.server.create({
      data: {
        label: finalLabel,
        name,
        nameserver2: nameserver2 ?? "",
        host,
        username: username ?? "",
        password: password ?? "",
        port: port ?? 21,
        status: status ?? "active",
      },
      include: {
        _count: {
          select: { domains: true },
        },
      },
    });

    return NextResponse.json(server, { status: 201 });
  } catch (error) {
    console.error("Failed to create server:", error);
    return NextResponse.json(
      { error: "Failed to create server" },
      { status: 500 }
    );
  }
}
