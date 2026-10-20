-- Business context is optional so all existing personal OAuth grants remain unchanged.
ALTER TABLE "oauth_authorization_codes"
  ADD COLUMN "business_id" UUID,
  ADD CONSTRAINT "oauth_authorization_codes_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "oauth_authorization_codes_business_id_idx" ON "oauth_authorization_codes"("business_id");

ALTER TABLE "oauth_access_tokens"
  ADD COLUMN "business_id" UUID,
  ADD CONSTRAINT "oauth_access_tokens_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "oauth_access_tokens_business_id_idx" ON "oauth_access_tokens"("business_id");

ALTER TABLE "oauth_refresh_tokens"
  ADD COLUMN "business_id" UUID,
  ADD CONSTRAINT "oauth_refresh_tokens_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "oauth_refresh_tokens_business_id_idx" ON "oauth_refresh_tokens"("business_id");
