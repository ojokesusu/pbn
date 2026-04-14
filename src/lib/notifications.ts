// ── Notification helpers ──
// Lightweight API for generating notifications from anywhere in the app.
// Keep this dead-simple: string-based types + severity levels.

import { prisma } from "./db";

export type NotifType =
  | "deploy-success"
  | "deploy-failed"
  | "backlink-placed"
  | "article-generated"
  | "health-alert"
  | "milestone"
  | "info"
  | "error";

export type NotifSeverity = "info" | "success" | "warning" | "error";

export async function notify(opts: {
  type: NotifType;
  title: string;
  message?: string;
  severity?: NotifSeverity;
  link?: string;
}) {
  try {
    await prisma.notification.create({
      data: {
        type: opts.type,
        title: opts.title,
        message: opts.message ?? "",
        severity: opts.severity ?? "info",
        link: opts.link ?? "",
      },
    });
  } catch (err) {
    // Notifications are non-critical — never let them break the caller
    console.error("[notify] failed to record notification:", err);
  }
}

// Purge notifications older than N days (default 30)
export async function purgeOldNotifications(daysOld = 30) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff }, isRead: true },
  });
}

// Check milestones after scheduler tick
export async function checkMilestones() {
  const [deployedCount, articleCount, placementCount, indexedCount] = await Promise.all([
    prisma.domain.count({ where: { lastDeployed: { not: null } } }),
    prisma.article.count(),
    prisma.backlinkPlacement.count(),
    prisma.domain.count({ where: { indexStatus: "indexed" } }),
  ]);

  const milestones: Array<{ threshold: number; label: string; value: number }> = [
    { threshold: 50, label: "50 domain deployed", value: deployedCount },
    { threshold: 100, label: "100 domain deployed", value: deployedCount },
    { threshold: 250, label: "250 domain deployed", value: deployedCount },
    { threshold: 500, label: "500 domain deployed", value: deployedCount },
    { threshold: 10000, label: "10.000 artikel", value: articleCount },
    { threshold: 1000, label: "1.000 backlink dipasang", value: placementCount },
    { threshold: 10, label: "10 domain terindex Google", value: indexedCount },
    { threshold: 50, label: "50 domain terindex Google", value: indexedCount },
  ];

  for (const m of milestones) {
    if (m.value < m.threshold) continue;
    // Check if already notified
    const existing = await prisma.notification.findFirst({
      where: { type: "milestone", title: { contains: m.label } },
    });
    if (existing) continue;
    await notify({
      type: "milestone",
      title: `🎉 Milestone: ${m.label}`,
      message: `Angka saat ini: ${m.value}. Selamat!`,
      severity: "success",
    });
  }
}
