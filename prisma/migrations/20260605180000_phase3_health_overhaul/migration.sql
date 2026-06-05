-- Phase 3 — Domain health overhaul.
-- Additive + idempotent: safe to re-run on partially-applied state.
--
-- Adds 5 new health-tracking columns to Domain (failure streak start, SSL
-- expiry, rolling response-time, last WAF block) and creates DomainHealthLog
-- for per-check history. DomainHealthLog rows are FK'd to Domain with
-- ON DELETE CASCADE so purging a domain cleanly drops its health history.

-- ---------------------------------------------------------------------------
-- 1) Domain — 5 new health columns
-- ---------------------------------------------------------------------------
ALTER TABLE "pbn"."Domain"
  ADD COLUMN IF NOT EXISTS "firstFailureAt" TIMESTAMP(3);

ALTER TABLE "pbn"."Domain"
  ADD COLUMN IF NOT EXISTS "sslExpiresAt" TIMESTAMP(3);

ALTER TABLE "pbn"."Domain"
  ADD COLUMN IF NOT EXISTS "sslDaysLeft" INTEGER NOT NULL DEFAULT -1;

ALTER TABLE "pbn"."Domain"
  ADD COLUMN IF NOT EXISTS "avgResponseMs" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "pbn"."Domain"
  ADD COLUMN IF NOT EXISTS "lastWafBlock" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 2) DomainHealthLog — per-check history table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pbn"."DomainHealthLog" (
  "id"           TEXT         NOT NULL,
  "domainId"     TEXT         NOT NULL,
  "checkedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isAlive"      BOOLEAN      NOT NULL DEFAULT false,
  "httpStatus"   INTEGER      NOT NULL DEFAULT 0,
  "responseMs"   INTEGER      NOT NULL DEFAULT 0,
  "wpVersion"    TEXT         NOT NULL DEFAULT '',
  "sslDaysLeft"  INTEGER      NOT NULL DEFAULT -1,
  "errorReason"  TEXT         NOT NULL DEFAULT '',
  "errorMessage" TEXT         NOT NULL DEFAULT '',
  CONSTRAINT "DomainHealthLog_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3) Indexes — (domainId, checkedAt) for per-domain trending,
--    (checkedAt) for global recent-activity queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "DomainHealthLog_domainId_checkedAt_idx"
  ON "pbn"."DomainHealthLog"("domainId", "checkedAt");

CREATE INDEX IF NOT EXISTS "DomainHealthLog_checkedAt_idx"
  ON "pbn"."DomainHealthLog"("checkedAt");

-- ---------------------------------------------------------------------------
-- 4) FK to Domain — CASCADE so deleting a domain cleanly purges its
--    health history (logs have no value without the parent domain).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DomainHealthLog_domainId_fkey'
  ) THEN
    ALTER TABLE "pbn"."DomainHealthLog"
      ADD CONSTRAINT "DomainHealthLog_domainId_fkey"
      FOREIGN KEY ("domainId") REFERENCES "pbn"."Domain"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
