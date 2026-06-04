import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    let config = await prisma.backlinkConfig.findFirst();

    // Create default config if none exists
    if (!config) {
      config = await prisma.backlinkConfig.create({
        data: {
          maxPerDomain: 3,
          maxPerArticle: 1,
          percentArticles: 30,
          maxPerDay: 200,
          maxPerServerPerDay: 6,
        },
      });
    }

    return NextResponse.json({
      id: config.id,
      maxPerDomain: config.maxPerDomain,
      maxPerArticle: config.maxPerArticle,
      percentArticles: config.percentArticles,
      maxPerDay: config.maxPerDay,
      maxPerServerPerDay: config.maxPerServerPerDay,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error("Failed to fetch backlink config:", error);
    return NextResponse.json(
      { error: "Failed to fetch backlink config" },
      { status: 500 }
    );
  }
}

function validateIntRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: false, error: `${field} is required` };
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, error: `${field} must be an integer` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}` };
  }
  return { ok: true, value };
}

export async function PUT(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json();
    const {
      maxPerDomain,
      maxPerArticle,
      percentArticles,
      maxPerDay,
      maxPerServerPerDay,
    } = body;

    const checks = [
      validateIntRange(maxPerDomain, "maxPerDomain", 1, 10),
      validateIntRange(maxPerArticle, "maxPerArticle", 1, 5),
      validateIntRange(percentArticles, "percentArticles", 5, 100),
      validateIntRange(maxPerDay, "maxPerDay", 1, 10000),
      validateIntRange(maxPerServerPerDay, "maxPerServerPerDay", 1, 1000),
    ];

    for (const c of checks) {
      if (!c.ok) {
        return NextResponse.json({ error: c.error }, { status: 400 });
      }
    }

    let config = await prisma.backlinkConfig.findFirst();

    if (config) {
      config = await prisma.backlinkConfig.update({
        where: { id: config.id },
        data: {
          maxPerDomain,
          maxPerArticle,
          percentArticles,
          maxPerDay,
          maxPerServerPerDay,
        },
      });
    } else {
      config = await prisma.backlinkConfig.create({
        data: {
          maxPerDomain,
          maxPerArticle,
          percentArticles,
          maxPerDay,
          maxPerServerPerDay,
        },
      });
    }

    return NextResponse.json({
      id: config.id,
      maxPerDomain: config.maxPerDomain,
      maxPerArticle: config.maxPerArticle,
      percentArticles: config.percentArticles,
      maxPerDay: config.maxPerDay,
      maxPerServerPerDay: config.maxPerServerPerDay,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error("Failed to update backlink config:", error);
    return NextResponse.json(
      { error: "Failed to update backlink config" },
      { status: 500 }
    );
  }
}
