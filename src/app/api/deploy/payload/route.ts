// POST /api/deploy/payload  — service-token only
//
// Returns the generated static-site files for a domain so the RDP-side
// deploy worker can push them via SFTP directly to the target VPS.
//
// Why this exists: Railway US-East egress can't reliably reach Indonesian
// VPS hosts. For stack=bare_ols (Pure-FTPd refuses root login → 530), we
// instead let the daemon SFTP over its existing SSH key. The daemon hits
// THIS endpoint to fetch the files, then writes them to the server itself
// without involving Railway's egress.
//
// Auth: x-service-token header validated upstream by middleware.ts.
// Anyone with that token can request payload — same trust level as the
// existing /api/deploy worker call.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSite } from "@/lib/generator";
import { ensureThemeForDomain } from "@/lib/theme-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { domainId?: string } | null;
    if (!body?.domainId) {
      return NextResponse.json({ error: "domainId wajib" }, { status: 400 });
    }

    const domain = await prisma.domain.findUnique({
      where: { id: body.domainId },
      select: {
        id: true,
        url: true,
        name: true,
        isAdult: true,
        themeId: true,
        genre: true,
      },
    });
    if (!domain) {
      return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 });
    }
    if (domain.isAdult) {
      return NextResponse.json({ error: "adult_quarantine" }, { status: 409 });
    }

    if (!domain.themeId) {
      await ensureThemeForDomain(domain.id, domain.genre, "deploy-payload");
    }

    const { files } = await generateSite(domain.id);

    const domainHost = (domain.url || domain.name || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();

    // NOTE: caller (deploy_worker.py) chooses the remotePath based on the
    // RESOLVED queue-item server's stack, NOT Domain.serverId — which can be
    // stale (e.g. pointing at archived legacy server). We only return files +
    // domainHost; the worker constructs the path.
    return NextResponse.json({
      ok: true,
      domainId: domain.id,
      domainHost,
      fileCount: files.length,
      files,
    });
  } catch (err) {
    console.error("/api/deploy/payload failed:", err);
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 500 });
  }
}
