CREATE TABLE "system_status" (
  "id" VARCHAR(32) NOT NULL DEFAULT 'global',
  "status" JSONB NOT NULL,
  "updated_by" VARCHAR(100) NOT NULL DEFAULT 'The Tron Forge Limited',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_status_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_status" ("id", "status", "updated_by", "created_at", "updated_at")
VALUES ('global', '{"WhatsApp":{"category":"social","status":"green","reason":""},"Discord":{"category":"social","status":"green","reason":""},"Telegram":{"category":"social","status":"green","reason":""},"Messenger":{"category":"social","status":"green","reason":""},"Instagram":{"category":"social","status":"green","reason":""},"Webchat":{"category":"social","status":"green","reason":""},"GitHub":{"category":"social","status":"green","reason":""},"Microsoft Teams":{"category":"social","status":"green","reason":""},"MAX AI":{"category":"ai","status":"green","reason":""},"MAX Home":{"category":"ai","status":"green","reason":""},"MAX Car OS":{"category":"ai","status":"green","reason":""},"MAX Music":{"category":"ai","status":"green","reason":""},"MAX Cloud":{"category":"ai","status":"green","reason":""},"MAX Browser":{"category":"ai","status":"green","reason":""},"MAX Voice":{"category":"ai","status":"green","reason":""},"MAX Connect":{"category":"ai","status":"green","reason":""},"MAX Auth":{"category":"ai","status":"green","reason":""},"MAX Store":{"category":"ai","status":"green","reason":""},"MAX Studio":{"category":"ai","status":"green","reason":""},"MAX Security":{"category":"ai","status":"green","reason":""},"MAX Pay":{"category":"ai","status":"green","reason":""},"MAX OS":{"category":"ai","status":"green","reason":""},"GitHub Chat Extension":{"category":"development","status":"green","reason":""},"VS Code Extension":{"category":"development","status":"green","reason":""}}'::jsonb, 'The Tron Forge Limited', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
