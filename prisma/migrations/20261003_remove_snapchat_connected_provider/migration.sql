BEGIN;

DELETE FROM "connected_accounts" WHERE "provider"::text = 'SNAPCHAT';
DELETE FROM "oauth_integration_states" WHERE "provider"::text = 'SNAPCHAT';

CREATE TYPE "ConnectedProvider_new" AS ENUM (
  'GOOGLE',
  'X',
  'INSTAGRAM',
  'SPOTIFY',
  'DISCORD',
  'GITHUB',
  'MICROSOFT',
  'TIKTOK'
);

ALTER TABLE "connected_accounts"
  ALTER COLUMN "provider" TYPE "ConnectedProvider_new"
  USING ("provider"::text::"ConnectedProvider_new");

ALTER TABLE "oauth_integration_states"
  ALTER COLUMN "provider" TYPE "ConnectedProvider_new"
  USING ("provider"::text::"ConnectedProvider_new");

DROP TYPE "ConnectedProvider";
ALTER TYPE "ConnectedProvider_new" RENAME TO "ConnectedProvider";

COMMIT;
