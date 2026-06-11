import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// GET /api/evacuate — evacuation scope (servers + providers with live-domain
// counts) plus recent evacuation jobs.
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const [servers, jobs] = await Promise.all([
      prisma.server.findMany({
        where: { status: { not: "archived" } },
        select: {
          id: true, label: true, host: true, provider: true, stack: true, status: true,
          domains: { where: { writeOff: false, isAdult: false }, select: { id: true, isAlive: true } },
        },
        orderBy: [{ provider: "asc" }, { label: "asc" }],
      }),
      prisma.evacuationJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    const serverRows = servers.map((s) => ({
      id: s.id,
      label: s.label || s.host,
      host: s.host,
      provider: s.provider,
      stack: s.stack,
      status: s.status,
      domains: s.domains.length,
      live: s.domains.filter((d) => d.isAlive).length,
    }));

    const provMap = new Map<string, { servers: number; domains: number; live: number }>();
    for (const s of serverRows) {
      const e = provMap.get(s.provider) || { servers: 0, domains: 0, live: 0 };
      e.servers += 1; e.domains += s.domains; e.live += s.live;
      provMap.set(s.provider, e);
    }
    const providers = [...provMap.entries()].map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.domains - a.domains);

    return NextResponse.json({ servers: serverRows, providers, jobs });
  } catch (err) {
    console.error("GET /api/evacuate failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/evacuate — start an evacuation. Body:
//   { mode: 'provider', sourceProvider: 'contabo' }  OR
//   { mode: 'server', sourceServerId: '...' }
// Creates a queued EvacuationJob the RDP daemon executes
// (provision replacement → reassign domains → re-deploy from DB → repoint DNS).
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => null)) as
      | { mode?: "provider" | "server"; sourceProvider?: string; sourceServerId?: string }
      | null;
    if (!body?.mode || (body.mode === "provider" && !body.sourceProvider) || (body.mode === "server" && !body.sourceServerId)) {
      return NextResponse.json({ error: "mode + (sourceProvider|sourceServerId) wajib" }, { status: 400 });
    }

    // Count domains in scope so the UI shows the blast size immediately.
    const where = body.mode === "provider"
      ? { server: { provider: body.sourceProvider }, writeOff: false, isAdult: false }
      : { serverId: body.sourceServerId, writeOff: false, isAdult: false };
    const domainCount = await prisma.domain.count({ where });

    const inflight = await prisma.evacuationJob.findFirst({ where: { status: { in: ["queued", "running"] } } });
    if (inflight) {
      return NextResponse.json({ error: "Ada evakuasi lain yang sedang berjalan", record: inflight }, { status: 409 });
    }

    const job = await prisma.evacuationJob.create({
      data: {
        status: "queued",
        mode: body.mode,
        sourceProvider: body.sourceProvider ?? "",
        sourceServerId: body.sourceServerId ?? "",
        domainCount,
        currentStep: "queued",
      },
    });
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    console.error("POST /api/evacuate failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
