/*
  Warnings:

  - You are about to drop the column `ftpHost` on the `Domain` table. All the data in the column will be lost.
  - You are about to drop the column `ftpPass` on the `Domain` table. All the data in the column will be lost.
  - You are about to drop the column `ftpPort` on the `Domain` table. All the data in the column will be lost.
  - You are about to drop the column `ftpUser` on the `Domain` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 21,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Backlink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anchorText" TEXT NOT NULL DEFAULT '',
    "targetUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BacklinkPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backlinkId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "usedAnchor" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BacklinkPlacement_backlinkId_fkey" FOREIGN KEY ("backlinkId") REFERENCES "Backlink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BacklinkPlacement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BacklinkPlacement_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BacklinkConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxPerDomain" INTEGER NOT NULL DEFAULT 3,
    "maxPerArticle" INTEGER NOT NULL DEFAULT 1,
    "percentArticles" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "serverId" TEXT,
    "genre" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "themeId" TEXT,
    "lastDeployed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Domain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Domain_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Domain" ("createdAt", "id", "lastDeployed", "name", "status", "themeId", "updatedAt", "url") SELECT "createdAt", "id", "lastDeployed", "name", "status", "themeId", "updatedAt", "url" FROM "Domain";
DROP TABLE "Domain";
ALTER TABLE "new_Domain" RENAME TO "Domain";
CREATE UNIQUE INDEX "Domain_url_key" ON "Domain"("url");
CREATE TABLE "new_Theme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL DEFAULT 'developer',
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#1e40af',
    "accentColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "bgColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#111827',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "headerStyle" TEXT NOT NULL DEFAULT 'centered',
    "footerStyle" TEXT NOT NULL DEFAULT 'simple',
    "customCss" TEXT NOT NULL DEFAULT '',
    "layoutName" TEXT NOT NULL DEFAULT 'single-column',
    "cssPrefix" TEXT NOT NULL DEFAULT '',
    "headingFont" TEXT NOT NULL DEFAULT 'Inter',
    "borderRadius" TEXT NOT NULL DEFAULT '8px',
    "shadowStyle" TEXT NOT NULL DEFAULT '0 1px 3px rgba(0,0,0,0.1)',
    "spacingScale" TEXT NOT NULL DEFAULT '1',
    "containerWidth" TEXT NOT NULL DEFAULT '1100px',
    "generatedCss" TEXT NOT NULL DEFAULT '',
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Theme" ("accentColor", "bgColor", "createdAt", "customCss", "fontFamily", "footerStyle", "headerStyle", "id", "name", "primaryColor", "secondaryColor", "textColor", "updatedAt") SELECT "accentColor", "bgColor", "createdAt", "customCss", "fontFamily", "footerStyle", "headerStyle", "id", "name", "primaryColor", "secondaryColor", "textColor", "updatedAt" FROM "Theme";
DROP TABLE "Theme";
ALTER TABLE "new_Theme" RENAME TO "Theme";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BacklinkPlacement_backlinkId_articleId_key" ON "BacklinkPlacement"("backlinkId", "articleId");
