-- CreateTable
CREATE TABLE "SchedulerConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "articlesPerWeek" INTEGER NOT NULL DEFAULT 4,
    "timeWindowStart" INTEGER NOT NULL DEFAULT 6,
    "timeWindowEnd" INTEGER NOT NULL DEFAULT 23,
    "autoDeploy" BOOLEAN NOT NULL DEFAULT true,
    "autoPurgeCache" BOOLEAN NOT NULL DEFAULT true,
    "initialArticles" INTEGER NOT NULL DEFAULT 5,
    "maxDomainsPerDay" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SchedulerJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "message" TEXT NOT NULL DEFAULT '',
    "articlesCreated" INTEGER NOT NULL DEFAULT 0,
    "filesDeployed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchedulerJob_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomainSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGenerated" DATETIME,
    "lastDeployedByScheduler" DATETIME,
    "nextScheduled" DATETIME,
    "totalGenerated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DomainSchedule_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainSchedule_domainId_key" ON "DomainSchedule"("domainId");
