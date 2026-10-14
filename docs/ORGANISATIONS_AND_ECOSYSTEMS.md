# MAX Auth Organisations & Ecosystems

This feature adds organisation workspaces and ecosystem-scoped identity to MAX Auth.

## Data model

- **Organisation**: workspace created by a MAX Account. The creator is assigned the OWNER role.
- **Organisation member**: role-based access (OWNER, ADMIN, DEVELOPER, MEMBER, READ_ONLY).
- **Ecosystem**: an identity boundary owned by one organisation.
- **Ecosystem client**: links an existing active OAuth client to one ecosystem. The OAuth client, its client ID, redirect URIs and existing registration are retained.
- **Ecosystem identity**: stable subject mapping for a MAX user inside an ecosystem.

OAuth clients may be linked only when their owner is a member of the owning organisation. A client can be linked to one ecosystem at a time. Organisation ownership and role checks are enforced by the API.

## API

All endpoints are under /api/v1/ecosystems and require a valid MAX Auth developer/session bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /organisations | List organisations the current user belongs to |
| POST | /organisations | Create an organisation; creator becomes owner |
| GET | /organisations/:organisationId/ecosystems | List an organisation's ecosystems |
| POST | /organisations/:organisationId/ecosystems | Create an ecosystem (owner/admin) |
| POST | /ecosystems/:ecosystemId/clients | Link an existing OAuth client (owner/admin/developer) |
| PUT | /ecosystems/:ecosystemId/clients/:oauthClientId/primary | Select the primary linked client |
| DELETE | /ecosystems/:ecosystemId/clients/:oauthClientId | Unlink a client without deleting it |

Create organisation body: { "name": "Acme Hosting", "slug": "acme-hosting" }.

Create ecosystem body: { "name": "Hosting", "slug": "hosting", "description": "Shared identity for hosting products" }.

Link client body: { "oauthClientId": "OAuthClient database UUID", "isPrimary": true }. This expects the OAuth client's database id, not its public clientId.

## Identity behaviour

Unlinked clients keep the existing MAX Auth subject behaviour. Clients linked to the same ecosystem receive a stable ecosystem-specific sub in ID tokens and the userinfo response. The ecosystem subject is not the user's global database ID, so unrelated ecosystems do not receive the same subject. The same user has one identity mapping per ecosystem.

This is identity sharing only. Linking an application does not grant access to another application's billing, hosting resources, cloud files, or private profile data. Those capabilities require separate permission design, explicit user consent, resource-level authorization, and revocation endpoints before they should be exposed.

## Deployment

The migration 20261015000000_add_organisations_ecosystems must be applied through the existing MAX Auth migration/deployment process. Do not create a replacement database. After deployment, validate Prisma schema, build, test and exercise the organisation and cross-client OAuth flows in a non-production environment before enabling this for users.
