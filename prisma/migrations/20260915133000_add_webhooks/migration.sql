CREATE TABLE "webhook_endpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "secret_hash" VARCHAR(128) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_endpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "webhook_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "endpoint_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_subscriptions_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "webhook_subscriptions_endpoint_event_key" UNIQUE ("endpoint_id", "event_type")
);

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "endpoint_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "event_id" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "response_status" INTEGER,
  "response_body" VARCHAR(1000),
  "next_attempt_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "webhook_endpoints_user_id_idx" ON "webhook_endpoints"("user_id");
CREATE INDEX "webhook_subscriptions_endpoint_id_idx" ON "webhook_subscriptions"("endpoint_id");
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "webhook_deliveries"("endpoint_id", "created_at");
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");
