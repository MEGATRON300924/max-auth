CREATE TABLE "oauth_integration_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "ConnectedProvider" NOT NULL,
    "state_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "verifier_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_integration_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_integration_states_state_hash_key" ON "oauth_integration_states"("state_hash");
CREATE INDEX "oauth_integration_states_user_id_provider_idx" ON "oauth_integration_states"("user_id", "provider");
CREATE INDEX "oauth_integration_states_expires_at_idx" ON "oauth_integration_states"("expires_at");

ALTER TABLE "oauth_integration_states"
ADD CONSTRAINT "oauth_integration_states_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
