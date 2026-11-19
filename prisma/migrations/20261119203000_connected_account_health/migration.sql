CREATE TYPE "ConnectedAccountStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED');

ALTER TABLE "connected_accounts"
ADD COLUMN "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'CONNECTED',
ADD COLUMN "statusReason" TEXT,
ADD COLUMN "statusUpdatedAt" TIMESTAMP(3);
