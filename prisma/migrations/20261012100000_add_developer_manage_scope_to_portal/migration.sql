-- Keep the official developer console on the least-privilege scope set.
-- This also repairs stale client registrations that allowed unnecessary scopes.
UPDATE "oauth_clients"
SET "scopes" = ARRAY['openid', 'profile', 'email', 'offline_access', 'developer:manage']::text[]
WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1');

-- Old grants and tokens do not contain the new developer:manage permission.
-- Revoke them so the developer console must obtain a fresh, explicit grant.
UPDATE "oauth_access_tokens"
SET "revokedAt" = NOW()
WHERE "clientId" IN (SELECT "id" FROM "oauth_clients" WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1'))
  AND "revokedAt" IS NULL;

UPDATE "oauth_refresh_tokens"
SET "revokedAt" = NOW()
WHERE "clientId" IN (SELECT "id" FROM "oauth_clients" WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1'))
  AND "revokedAt" IS NULL;

DELETE FROM "oauth_authorization_codes"
WHERE "clientId" IN (SELECT "id" FROM "oauth_clients" WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1'));

UPDATE "oauth_consents"
SET "revokedAt" = NOW()
WHERE "clientId" IN (SELECT "id" FROM "oauth_clients" WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1'))
  AND "revokedAt" IS NULL;
