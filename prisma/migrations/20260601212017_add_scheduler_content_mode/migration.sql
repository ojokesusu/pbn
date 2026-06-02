-- AlterTable: add hybrid RSS+rewrite mode fields to SchedulerConfig (additive, backward compatible)
ALTER TABLE "pbn"."SchedulerConfig" ADD COLUMN "contentMode" TEXT NOT NULL DEFAULT 'pure_ai';
ALTER TABLE "pbn"."SchedulerConfig" ADD COLUMN "hybridSourceLimit" INTEGER NOT NULL DEFAULT 3;
