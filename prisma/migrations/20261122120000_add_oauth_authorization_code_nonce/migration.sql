-- Reconcile the OAuth authorization-code model with the production database.
-- Safe to run more than once; existing authorization-code rows are preserved.
ALTER TABLE public.oauth_authorization_codes
  ADD COLUMN IF NOT EXISTS "nonce" TEXT;
