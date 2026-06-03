/**
 * audit-adult-pipeline.ts
 *
 * Verify that isAdult=true domains are fully removed from the active
 * pipeline (deploy queue queued/paused buckets, NicheMapping rows,
 * DomainSchedule isActive=true).
 *
 * Also performs the side effects requested by the filter task:
 *   1. Archive any DeployQueueItem where domain.isAdult AND status in
 *      ['queued','paused'] → status='adult_quarantine'
 *   2. Delete NicheMapping rows where domain.isAdult=true
 *
 * Prints a JSON summary to stdout for the workflow harness:
 *   {
 *     adult_domain_count,
 *     queued_items_archived,
 *     niche_mappings_removed,
 *     residual_active_schedules,
 *     residual_queued_items,
 *     residual_niche_mappings,
 *   }
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adultDomains = await prisma.domain.findMany({
    where: { isAdult: true } as Record<string, unknown>,
    select: { id: true, url: true },
  });
  const adultIds = adultDomains.map((d) => d.id);
  const adultCount = adultIds.length;

  // Step 1 — archive queued/paused deploy items
  let queuedArchived = 0;
  if (adultIds.length > 0) {
    const updated = await prisma.deployQueueItem.updateMany({
      where: {
        domainId: { in: adultIds },
        status: { in: ['queued', 'paused'] },
      },
      data: {
        status: 'adult_quarantine',
        errorMessage: 'Adult domain — auto-archived by audit-adult-pipeline',
      },
    });
    queuedArchived = updated.count;
  }

  // Step 2 — drop niche mappings for adult domains
  const nicheDel = await prisma.nicheMapping.deleteMany({
    where: { domain: { isAdult: true } as Record<string, unknown> },
  });
  const nicheRemoved = nicheDel.count;

  // Step 3 — also flip DomainSchedule.isActive=false for adult domains so the
  // scheduler never iterates them even before the filter trips.
  let schedulesDeactivated = 0;
  if (adultIds.length > 0) {
    const upd = await prisma.domainSchedule.updateMany({
      where: { domainId: { in: adultIds }, isActive: true },
      data: { isActive: false },
    });
    schedulesDeactivated = upd.count;
  }

  // Step 4 — residual verification
  const residualQueued = adultIds.length
    ? await prisma.deployQueueItem.count({
        where: {
          domainId: { in: adultIds },
          status: { in: ['queued', 'paused', 'processing'] },
        },
      })
    : 0;
  const residualNicheRows = await prisma.nicheMapping.count({
    where: { domain: { isAdult: true } as Record<string, unknown> },
  });
  const residualActiveSchedules = adultIds.length
    ? await prisma.domainSchedule.count({
        where: { domainId: { in: adultIds }, isActive: true },
      })
    : 0;

  const out = {
    run_at: new Date().toISOString(),
    adult_domain_count: adultCount,
    queued_items_archived: queuedArchived,
    niche_mappings_removed: nicheRemoved,
    schedules_deactivated: schedulesDeactivated,
    residual_queued_items: residualQueued,
    residual_niche_mappings: residualNicheRows,
    residual_active_schedules: residualActiveSchedules,
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
