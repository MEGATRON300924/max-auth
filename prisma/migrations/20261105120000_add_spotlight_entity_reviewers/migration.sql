CREATE TABLE "spotlight_entity_reviewers" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "granted_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spotlight_entity_reviewers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spotlight_entity_reviewers_user_id_key" ON "spotlight_entity_reviewers"("user_id");
CREATE INDEX "spotlight_entity_reviewers_granted_by_id_idx" ON "spotlight_entity_reviewers"("granted_by_id");

ALTER TABLE "spotlight_entity_reviewers"
  ADD CONSTRAINT "spotlight_entity_reviewers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spotlight_entity_reviewers"
  ADD CONSTRAINT "spotlight_entity_reviewers_granted_by_id_fkey"
  FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bootstrap the existing MAX Auth administrator as the first entity reviewer.
INSERT INTO "spotlight_entity_reviewers" ("id", "user_id", "granted_by_id")
SELECT gen_random_uuid(), "id", "id" FROM "users" WHERE lower("username") = 'zionopaaje'
ON CONFLICT ("user_id") DO NOTHING;
