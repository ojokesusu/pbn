import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const servers = await prisma.server.findMany({
      include: { _count: { select: { domains: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(servers);
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
