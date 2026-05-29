import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { denyIfNotAdmin } from "@/lib/auth";

type QueueItemWithRelations = {
  id: string;
  domainId: string;
  serverId: string | null;
  priority: number;
  status: string;
  scheduledAt: string | null;
  attemptedAt: string | null;
  errorMessage: string;
  createdAt: Date;
  domain: { id: string; name: string; url: string; genre: string } | null;
  server: { id: string; label: string; host: string } | null;
};

async function hydrateItems(items: Array<{
  id: string;
  domainId: string;
  serverId: string | null;
  priority: number;
  status: string;
  scheduledAt: Date | null;
  attemptedAt: Date | null;
  errorMessage: string;
  createdAt: Date;
  server: { id: string; label: string; host: string } | null;
}>): Promise<QueueItemWithRelations[]> {
  const domainIds = items.map((i) => i.domainId);
  const domains = domainIds.length
    ? await prisma.domain.findMany({
        where: { id: { in: domainIds } },
        select: { id: true, name: true, url: true, genre: true },
      })
    : [];
  const domainMap = new Map(domains.map((d) => [d.id, d]));

  return items.map((item) => ({
    id: item.id,
    domainId: item.domainId,
    serverId: item.serverId,
    priority: item.priority,
    status: item.status,
    scheduledAt: item.scheduledAt ? item.scheduledAt.toISOString() : null,
    attemptedAt: item.attemptedAt ? item.attemptedAt.toISOString() : null,
    errorMessage: item.errorMessage,
    createdAt: item.createdAt,
    domain: domainMap.get(item.domainId) ?? null,
    server: item.server,
  }));
}

async function buildResponse() {
  const queueRaw = await prisma.deployQueueItem.findMany({
    where: { status: { in: ["queued", "processing"] } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      server: { select: { id: true, label: true, host: true } },
    },
  });

  const queue = await hydrateItems(queueRaw);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [totalQueued, processingNow, completedToday, scheduledNext24h] =
    await Promise.all([
      prisma.deployQueueItem.count({ where: { status: "queued" } }),
      prisma.deployQueueItem.count({ where: { status: "processing" } }),
      prisma.deployQueueItem.count({
        where: {
          status: "completed",
          completedAt: { gte: startOfToday },
        },
      }),
      prisma.deployQueueItem.count({
        where: {
          status: "queued",
          scheduledAt: { gte: now, lte: next24h },
        },
      }),
    ]);

  return {
    queue,
    stats: {
      totalQueued,
      processingNow,
      completedToday,
      scheduledNext24h,
    },
  };
}

// GET /api/provisioning/deploy-queue
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const data = await buildResponse();
    return NextResponse.json(data);
  } catch (error) {
    console.error("deploy-queue GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch deploy queue" },
      { status: 500 }
    );
  }
}

type AddRemoveBody = {
  action: "add" | "remove";
  domainIds: string[];
  serverId?: string;
  priority?: number;
};

type ScheduleBody = {
  action: "schedule";
  scheduledAt?: string;
};

type PostBody = AddRemoveBody | ScheduleBody;

// POST /api/provisioning/deploy-queue
export async function POST(request: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as PostBody;
    const action = body.action;

    if (action === "add") {
      const { domainIds, serverId, priority } = body as AddRemoveBody;
      if (!Array.isArray(domainIds) || domainIds.length === 0) {
        return NextResponse.json(
          { error: "domainIds is required" },
          { status: 400 }
        );
      }
      const prio = typeof priority === "number" ? priority : 0;

      await Promise.all(
        domainIds.map((domainId) =>
          prisma.deployQueueItem.upsert({
            where: { domainId },
            update: {
              status: "queued",
              priority: prio,
              ...(serverId ? { serverId } : {}),
              errorMessage: "",
              attemptedAt: null,
            },
            create: {
              domainId,
              status: "queued",
              priority: prio,
              serverId: serverId ?? null,
            },
          })
        )
      );
    } else if (action === "remove") {
      const { domainIds } = body as AddRemoveBody;
      if (!Array.isArray(domainIds) || domainIds.length === 0) {
        return NextResponse.json(
          { error: "domainIds is required" },
          { status: 400 }
        );
      }
      await prisma.deployQueueItem.deleteMany({
        where: {
          domainId: { in: domainIds },
          status: "queued",
        },
      });
    } else if (action === "schedule") {
      // Anti-spam pace planning: distribute queued unsched items over (count/12) days
      // starting tomorrow morning 9am. ~12 per day (10-15/day band).
      const PER_DAY = 12;
      const unscheduled = await prisma.deployQueueItem.findMany({
        where: { status: "queued", scheduledAt: null },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        select: { id: true },
      });

      if (unscheduled.length > 0) {
        const now = new Date();
        const tomorrow9am = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
          9,
          0,
          0,
          0
        );

        // Spread evenly within each day's 9am-9pm window (12 slots/day).
        const SLOT_MINUTES = (12 * 60) / PER_DAY; // 60 min between slots

        await Promise.all(
          unscheduled.map((item, idx) => {
            const dayOffset = Math.floor(idx / PER_DAY);
            const slot = idx % PER_DAY;
            const slotTime = new Date(tomorrow9am);
            slotTime.setDate(slotTime.getDate() + dayOffset);
            slotTime.setMinutes(slotTime.getMinutes() + slot * SLOT_MINUTES);
            return prisma.deployQueueItem.update({
              where: { id: item.id },
              data: { scheduledAt: slotTime },
            });
          })
        );
      }
    } else {
      return NextResponse.json(
        { error: `Unknown action: ${String(action)}` },
        { status: 400 }
      );
    }

    const data = await buildResponse();
    return NextResponse.json(data);
  } catch (error) {
    console.error("deploy-queue POST error:", error);
    return NextResponse.json(
      { error: "Failed to mutate deploy queue" },
      { status: 500 }
    );
  }
}
