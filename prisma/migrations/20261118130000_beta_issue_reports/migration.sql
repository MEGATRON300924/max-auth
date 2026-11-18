CREATE TYPE "BetaIssueStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

CREATE TABLE "beta_issue_reports" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source" VARCHAR(32) NOT NULL,
  "product" VARCHAR(80) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" VARCHAR(8000) NOT NULL,
  "steps_to_reproduce" VARCHAR(8000),
  "expected_behaviour" VARCHAR(4000),
  "actual_behaviour" VARCHAR(4000),
  "conversation_id" VARCHAR(128),
  "message_id" VARCHAR(128),
  "user_message" VARCHAR(8000),
  "assistant_response" VARCHAR(12000),
  "error_message" VARCHAR(4000),
  "page_url" VARCHAR(1000),
  "model" VARCHAR(128),
  "client_metadata" VARCHAR(4000),
  "status" "BetaIssueStatus" NOT NULL DEFAULT 'OPEN',
  "admin_note" VARCHAR(4000),
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beta_issue_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "beta_issue_reports_status_created_at_idx" ON "beta_issue_reports"("status", "created_at");
CREATE INDEX "beta_issue_reports_source_created_at_idx" ON "beta_issue_reports"("source", "created_at");
CREATE INDEX "beta_issue_reports_user_id_created_at_idx" ON "beta_issue_reports"("user_id", "created_at");

ALTER TABLE "beta_issue_reports" ADD CONSTRAINT "beta_issue_reports_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beta_issue_reports" ADD CONSTRAINT "beta_issue_reports_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "beta_issue_reports" ENABLE ROW LEVEL SECURITY;
