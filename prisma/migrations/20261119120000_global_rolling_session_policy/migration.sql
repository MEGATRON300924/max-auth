-- Central MAX Auth rolling inactivity policy.
-- Existing refresh grants keep their already-issued absolute expiry. New grants
-- receive a separate 30-day idle window and a centrally configured absolute cap.

ALTER TABLE "sessions"
  ADD COLUMN "familyId" UUID,
  ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);

UPDATE "sessions"
SET
  "familyId" = "id",
  "absoluteExpiresAt" = "createdAt" + INTERVAL '365 days',
  "expiresAt" = LEAST(
    GREATEST(COALESCE("lastUsedAt", "createdAt"), "createdAt") + INTERVAL '30 days',
    "createdAt" + INTERVAL '365 days'
  );

ALTER TABLE "sessions"
  ALTER COLUMN "familyId" SET NOT NULL,
  ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;

CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

ALTER TABLE "oauth_access_tokens"
  ADD COLUMN "refresh_family_id" UUID;

CREATE INDEX "oauth_access_tokens_refresh_family_id_idx" ON "oauth_access_tokens"("refresh_family_id");

ALTER TABLE "oauth_refresh_tokens"
  ADD COLUMN "family_id" UUID,
  ADD COLUMN "idle_expires_at" TIMESTAMP(3),
  ADD COLUMN "absolute_expires_at" TIMESTAMP(3),
  ADD COLUMN "last_used_at" TIMESTAMP(3);

-- Do not silently extend the lifetime of already-issued OAuth refresh tokens.
UPDATE "oauth_refresh_tokens"
SET
  "family_id" = gen_random_uuid(),
  "absolute_expires_at" = "expiresAt",
  "idle_expires_at" = LEAST("createdAt" + INTERVAL '30 days', "expiresAt"),
  "last_used_at" = "createdAt";

ALTER TABLE "oauth_refresh_tokens"
  ALTER COLUMN "family_id" SET NOT NULL,
  ALTER COLUMN "idle_expires_at" SET NOT NULL,
  ALTER COLUMN "absolute_expires_at" SET NOT NULL,
  ALTER COLUMN "last_used_at" SET NOT NULL;

CREATE INDEX "oauth_refresh_tokens_family_id_idx" ON "oauth_refresh_tokens"("family_id");
CREATE INDEX "oauth_refresh_tokens_idle_expires_at_idx" ON "oauth_refresh_tokens"("idle_expires_at");
