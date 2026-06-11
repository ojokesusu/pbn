import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

// POST /api/backup/restore — break-glass restore from a prior backup.
// Body: { backupId: string, confirm: true }
//
// DANGEROUS: a restore OVERWRITES the current DB with the snapshot. Double
// guarded — requires confirm:true. Creates a queued BackupRecord with
// trigger='restore' whose localPath/remotePath point at the source snapshot;
// the daemon runs db-restore.mjs against it. (Reuses the BackupRecord table +
// existing poll loop instead of a separate RestoreJob.)
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => null)) as { backupId?: string; confirm?: boolean } | null;
    if (!body?.backupId || body.confirm !== true) {
      return NextResponse.json({ error: "backupId + confirm:true wajib" }, { status: 400 });
    }

    const source = await prisma.backupRecord.findUnique({ where: { id: body.backupId } });
    if (!source || source.status !== "success") {
      return NextResponse.json({ error: "Backup sumber tidak valid / belum sukses" }, { status: 404 });
    }
    if (!source.localPath && !source.remotePath) {
      return NextResponse.json({ error: "Backup sumber tidak punya path file" }, { status: 409 });
    }

    // Don't allow two restores at once.
    const inflight = await prisma.backupRecord.findFirst({
      where: { trigger: "restore", status: { in: ["queued", "running"] } },
    });
    if (inflight) {
      return NextResponse.json({ ok: true, alreadyRunning: true, record: inflight });
    }

    const record = await prisma.backupRecord.create({
      data: {
        status: "queued",
        trigger: "restore",
        currentStep: `restore from ${source.id}`,
        // The daemon reads these to know which file to restore.
        localPath: source.localPath,
        remotePath: source.remotePath,
        tableCounts: source.tableCounts,
      },
    });
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("POST /api/backup/restore failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
