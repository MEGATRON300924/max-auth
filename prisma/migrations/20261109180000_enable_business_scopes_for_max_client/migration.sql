-- Enable the business permissions required by the MAX business integration
-- for this specific OAuth application. Preserve every scope already assigned.
DO $$
DECLARE
  target_client_id UUID;
  current_scopes TEXT[];
  required_scopes TEXT[] := ARRAY['business:read', 'business:apps:manage']::TEXT[];
BEGIN
  SELECT id, scopes
    INTO target_client_id, current_scopes
    FROM oauth_clients
   WHERE "clientId" = 'max_client_h893WB84sD_-D3Nw'
   LIMIT 1;

  IF target_client_id IS NULL THEN
    RAISE EXCEPTION 'MAX OAuth client max_client_h893WB84sD_-D3Nw was not found; refusing to apply business scopes to an unknown client';
  END IF;

  IF NOT (COALESCE(current_scopes, ARRAY[]::TEXT[]) @> required_scopes) THEN
    UPDATE oauth_clients
       SET scopes = ARRAY(
         SELECT DISTINCT scope
           FROM unnest(COALESCE(current_scopes, ARRAY[]::TEXT[]) || required_scopes) AS scope
          ORDER BY scope
       ),
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE id = target_client_id;

    -- Match the normal OAuth client update behavior: require fresh consent
    -- after the application's permission set changes.
    DELETE FROM oauth_authorization_codes WHERE "clientId" = target_client_id;
    UPDATE oauth_access_tokens
       SET "revokedAt" = CURRENT_TIMESTAMP
     WHERE "clientId" = target_client_id AND "revokedAt" IS NULL;
    UPDATE oauth_refresh_tokens
       SET "revokedAt" = CURRENT_TIMESTAMP
     WHERE "clientId" = target_client_id AND "revokedAt" IS NULL;
    UPDATE oauth_consents
       SET "revokedAt" = CURRENT_TIMESTAMP
     WHERE "clientId" = target_client_id AND "revokedAt" IS NULL;
  END IF;
END $$;
