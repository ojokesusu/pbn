import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// TODO: Replace base64 obfuscation with proper symmetric encryption (e.g. AES-256-GCM
// using a server-side key from env) before exposing this DB beyond the private network.
function obfuscatePassword(plain: string): string {
  return Buffer.from(plain, "utf8").toString("base64");
}

interface TargetInput {
  label?: unknown;
  host?: unknown;
  sshUser?: unknown;
  sshPassword?: unknown;
}

export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const batches = await prisma.provisionBatch.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { tasks: true } },
      },
    });
    return NextResponse.json({ batches });
  } catch (error) {
    console.error("Failed to fetch provision batches:", error);
    return NextResponse.json(
      { error: "Failed to fetch provision batches" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: {
    name?: unknown;
    provider?: unknown;
    region?: unknown;
    tier?: unknown;
    targets?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const region = typeof body.region === "string" ? body.region.trim() : "";
  const tier = typeof body.tier === "string" ? body.tier.trim() : "";
  const targetsRaw = body.targets;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }
  if (!region) {
    return NextResponse.json({ error: "region is required" }, { status: 400 });
  }
  if (!tier) {
    return NextResponse.json({ error: "tier is required" }, { status: 400 });
  }
  if (!Array.isArray(targetsRaw)) {
    return NextResponse.json(
      { error: "targets must be an array" },
      { status: 400 }
    );
  }
  if (targetsRaw.length < 1 || targetsRaw.length > 30) {
    return NextResponse.json(
      { error: "targets must contain between 1 and 30 items" },
      { status: 400 }
    );
  }

  const normalizedTargets: {
    label: string;
    host: string;
    sshUser: string;
    sshPassEnc: string;
  }[] = [];

  for (let i = 0; i < targetsRaw.length; i++) {
    const t = targetsRaw[i] as TargetInput;
    const label = typeof t?.label === "string" ? t.label.trim() : "";
    const host = typeof t?.host === "string" ? t.host.trim() : "";
    const sshUser =
      typeof t?.sshUser === "string" && t.sshUser.trim()
        ? t.sshUser.trim()
        : "root";
    const sshPassword =
      typeof t?.sshPassword === "string" ? t.sshPassword : "";

    if (!label) {
      return NextResponse.json(
        { error: `targets[${i}].label is required` },
        { status: 400 }
      );
    }
    if (!host) {
      return NextResponse.json(
        { error: `targets[${i}].host is required` },
        { status: 400 }
      );
    }
    if (!sshPassword) {
      return NextResponse.json(
        { error: `targets[${i}].sshPassword is required` },
        { status: 400 }
      );
    }

    normalizedTargets.push({
      label,
      host,
      sshUser,
      sshPassEnc: obfuscatePassword(sshPassword),
    });
  }

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.provisionBatch.create({
        data: {
          name,
          provider,
          region,
          tier,
          totalTargets: normalizedTargets.length,
          pendingCount: normalizedTargets.length,
          status: "pending",
        },
      });

      await tx.provisionTask.createMany({
        data: normalizedTargets.map((t) => ({
          batchId: created.id,
          label: t.label,
          host: t.host,
          sshUser: t.sshUser,
          sshPassEnc: t.sshPassEnc,
          provider,
          region,
          tier,
          status: "pending",
        })),
      });

      return tx.provisionBatch.findUnique({
        where: { id: created.id },
        include: { tasks: true },
      });
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    console.error("Failed to create provision batch:", error);
    return NextResponse.json(
      { error: "Failed to create provision batch" },
      { status: 500 }
    );
  }
}
