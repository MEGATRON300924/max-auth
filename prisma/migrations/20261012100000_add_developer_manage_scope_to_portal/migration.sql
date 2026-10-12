-- Keep the official developer console on the least-privilege scope set.
-- This also repairs stale client registrations that allowed unnecessary scopes.
UPDATE "oauth_clients"
SET "scopes" = ARRAY['openid', 'profile', 'email', 'offline_access', 'developer:manage']::text[]
WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1');
