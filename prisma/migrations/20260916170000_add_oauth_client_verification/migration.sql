ALTER TABLE "oauth_client_configs"
  ADD COLUMN "manifest_url" TEXT,
  ADD COLUMN "verification_status" VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verified_at" TIMESTAMP(3);

CREATE INDEX "oauth_client_configs_verification_status_idx"
  ON "oauth_client_configs"("verification_status");
