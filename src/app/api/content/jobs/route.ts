import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || "";
    const domainId = searchParams.get("domainId")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10))
    );

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (domainId) where.domainId = domainId;

    const [total, items] = await Promise.all([
      prisma.contentJob.count({ where }),
      prisma.contentJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          domainId: true,
          status: true,
          sourceUrl: true,
          sourceTitle: true,
          publishedAt: true,
          costCents: true,
          errorMessage: true,
          scheduledAt: true,
          attemptedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Failed to list content jobs:", error);
    return NextResponse.json(
      { error: "Failed to list content jobs" },
      { status: 500 }
    );
  }
}
