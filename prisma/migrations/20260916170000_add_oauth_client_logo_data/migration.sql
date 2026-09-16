ALTER TABLE "oauth_client_configs"
  ADD COLUMN "logo_data" BYTEA,
  ADD COLUMN "logo_content_type" VARCHAR(64);
