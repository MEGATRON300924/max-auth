-- The MAX for Developers console needs explicit permission to manage
-- OAuth clients. Restrict this scope to the known first-party client IDs.
UPDATE "oauth_clients"
SET "scopes" = array_append("scopes", 'developer:manage')
WHERE "clientId" IN ('max_client_llITDlGy6a2tSJBX', 'max_client_developers_platform_v1')
  AND NOT ('developer:manage' = ANY("scopes"));
