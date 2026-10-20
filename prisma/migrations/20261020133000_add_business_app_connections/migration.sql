CREATE TYPE "BusinessAppConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "business_app_connections" (
  "id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "authorized_by_id" UUID NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "status" "BusinessAppConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_app_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_app_connections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_app_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_app_connections_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "business_app_connections_business_id_client_id_key" ON "business_app_connections"("business_id", "client_id");
CREATE INDEX "business_app_connections_business_id_status_idx" ON "business_app_connections"("business_id", "status");
CREATE INDEX "business_app_connections_authorized_by_id_idx" ON "business_app_connections"("authorized_by_id");
