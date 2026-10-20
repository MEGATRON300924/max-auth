-- Additive MAX Auth business identity layer. Existing identity/OAuth tables are untouched.
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "BusinessVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "BusinessMemberRole" AS ENUM ('OWNER', 'ADMINISTRATOR', 'MANAGER', 'MEMBER', 'VIEWER', 'DEVELOPER');
CREATE TYPE "BusinessMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "BusinessInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "businesses" (
  "id" UUID NOT NULL,
  "business_id" VARCHAR(48) NOT NULL,
  "handle" VARCHAR(64) NOT NULL,
  "legal_name" VARCHAR(180) NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phone" VARCHAR(40) NOT NULL,
  "country" VARCHAR(2) NOT NULL,
  "business_type" VARCHAR(80) NOT NULL,
  "website_url" VARCHAR(2048),
  "logo_url" VARCHAR(2048),
  "description" VARCHAR(2000),
  "registration_number" VARCHAR(120),
  "owner_id" UUID NOT NULL,
  "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
  "verification_status" "BusinessVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "email_verified_at" TIMESTAMP(3),
  "email_verification_token_hash" TEXT,
  "email_verification_expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "businesses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "businesses_business_id_key" ON "businesses"("business_id");
CREATE UNIQUE INDEX "businesses_handle_key" ON "businesses"("handle");
CREATE UNIQUE INDEX "businesses_email_verification_token_hash_key" ON "businesses"("email_verification_token_hash");
CREATE INDEX "businesses_owner_id_idx" ON "businesses"("owner_id");
CREATE INDEX "businesses_status_verification_status_idx" ON "businesses"("status", "verification_status");
CREATE INDEX "businesses_email_idx" ON "businesses"("email");

CREATE TABLE "business_memberships" (
  "id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "BusinessMemberRole" NOT NULL DEFAULT 'MEMBER',
  "status" "BusinessMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "business_memberships_business_id_user_id_key" ON "business_memberships"("business_id", "user_id");
CREATE INDEX "business_memberships_user_id_status_idx" ON "business_memberships"("user_id", "status");
CREATE INDEX "business_memberships_business_id_role_status_idx" ON "business_memberships"("business_id", "role", "status");

CREATE TABLE "business_invitations" (
  "id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "role" "BusinessMemberRole" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "invited_by_id" UUID NOT NULL,
  "status" "BusinessInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "business_invitations_token_hash_key" ON "business_invitations"("token_hash");
CREATE INDEX "business_invitations_business_id_status_expires_at_idx" ON "business_invitations"("business_id", "status", "expires_at");
CREATE INDEX "business_invitations_email_status_idx" ON "business_invitations"("email", "status");

CREATE TABLE "business_audit_logs" (
  "id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "actor_id" UUID,
  "action" VARCHAR(80) NOT NULL,
  "metadata" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "business_audit_logs_business_id_created_at_idx" ON "business_audit_logs"("business_id", "created_at");
CREATE INDEX "business_audit_logs_actor_id_created_at_idx" ON "business_audit_logs"("actor_id", "created_at");
