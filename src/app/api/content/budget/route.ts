import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Period format: YYYY-MM (current month UTC)
function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period")?.trim() || currentPeriod();

    let state = await prisma.budgetState.findUnique({ where: { period } });
    if (!state) {
      state = await prisma.budgetState.create({
        data: { period, spentCents: 0, capCents: 30000, alertSent: false },
      });
    }

    return NextResponse.json({ state });
  } catch (error) {
    console.error("Failed to fetch budget state:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget state" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const period =
      typeof body.period === "string" && body.period.trim()
        ? body.period.trim()
        : currentPeriod();

    const data: Record<string, unknown> = {};
    if (typeof body.capCents === "number" && Number.isFinite(body.capCents)) {
      if (body.capCents < 0) {
        return NextResponse.json(
          { error: "capCents must be >= 0" },
          { status: 400 }
        );
      }
      data.capCents = Math.floor(body.capCents);
    }
    if (typeof body.spentCents === "number" && Number.isFinite(body.spentCents)) {
      if (body.spentCents < 0) {
        return NextResponse.json(
          { error: "spentCents must be >= 0" },
          { status: 400 }
        );
      }
      data.spentCents = Math.floor(body.spentCents);
    }
    if (typeof body.alertSent === "boolean") data.alertSent = body.alertSent;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const state = await prisma.budgetState.upsert({
      where: { period },
      update: data,
      create: {
        period,
        capCents: typeof data.capCents === "number" ? data.capCents : 30000,
        spentCents: typeof data.spentCents === "number" ? data.spentCents : 0,
        alertSent: typeof data.alertSent === "boolean" ? data.alertSent : false,
      },
    });

    return NextResponse.json({ state });
  } catch (error) {
    console.error("Failed to update budget state:", error);
    return NextResponse.json(
      { error: "Failed to update budget state" },
      { status: 500 }
    );
  }
}
