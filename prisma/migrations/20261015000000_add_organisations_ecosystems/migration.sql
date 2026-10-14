CREATE TABLE IF NOT EXISTS organisations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL, slug VARCHAR(64) NOT NULL UNIQUE,
 created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT organisations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE TABLE IF NOT EXISTS organisation_members (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT organisation_members_role CHECK (role IN ('OWNER','ADMIN','DEVELOPER','MEMBER','READ_ONLY')),
 CONSTRAINT organisation_members_unique UNIQUE (organisation_id,user_id)
);
CREATE INDEX IF NOT EXISTS organisation_members_user_idx ON organisation_members(user_id);
CREATE TABLE IF NOT EXISTS ecosystems (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
 name VARCHAR(120) NOT NULL, slug VARCHAR(64) NOT NULL, description VARCHAR(500),
 created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT ecosystems_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 CONSTRAINT ecosystems_org_slug_unique UNIQUE (organisation_id,slug)
);
CREATE INDEX IF NOT EXISTS ecosystems_org_idx ON ecosystems(organisation_id);
CREATE TABLE IF NOT EXISTS ecosystem_clients (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ecosystem_id UUID NOT NULL REFERENCES ecosystems(id) ON DELETE CASCADE,
 oauth_client_id UUID NOT NULL UNIQUE REFERENCES oauth_clients(id) ON DELETE CASCADE,
 linked_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, is_primary BOOLEAN NOT NULL DEFAULT FALSE,
 linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ecosystem_clients_ecosystem_idx ON ecosystem_clients(ecosystem_id);
CREATE UNIQUE INDEX IF NOT EXISTS ecosystem_one_primary_client_idx ON ecosystem_clients(ecosystem_id) WHERE is_primary = TRUE;
CREATE TABLE IF NOT EXISTS ecosystem_identities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ecosystem_id UUID NOT NULL REFERENCES ecosystems(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT ecosystem_identity_user_unique UNIQUE (ecosystem_id,user_id)
);
CREATE INDEX IF NOT EXISTS ecosystem_identities_user_idx ON ecosystem_identities(user_id);
