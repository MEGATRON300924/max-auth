ALTER TABLE "webhook_endpoints"
ADD COLUMN IF NOT EXISTS "secret_encrypted" TEXT;
