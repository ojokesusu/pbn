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

// Archive any queued/paused items that point at an adult domain so they
// never get picked up by the deploy worker. Returns the number archived.
async function archiveAdultQueueItems(): Promise<number> {
  const adultDomains = await prisma.domain.findMany({
    where: { isAdult: true },
    select: { id: true },
  });
  if (adultDomains.length === 0) return 0;
  const adultIds = adultDomains.map((d) => d.id);
  const result = await prisma.deployQueueItem.updateMany({
    where: {
      domainId: { in: adultIds },
      status: { in: ["queued", "paused"] },
    },
    data: { status: "adult_quarantine", errorMessage: "Adult domain — auto-archived" },
  });
  return result.count;
}

async function buildResponse() {
  // Sweep adult items into the quarantine bucket on every fetch so the UI
  // never displays them under "queued" and the worker never picks them up.
  await archiveAdultQueueItems();

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

      // Auto-propagate Domain.serverId when caller doesn't provide one.
      // Also drop adult-flagged domains here so they never enter the queue.
      const domainRows = await prisma.domain.findMany({
        where: { id: { in: domainIds }, isAdult: false },
        select: { id: true, serverId: true },
      });
      const domainServerMap = new Map(
        domainRows.map((d) => [d.id, d.serverId])
      );
      const allowedDomainIds = domainIds.filter((id) => domainServerMap.has(id));

      // Phase D capacity gate: per-server domainCap enforcement.
      // For every distinct resolved serverId we sum (Domain rows pointing at it)
      // + (DeployQueueItem rows already queued/processing for it) and bail with
      // 409 if that total already meets/exceeds Server.domainCap. We do this
      // BEFORE any upsert so partial writes can't leak past the cap.
      const resolvedPerDomain = new Map<string, string | null>();
      for (const domainId of allowedDomainIds) {
        resolvedPerDomain.set(
          domainId,
          serverId ?? domainServerMap.get(domainId) ?? null
        );
      }
      const distinctServerIds = Array.from(
        new Set(
          Array.from(resolvedPerDomain.values()).filter(
            (sid): sid is string => typeof sid === "string" && sid.length > 0
          )
        )
      );
      if (distinctServerIds.length > 0) {
        // Quarantine gate: reject if any resolved server is quarantined/archived
        // BEFORE the capacity check so we never even count slots on a dead box.
        const quarantineRows = await prisma.server.findMany({
          where: { id: { in: distinctServerIds } },
          select: { id: true, status: true },
        });
        for (const srv of quarantineRows) {
          if (srv.status === "quarantined" || srv.status === "archived") {
            return NextResponse.json(
              { error: "server_quarantined", serverId: srv.id },
              { status: 409 }
            );
          }
        }
        // Phase F fix: previously we did `Domain.count + DeployQueueItem.count`
        // which double-counted any domain that was BOTH already linked to the
        // server (Domain.serverId = X) AND queued for it (DeployQueueItem with
        // serverId = X) — the dashboard saw inflated "current" values (e.g.
        // 80k on cap 20) when in fact the same domainIds appeared on both
        // sides. Conceptually this mirrors the cartesian-fanout pattern you'd
        // get from a LEFT JOIN Domain LEFT JOIN DeployQueueItem without
        // aggregation; the fix is to count DISTINCT domainIds across the two
        // sources. We fetch the id sets per server (cheap — bounded by cap)
        // and union in JS so the result is a true headcount of unique domains
        // bound to each server (live or pending), matching what we charge
        // against domainCap.
        const serverRows = await prisma.server.findMany({
          where: { id: { in: distinctServerIds } },
          select: {
            id: true,
            domainCap: true,
          },
        });
        const linkedDomainRows = await prisma.domain.findMany({
          where: {
            serverId: { in: distinctServerIds },
            writeOff: false,
          },
          select: { id: true, serverId: true },
        });
        const queuedDomainRows = await prisma.deployQueueItem.findMany({
          where: {
            serverId: { in: distinctServerIds },
            status: { in: ["queued", "processing"] },
          },
          select: { domainId: true, serverId: true },
        });
        const distinctDomainsByServer = new Map<string, Set<string>>();
        for (const sid of distinctServerIds) {
          distinctDomainsByServer.set(sid, new Set<string>());
        }
        for (const d of linkedDomainRows) {
          if (!d.serverId) continue;
          distinctDomainsByServer.get(d.serverId)?.add(d.id);
        }
        for (const q of queuedDomainRows) {
          if (!q.serverId) continue;
          distinctDomainsByServer.get(q.serverId)?.add(q.domainId);
        }
        for (const srv of serverRows) {
          const cap = srv.domainCap ?? 0;
          const current = distinctDomainsByServer.get(srv.id)?.size ?? 0;
          // How many of THIS request's domains would land on this server?
          let incoming = 0;
          for (const sid of resolvedPerDomain.values()) {
            if (sid === srv.id) incoming += 1;
          }
          if (current + incoming > cap) {
            return NextResponse.json(
              {
                error: "server_at_capacity",
                serverId: srv.id,
                current,
                cap,
              },
              { status: 409 }
            );
          }
        }
      }

      await Promise.all(
        allowedDomainIds.map((domainId) => {
          const resolvedServerId =
            resolvedPerDomain.get(domainId) ?? null;
          return prisma.deployQueueItem.upsert({
            where: { domainId },
            update: {
              status: "queued",
              priority: prio,
              ...(resolvedServerId ? { serverId: resolvedServerId } : {}),
              errorMessage: "",
              attemptedAt: null,
            },
            create: {
              domainId,
              status: "queued",
              priority: prio,
              serverId: resolvedServerId,
            },
          });
        })
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
      // Anti-spam pace planning: distribute queued unsched items per-server,
      // each server respects its own Server.maxDeploysPerDay (fallback 12).
      // Starts tomorrow 9am. Items without a serverId fall into a shared
      // "_unassigned" bucket that uses the legacy 12/day flat pace.
      // Quarantine any adult items first so the schedule slots stay clean.
      await archiveAdultQueueItems();
      const DEFAULT_PER_DAY = 12;
      const unscheduled = await prisma.deployQueueItem.findMany({
        where: { status: "queued", scheduledAt: null },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        select: { id: true, serverId: true },
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

        // Preload per-server maxDeploysPerDay for every distinct serverId in the
        // unscheduled set. Servers without an explicit cap fall back to 12/day.
        const distinctServerIds = Array.from(
          new Set(
            unscheduled
              .map((i) => i.serverId)
              .filter((s): s is string => typeof s === "string" && s.length > 0)
          )
        );
        const serverRows =
          distinctServerIds.length > 0
            ? await prisma.server.findMany({
                where: { id: { in: distinctServerIds } },
                select: { id: true, maxDeploysPerDay: true },
              })
            : [];
        const perDayByServer = new Map<string, number>(
          serverRows.map((s) => [
            s.id,
            Math.max(
              1,
              (s as { maxDeploysPerDay?: number | null }).maxDeploysPerDay ??
                DEFAULT_PER_DAY
            ),
          ])
        );

        // Partition queue items by serverId — "_unassigned" for the null-serverId
        // bucket. Insertion order preserves the priority/createdAt sort above.
        const buckets = new Map<string, { id: string }[]>();
        for (const item of unscheduled) {
          const key = item.serverId ?? "_unassigned";
          const bucket = buckets.get(key) ?? [];
          bucket.push({ id: item.id });
          buckets.set(key, bucket);
        }

        const updates: Promise<unknown>[] = [];
        for (const [serverKey, bucket] of buckets.entries()) {
          const perDay =
            serverKey === "_unassigned"
              ? DEFAULT_PER_DAY
              : perDayByServer.get(serverKey) ?? DEFAULT_PER_DAY;
          // Each bucket gets its own 9am-9pm window (12h). Slot minute width
          // shrinks for denser servers so spread stays even within the day.
          const slotMinutes = (12 * 60) / perDay;

          bucket.forEach((item, idx) => {
            const dayOffset = Math.floor(idx / perDay);
            const slot = idx % perDay;
            const slotTime = new Date(tomorrow9am);
            slotTime.setDate(slotTime.getDate() + dayOffset);
            slotTime.setMinutes(slotTime.getMinutes() + slot * slotMinutes);
            updates.push(
              prisma.deployQueueItem.update({
                where: { id: item.id },
                data: { scheduledAt: slotTime },
              })
            );
          });
        }

        await Promise.all(updates);
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
