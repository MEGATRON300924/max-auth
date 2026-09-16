CREATE TABLE "oauth_client_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "application_type" VARCHAR(20) NOT NULL DEFAULT 'WEB',
  "authorized_origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "package_name" VARCHAR(255),
  "bundle_id" VARCHAR(255),
  "certificate_fingerprints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_client_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_client_configs_client_id_key" UNIQUE ("client_id"),
  CONSTRAINT "oauth_client_configs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "oauth_client_configs_application_type_idx" ON "oauth_client_configs"("application_type");
