-- Phase 1: extend RssSource into a generic ContentSource. Additive — no
-- existing rows get re-typed. New columns default existing rows to
-- type='rss' / adapter='rss_generic' so the dispatch layer treats them as
-- normal RSS feeds. Future adapters (api_football, tmdb, ...) populate the
-- same table with type != 'rss'.

ALTER TABLE "pbn"."RssSource"
  ADD COLUMN IF NOT EXISTS "type"       TEXT NOT NULL DEFAULT 'rss',
  ADD COLUMN IF NOT EXISTS "adapter"    TEXT NOT NULL DEFAULT 'rss_generic',
  ADD COLUMN IF NOT EXISTS "config"     JSONB,
  ADD COLUMN IF NOT EXISTS "lastError"  TEXT,
  ADD COLUMN IF NOT EXISTS "errorCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
