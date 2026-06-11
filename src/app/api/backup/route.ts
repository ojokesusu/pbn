import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// GET /api/backup — backup history + DR readiness summary (blast-radius + freshness).
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const [records, servers, lastSuccess] = await Promise.all([
      prisma.backupRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.server.findMany({
        where: { status: { not: "archived" } },
        select: { id: true, provider: true, domains: { where: { isAlive: true, writeOff: false }, select: { id: true } } },
      }),
      prisma.backupRecord.findFirst({
        where: { status: "success" },
        orderBy: { completedAt: "desc" },
      }),
    ]);

    // Blast-radius per provider: how many LIVE domains we'd lose if that
    // provider's account got suspended.
    const byProvider = new Map<string, { servers: number; liveDomains: number }>();
    for (const s of servers) {
      const p = s.provider || "(none)";
      const e = byProvider.get(p) || { servers: 0, liveDomains: 0 };
      e.servers += 1;
      e.liveDomains += s.domains.length;
      byProvider.set(p, e);
    }
    const totalLive = [...byProvider.values()].reduce((a, b) => a + b.liveDomains, 0) || 1;
    const providers = [...byProvider.entries()]
      .map(([provider, v]) => ({
        provider,
        servers: v.servers,
        liveDomains: v.liveDomains,
        pct: Math.round((v.liveDomains / totalLive) * 1000) / 10,
      }))
      .sort((a, b) => b.liveDomains - a.liveDomains);
    const maxPct = providers.length ? providers[0].pct : 0;

    const lastSuccessAt = lastSuccess?.completedAt ?? null;
    const ageHours = lastSuccessAt ? (Date.now() - new Date(lastSuccessAt).getTime()) / 3_600_000 : null;

    return NextResponse.json({
      records,
      lastSuccessAt,
      backupAgeHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
      backupFresh: ageHours != null && ageHours < 24,
      readiness: { providers, totalLive, maxPct, concentrationRisk: maxPct > 25 },
    });
  } catch (err) {
    console.error("GET /api/backup failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/backup — trigger a backup now (creates a queued BackupRecord the
// RDP daemon picks up). Body: { } (trigger defaults to manual).
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    // Guard: don't stack backups — if one is already queued/running, return it.
    const inflight = await prisma.backupRecord.findFirst({
      where: { status: { in: ["queued", "running"] }, trigger: { not: "restore" } },
      orderBy: { createdAt: "desc" },
    });
    if (inflight) {
      return NextResponse.json({ ok: true, alreadyRunning: true, record: inflight });
    }

    const record = await prisma.backupRecord.create({
      data: { status: "queued", trigger: "manual", currentStep: "queued" },
    });
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("POST /api/backup failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
