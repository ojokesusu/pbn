-- Audit P2: add indexes to the Domain table.
-- Hot paths (dashboard list, /api/stats, /api/health-check, scheduler health
-- sub-tick) filter/group/order on serverId, isAlive+writeOff, lastChecked,
-- lastDeployed, isAdult, createdAt. Without indexes these are sequential scans
-- on every dashboard load, made worse by the PgBouncer pool pinned to
-- connection_limit=1. The table is small (~1.9k rows) so a plain
-- (non-CONCURRENT) CREATE INDEX is instant and safe inside Prisma's migration
-- transaction. Schema-qualified to pbn (@@schema("pbn")); index names follow
-- Prisma's convention so a later `prisma migrate dev` sees no drift.

-- CreateIndex
CREATE INDEX "Domain_serverId_idx" ON "pbn"."Domain"("serverId");

-- CreateIndex
CREATE INDEX "Domain_isAlive_writeOff_idx" ON "pbn"."Domain"("isAlive", "writeOff");

-- CreateIndex
CREATE INDEX "Domain_lastChecked_idx" ON "pbn"."Domain"("lastChecked");

-- CreateIndex
CREATE INDEX "Domain_lastDeployed_idx" ON "pbn"."Domain"("lastDeployed");

-- CreateIndex
CREATE INDEX "Domain_isAdult_idx" ON "pbn"."Domain"("isAdult");

-- CreateIndex
CREATE INDEX "Domain_createdAt_idx" ON "pbn"."Domain"("createdAt");
