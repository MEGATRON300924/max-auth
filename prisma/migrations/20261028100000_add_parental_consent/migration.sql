ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'PENDING_PARENTAL_APPROVAL';

CREATE TYPE "FamilyConsentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "FamilyAgeGroup" AS ENUM ('UNDER_16', 'AGE_16_17');

CREATE TABLE "family_consent_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "childUserId" UUID NOT NULL,
  "parentEmail" VARCHAR(255) NOT NULL,
  "ageGroup" "FamilyAgeGroup" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "FamilyConsentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "parentUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "family_consent_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "family_consent_requests_childUserId_fkey" FOREIGN KEY ("childUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "family_consent_requests_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "family_consent_requests_childUserId_key" ON "family_consent_requests"("childUserId");
CREATE UNIQUE INDEX "family_consent_requests_tokenHash_key" ON "family_consent_requests"("tokenHash");
CREATE INDEX "family_consent_requests_parentEmail_status_idx" ON "family_consent_requests"("parentEmail", "status");
CREATE INDEX "family_consent_requests_status_expiresAt_idx" ON "family_consent_requests"("status", "expiresAt");
