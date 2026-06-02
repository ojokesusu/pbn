-- CreateTable
CREATE TABLE "pbn"."NicheMapping" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "niche" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'id',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NicheMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbn"."RssSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'id',
    "region" TEXT NOT NULL DEFAULT 'ID',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFetched" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RssSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbn"."PromptTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL DEFAULT '',
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbn"."ContentJob" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceContent" TEXT,
    "rewrittenContent" TEXT,
    "publishedAt" TIMESTAMP(3),
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbn"."BudgetState" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "capCents" INTEGER NOT NULL DEFAULT 30000,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NicheMapping_domainId_key" ON "pbn"."NicheMapping"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "RssSource_url_key" ON "pbn"."RssSource"("url");

-- CreateIndex
CREATE INDEX "ContentJob_status_scheduledAt_idx" ON "pbn"."ContentJob"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetState_period_key" ON "pbn"."BudgetState"("period");

-- AddForeignKey
ALTER TABLE "pbn"."NicheMapping" ADD CONSTRAINT "NicheMapping_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "pbn"."Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

