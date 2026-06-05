-- IndexNowLog — per-URL submission tracking for IndexNow protocol pings.
-- Additive + idempotent: safe to re-run on partially-applied state.
--
-- One row per submitted URL. batchId groups all URLs submitted in the same
-- API call so the operator can see "this batch of 12 URLs all succeeded /
-- failed together". httpStatus=0 means no response (timeout / network
-- error); errorMessage holds the short reason. attempt tracks retries (1..3).

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pbn"."IndexNowLog" (
  "id"           TEXT         NOT NULL,
  "domainId"     TEXT         NOT NULL,
  "batchId"      TEXT         NOT NULL,
  "url"          TEXT         NOT NULL,
  "httpStatus"   INTEGER      NOT NULL DEFAULT 0,
  "success"      BOOLEAN      NOT NULL DEFAULT false,
  "errorMessage" TEXT         NOT NULL DEFAULT '',
  "attempt"      INTEGER      NOT NULL DEFAULT 1,
  "submittedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndexNowLog_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 2) Indexes — (domainId, submittedAt) for per-domain history queries,
--    (batchId) for grouping URLs of a single submission call.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "IndexNowLog_domainId_submittedAt_idx"
  ON "pbn"."IndexNowLog"("domainId", "submittedAt");

CREATE INDEX IF NOT EXISTS "IndexNowLog_batchId_idx"
  ON "pbn"."IndexNowLog"("batchId");

-- ---------------------------------------------------------------------------
-- 3) FK to Domain — CASCADE so deleting a domain cleanly purges its
--    submission history (logs have no value without the parent domain).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'IndexNowLog_domainId_fkey'
  ) THEN
    ALTER TABLE "pbn"."IndexNowLog"
      ADD CONSTRAINT "IndexNowLog_domainId_fkey"
      FOREIGN KEY ("domainId") REFERENCES "pbn"."Domain"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
