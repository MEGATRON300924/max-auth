CREATE TABLE IF NOT EXISTS "sensitive_action_proofs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "home_id" UUID NOT NULL,
  "resource_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensitive_action_proofs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sensitive_action_proofs_token_hash_key" ON "sensitive_action_proofs"("token_hash");
CREATE INDEX IF NOT EXISTS "sensitive_action_proofs_user_id_expires_at_idx" ON "sensitive_action_proofs"("user_id","expires_at");
CREATE INDEX IF NOT EXISTS "sensitive_action_proofs_home_id_resource_id_action_expires_at_idx" ON "sensitive_action_proofs"("home_id","resource_id","action","expires_at");
