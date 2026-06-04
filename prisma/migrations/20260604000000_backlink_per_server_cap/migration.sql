-- AlterTable: add per-server daily cap. New rows get default 6 via column
-- default. Existing rows get 6 explicitly (idempotent — covers any odd state
-- where the column landed nullable before tightening).
ALTER TABLE "pbn"."BacklinkConfig" ADD COLUMN IF NOT EXISTS "maxPerServerPerDay" INTEGER NOT NULL DEFAULT 6;
UPDATE "pbn"."BacklinkConfig" SET "maxPerServerPerDay" = 6 WHERE "maxPerServerPerDay" IS NULL;

-- Data migration: bump the global daily cap from the obsolete 1-server
-- default (15) to the new fleet-wide default (200). Only rewrites rows still
-- pinned to the old default — operator-tuned values are preserved.
UPDATE "pbn"."BacklinkConfig" SET "maxPerDay" = 200 WHERE "maxPerDay" = 15;
