ALTER TABLE "oauth_client_configs"
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "display_name" VARCHAR(100),
  ADD COLUMN "website_url" TEXT;
