import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
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
  try {
    const body = await request.json();

    const { name, host, username, password, port, status } = body;

    if (!name || !host) {
      return NextResponse.json(
        { error: "Name and host are required" },
        { status: 400 }
      );
    }

    const server = await prisma.server.create({
      data: {
        name,
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
