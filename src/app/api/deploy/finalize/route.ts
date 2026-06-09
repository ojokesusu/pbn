// POST /api/deploy/finalize  — service-token only
//
// Called by the RDP deploy worker AFTER it finished pushing files via SFTP.
// Records the outcome on the dashboard side (Domain.lastDeployed, DeployLog
// row, IndexNow ping). Decoupled from /api/deploy so the worker can deploy
// without involving Railway's outbound network at all.
//
// Body: { domainId: string, ok: boolean, filesUploaded?: number, error?: string }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitToIndexNow } from "@/lib/google-ping";

interface Body {
  domainId?: string;
  ok?: boolean;
  filesUploaded?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Body | null;
    if (!body?.domainId || typeof body.ok !== "boolean") {
      return NextResponse.json({ error: "domainId + ok wajib" }, { status: 400 });
    }

    const domain = await prisma.domain.findUnique({
      where: { id: body.domainId },
      select: { id: true, url: true },
    });
    if (!domain) {
      return NextResponse.json({ error: "Domain tidak ditemukan" }, { status: 404 });
    }

    if (body.ok) {
      await prisma.deployLog.create({
        data: {
          domainId: domain.id,
          action: "deploy",
          status: "success",
          filesChanged: body.filesUploaded ?? 0,
          message: `SFTP-deployed ${body.filesUploaded ?? 0} files (worker bypass)`,
        },
      });
      await prisma.domain.update({
        where: { id: domain.id },
        data: { lastDeployed: new Date() },
      });
      // Best-effort IndexNow — failure here does NOT fail the finalize call.
      try {
        await submitToIndexNow(domain.id);
      } catch (err) {
        console.warn(`[deploy/finalize] IndexNow failed for ${domain.id}:`, err);
      }
      return NextResponse.json({ ok: true, finalized: "success" });
    }

    // Failure path — log it; do NOT touch lastDeployed.
    await prisma.deployLog.create({
      data: {
        domainId: domain.id,
        action: "deploy",
        status: "failed",
        filesChanged: 0,
        message: (body.error ?? "sftp_failed").slice(0, 400),
      },
    });
    return NextResponse.json({ ok: true, finalized: "failure" });
  } catch (err) {
    console.error("/api/deploy/finalize failed:", err);
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 500 });
  }
}
