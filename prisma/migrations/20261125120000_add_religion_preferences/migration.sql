CREATE TABLE "religion_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "religion" VARCHAR(80),
    "tradition" VARCHAR(120),
    "otherReligion" VARCHAR(120),
    "onboardingStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "personalizationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationPreferences" JSONB,
    "promptDeferredUntil" TIMESTAMP(3),
    "promptCompletedAt" TIMESTAMP(3),
    "notificationPromptCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "religion_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "religion_preferences_userId_key" ON "religion_preferences"("userId");
CREATE INDEX "religion_preferences_onboardingStatus_idx" ON "religion_preferences"("onboardingStatus");

ALTER TABLE "religion_preferences"
ADD CONSTRAINT "religion_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
