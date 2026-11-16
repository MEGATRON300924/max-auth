CREATE TABLE "github_app_installations" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "installation_id" TEXT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_type" TEXT NOT NULL,
  "repository_selection" TEXT NOT NULL,
  "permissions" JSONB,
  "suspended_at" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "github_app_installations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_app_installations_installation_id_key" ON "github_app_installations"("installation_id");
CREATE INDEX "github_app_installations_userId_idx" ON "github_app_installations"("userId");
ALTER TABLE "github_app_installations" ADD CONSTRAINT "github_app_installations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
