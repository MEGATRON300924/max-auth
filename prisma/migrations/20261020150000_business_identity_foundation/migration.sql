-- Additive MAX Auth for Businesses foundation.
-- This migration only creates new business-owned tables/types and adds no destructive changes.

CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "BusinessVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'ADMINISTRATOR', 'MANAGER', 'MEMBER', 'VIEWER', 'DEVELOPER');
CREATE TYPE "BusinessAuditAction" AS ENUM (
  'BUSINESS_CREATED',
  'BUSINESS_UPDATED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
  'OWNERSHIP_TRANSFERRED',
  'BUSINESS_STATUS_CHANGED'
);

CREATE TABLE "businesses" (
  "id" UUID NOT NULL,
  "businessId" VARCHAR(40) NOT NULL,
  "handle" VARCHAR(48) NOT NULL,
  "legalName" VARCHAR(160) NOT NULL,
  "displayName" VARCHAR(120) NOT NULL,
  "businessType" VARCHAR(64) NOT NULL,
  "country" VARCHAR(2) NOT NULL,
  "businessEmail" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(32),
  "website" VARCHAR(2048),
  "description" VARCHAR(1000),
  "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
  "verificationStatus" "BusinessVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "ownerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_memberships" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "BusinessRole" NOT NULL DEFAULT 'MEMBER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_audit_logs" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "actorId" UUID,
  "action" "BusinessAuditAction" NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "businesses_businessId_key" ON "businesses"("businessId");
CREATE UNIQUE INDEX "businesses_handle_key" ON "businesses"("handle");
CREATE INDEX "businesses_ownerId_createdAt_idx" ON "businesses"("ownerId", "createdAt");
CREATE INDEX "businesses_status_verificationStatus_idx" ON "businesses"("status", "verificationStatus");
CREATE UNIQUE INDEX "business_memberships_businessId_userId_key" ON "business_memberships"("businessId", "userId");
CREATE INDEX "business_memberships_userId_isActive_idx" ON "business_memberships"("userId", "isActive");
CREATE INDEX "business_memberships_businessId_role_isActive_idx" ON "business_memberships"("businessId", "role", "isActive");
CREATE INDEX "business_audit_logs_businessId_createdAt_idx" ON "business_audit_logs"("businessId", "createdAt");
CREATE INDEX "business_audit_logs_actorId_createdAt_idx" ON "business_audit_logs"("actorId", "createdAt");

ALTER TABLE "businesses" ADD CONSTRAINT "businesses_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_audit_logs" ADD CONSTRAINT "business_audit_logs_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_audit_logs" ADD CONSTRAINT "business_audit_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
