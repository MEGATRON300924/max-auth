CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_events_userId_createdAt_idx" ON "usage_events"("userId", "createdAt");
CREATE INDEX "usage_events_path_createdAt_idx" ON "usage_events"("path", "createdAt");
CREATE INDEX "usage_events_statusCode_createdAt_idx" ON "usage_events"("statusCode", "createdAt");
CREATE INDEX "usage_events_createdAt_idx" ON "usage_events"("createdAt");

ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
