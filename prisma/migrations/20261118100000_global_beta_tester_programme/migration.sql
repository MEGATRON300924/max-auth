-- MAX Auth global Beta Tester programme.
-- Safe to re-run during controlled recovery; do not deploy with prisma migrate deploy
-- until the shared Prisma migration history has been reconciled.
ALTER TABLE public.webhook_endpoints
  ADD COLUMN IF NOT EXISTS secret_encrypted TEXT;

DO $$ BEGIN
  CREATE TYPE "BetaApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BetaRole" AS ENUM ('BETA_TESTER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "beta_role_assignments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "BetaRole" NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "granted_by" UUID,
  CONSTRAINT "beta_role_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "beta_role_assignments_user_id_role_key"
  ON "beta_role_assignments"("user_id", "role");
CREATE INDEX IF NOT EXISTS "beta_role_assignments_role_granted_at_idx"
  ON "beta_role_assignments"("role", "granted_at");
DO $$ BEGIN
  ALTER TABLE "beta_role_assignments" ADD CONSTRAINT "beta_role_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "beta_applications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "full_name" VARCHAR(128) NOT NULL,
  "devices" TEXT[] NOT NULL,
  "products" TEXT[] NOT NULL,
  "status" "BetaApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "review_note" VARCHAR(1000),
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beta_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "beta_applications_user_id_key" ON "beta_applications"("user_id");
CREATE INDEX IF NOT EXISTS "beta_applications_status_created_at_idx" ON "beta_applications"("status", "created_at");
DO $$ BEGIN
  ALTER TABLE "beta_applications" ADD CONSTRAINT "beta_applications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "beta_announcements" (
  "id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "body" VARCHAR(12000) NOT NULL,
  "product_reference" VARCHAR(80) NOT NULL,
  "author_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "beta_announcements_created_at_idx" ON "beta_announcements"("created_at");
DO $$ BEGIN
  ALTER TABLE "beta_announcements" ADD CONSTRAINT "beta_announcements_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "beta_notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "announcement_id" UUID NOT NULL,
  "read_at" TIMESTAMP(3),
  "email_sent_at" TIMESTAMP(3),
  "email_error" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "beta_notifications_user_id_announcement_id_key"
  ON "beta_notifications"("user_id", "announcement_id");
CREATE INDEX IF NOT EXISTS "beta_notifications_user_id_created_at_idx"
  ON "beta_notifications"("user_id", "created_at");
DO $$ BEGIN
  ALTER TABLE "beta_notifications" ADD CONSTRAINT "beta_notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "beta_notifications" ADD CONSTRAINT "beta_notifications_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "beta_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
