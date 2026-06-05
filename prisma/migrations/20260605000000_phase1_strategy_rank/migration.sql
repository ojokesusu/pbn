-- Phase 1: Strategy buckets + SERP rank tracking
-- Additive + idempotent: safe to re-run on partially-applied state.

-- ---------------------------------------------------------------------------
-- 1) Domain.strategy — per-domain bucket flag (whitehat | greyhat | blackhat).
--    Existing rows default to 'whitehat' (safest blend-in default).
-- ---------------------------------------------------------------------------
ALTER TABLE "pbn"."Domain"
  ADD COLUMN IF NOT EXISTS "strategy" TEXT NOT NULL DEFAULT 'whitehat';

-- ---------------------------------------------------------------------------
-- 2) StrategyConfig — per-bucket operator-tunable rules.
--    perServerCapMult multiplies BacklinkConfig.maxPerServerPerDay at runtime.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pbn"."StrategyConfig" (
  "id"                    TEXT             NOT NULL,
  "strategy"              TEXT             NOT NULL,
  "articlesPerWeek"       INTEGER          NOT NULL DEFAULT 3,
  "backlinkPerArticleMax" INTEGER          NOT NULL DEFAULT 1,
  "anchorExactPct"        INTEGER          NOT NULL DEFAULT 10,
  "perServerCapMult"      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "contentMode"           TEXT             NOT NULL DEFAULT 'hybrid_rss',
  "imageMode"             TEXT             NOT NULL DEFAULT 'rss_first',
  "description"           TEXT             NOT NULL DEFAULT '',
  "updatedAt"             TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "StrategyConfig_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on strategy (one row per bucket). Idempotent: only add if
-- not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StrategyConfig_strategy_key'
  ) THEN
    ALTER TABLE "pbn"."StrategyConfig"
      ADD CONSTRAINT "StrategyConfig_strategy_key" UNIQUE ("strategy");
  END IF;
END $$;

-- Seed three rows. ON CONFLICT keeps re-runs no-op + preserves operator edits.
INSERT INTO "pbn"."StrategyConfig" (
  "id", "strategy", "articlesPerWeek", "backlinkPerArticleMax",
  "anchorExactPct", "perServerCapMult", "contentMode", "imageMode",
  "description", "updatedAt"
) VALUES
  (
    'strategy_whitehat_seed', 'whitehat', 3, 1, 10, 0.5,
    'hybrid_rss', 'rss_first',
    'Slow burn, blend-in, real content, diverse anchors',
    NOW()
  ),
  (
    'strategy_greyhat_seed', 'greyhat', 4, 2, 35, 1.0,
    'hybrid_rss', 'rss_first',
    'Balanced — natural content with moderate anchor density',
    NOW()
  ),
  (
    'strategy_blackhat_seed', 'blackhat', 6, 5, 70, 2.0,
    'pure_ai', 'stock_first',
    'High velocity, exact-match anchors, burn-and-replace',
    NOW()
  )
ON CONFLICT ("strategy") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) RankKeyword — operator-defined SERP tracking targets.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pbn"."RankKeyword" (
  "id"          TEXT         NOT NULL,
  "keyword"     TEXT         NOT NULL,
  "domainId"    TEXT,
  "targetUrl"   TEXT         NOT NULL DEFAULT '',
  "locale"      TEXT         NOT NULL DEFAULT 'id',
  "region"      TEXT         NOT NULL DEFAULT 'ID',
  "device"      TEXT         NOT NULL DEFAULT 'desktop',
  "active"      BOOLEAN      NOT NULL DEFAULT true,
  "source"      TEXT         NOT NULL DEFAULT 'manual',
  "lastChecked" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RankKeyword_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RankKeyword_domainId_idx"
  ON "pbn"."RankKeyword"("domainId");
CREATE INDEX IF NOT EXISTS "RankKeyword_active_idx"
  ON "pbn"."RankKeyword"("active");

-- FK to Domain. SetNull so deleting a PBN domain doesn't nuke historical
-- snapshots — operator might still want to inspect them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RankKeyword_domainId_fkey'
  ) THEN
    ALTER TABLE "pbn"."RankKeyword"
      ADD CONSTRAINT "RankKeyword_domainId_fkey"
      FOREIGN KEY ("domainId") REFERENCES "pbn"."Domain"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) RankSnapshot — daily SERP capture rows. Cascade on keyword delete so
--    operator removing a keyword cleanly purges its history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pbn"."RankSnapshot" (
  "id"        TEXT             NOT NULL,
  "keywordId" TEXT             NOT NULL,
  "position"  INTEGER          NOT NULL,
  "top10Json" JSONB            NOT NULL,
  "foundUrl"  TEXT             NOT NULL DEFAULT '',
  "costUsd"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "provider"  TEXT             NOT NULL DEFAULT 'serper',
  "checkedAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RankSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RankSnapshot_keywordId_checkedAt_idx"
  ON "pbn"."RankSnapshot"("keywordId", "checkedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RankSnapshot_keywordId_fkey'
  ) THEN
    ALTER TABLE "pbn"."RankSnapshot"
      ADD CONSTRAINT "RankSnapshot_keywordId_fkey"
      FOREIGN KEY ("keywordId") REFERENCES "pbn"."RankKeyword"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
