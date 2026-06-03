-- AlterTable
ALTER TABLE "pbn"."Domain" ADD COLUMN "isAdult" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pbn"."Domain" ADD COLUMN "adultDetectedAt" TIMESTAMP(3);
