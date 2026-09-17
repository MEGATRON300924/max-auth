CREATE OR REPLACE FUNCTION reset_oauth_client_verification_on_metadata_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name
     OR OLD."redirectUris" IS DISTINCT FROM NEW."redirectUris" THEN
    UPDATE "oauth_client_configs"
    SET "verification_status" = CASE
          WHEN "manifest_url" IS NULL THEN 'UNVERIFIED'
          ELSE 'PENDING'
        END,
        "verified_at" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "client_id" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oauth_client_verification_metadata_change
ON "oauth_clients";

CREATE TRIGGER oauth_client_verification_metadata_change
AFTER UPDATE OF "name", "redirectUris" ON "oauth_clients"
FOR EACH ROW
EXECUTE FUNCTION reset_oauth_client_verification_on_metadata_change();
