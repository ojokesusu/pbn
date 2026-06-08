-- Phase F: add Domain.writeOff so operator-marked write-offs are excluded
-- from inventory / health / capacity counts. Schema-qualified to the pbn
-- namespace because Prisma is configured with @@schema("pbn") and Supabase
-- exposes both `public` and `pbn` schemas.
--
-- AlterTable
ALTER TABLE "pbn"."Domain" ADD COLUMN "writeOff" BOOLEAN NOT NULL DEFAULT false;

-- Backfill is a no-op: every existing row defaults to false (i.e. NOT written
-- off) which matches the pre-Phase-F behavior where the dashboard saw all
-- rows as candidates. Operator promotes specific rows to writeOff=true via
-- the /domains UI write-off action once that ships.
--
-- Index: writeOff is a low-cardinality boolean almost always combined with
-- isAlive / lastChecked in WHERE clauses (see /api/health-check/dead and
-- /api/stats). A standalone btree on (writeOff) would be wasted; if hot-path
-- queries show up in pg_stat_statements after rollout we can add a composite
-- like (writeOff, isAlive) then. Skipping for now to keep the migration tiny.
