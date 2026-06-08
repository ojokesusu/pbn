-- Add per-server deploy throttle + scheduler heartbeat / tick lock fields.
-- Generated 2026-06-08. Created with --create-only equivalent (manual write
-- because Supabase pooler denies shadow DB creation; SQL diffed via
-- `prisma migrate diff --from-schema-datasource --to-schema-datamodel`).
--
-- Railway auto-migrate will apply this on next deploy.

-- AlterTable
ALTER TABLE "pbn"."BacklinkConfig" ALTER COLUMN "maxPerDay" SET DEFAULT 200;

-- AlterTable
ALTER TABLE "pbn"."SchedulerConfig" ADD COLUMN     "deployWorkerHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "tickLockUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pbn"."Server" ADD COLUMN     "maxDeploysPerDay" INTEGER NOT NULL DEFAULT 6;
