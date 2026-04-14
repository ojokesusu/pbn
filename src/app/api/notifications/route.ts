import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { isRead: false } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST() {
  // Mark all as read
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.notification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true, marked: result.count });
}

export async function DELETE() {
  // Clear all read notifications
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.notification.deleteMany({ where: { isRead: true } });
  return NextResponse.json({ ok: true, deleted: result.count });
}
