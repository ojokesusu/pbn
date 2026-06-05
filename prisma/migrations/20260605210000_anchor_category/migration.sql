-- Phase 5a — persist the strategy-weighted anchor category chosen by the
-- distributor. Existing rows stay NULL (unknown — placement predates the
-- column). The stats route treats NULL as "uncategorized" and excludes it
-- from the per-strategy anchor mix.

ALTER TABLE "pbn"."BacklinkPlacement"
  ADD COLUMN "anchorCategory" TEXT;

CREATE INDEX "BacklinkPlacement_anchorCategory_idx"
  ON "pbn"."BacklinkPlacement" ("anchorCategory");
