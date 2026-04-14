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
    "isAlive" BOOLEAN NOT NULL DEFAULT false,
    "httpStatus" INTEGER NOT NULL DEFAULT 0,
    "hasWordPress" BOOLEAN NOT NULL DEFAULT false,
    "wpPostCount" INTEGER NOT NULL DEFAULT 0,
    "lastChecked" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Domain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Domain_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Domain" ("createdAt", "genre", "id", "lastDeployed", "name", "serverId", "status", "themeId", "updatedAt", "url") SELECT "createdAt", "genre", "id", "lastDeployed", "name", "serverId", "status", "themeId", "updatedAt", "url" FROM "Domain";
DROP TABLE "Domain";
ALTER TABLE "new_Domain" RENAME TO "Domain";
CREATE UNIQUE INDEX "Domain_url_key" ON "Domain"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
