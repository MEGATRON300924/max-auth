# MAX Auth for Businesses

## Purpose

MAX Auth for Businesses adds an organization identity layer on top of personal MAX accounts. A person signs in with their existing MAX account, creates a business profile, and becomes its owner. The business then has a stable MAX business ID, team membership, roles, invitations, and an audit history.

A business identity is not a second password-based user account. Personal authentication remains handled by MAX Auth. A business membership authorizes the user to act within that business; it does not automatically grant access to every MAX product.

## API

All endpoints are under `/api/v1` and require the existing MAX Auth bearer token/session unless explicitly noted.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/businesses` | Create a business identity and owner membership |
| GET | `/businesses` | List the signed-in user's active business memberships |
| GET | `/businesses/:businessId` | Read a business profile if the user is an active member |
| PATCH | `/businesses/:businessId` | Update profile; owner or administrator only |
| GET | `/businesses/:businessId/members` | List active members; owner or administrator only |
| PATCH | `/businesses/:businessId/members/:userId` | Change a member's role with owner/admin safeguards |
| DELETE | `/businesses/:businessId/members/:userId` | Revoke membership; owner cannot be removed |
| POST | `/businesses/:businessId/invitations` | Email an invitation to join a business |
| GET | `/businesses/:businessId/invitations` | List valid pending invitations; owner/admin only |
| DELETE | `/businesses/:businessId/invitations/:invitationId` | Revoke a pending invitation |
| POST | `/businesses/invitations/accept` | Accept a single-use invitation while signed in |
| GET | `/businesses/:businessId/audit-logs` | Read the latest 50 audit events; owner/admin only |

### Business creation fields

Required: `legalName`, `displayName`, `handle`, `businessType`, two-letter ISO country code, and `businessEmail`.

Optional: `phone`, `website`, `description`.

The server generates a `maxbiz_` business ID. Handles are lowercase and unique. The creating user is added as `OWNER` within the same database transaction as the business record and creation audit event.

### Roles and protections

- `OWNER`: controls the business and may assign administrators.
- `ADMINISTRATOR`: manages ordinary members and invitations, but cannot grant administrator access or remove/change another administrator.
- `MANAGER`, `MEMBER`, `VIEWER`, and `DEVELOPER`: membership roles for product-specific permissions to be enforced by connected MAX services.
- The owner cannot be removed or demoted through the member-role endpoint. An explicit ownership-transfer workflow is required for that.
- API authorization checks membership and role on the server; hiding controls in the browser is not a security boundary.

## Invitation security

- The server generates a cryptographically random 256-bit token.
- Only the SHA-256 hash is stored in the database; the raw token is sent in the email link.
- Invitations expire after seven days, can be revoked, and can only be accepted once.
- The accepting user must be signed in to MAX, use the same email address that received the invite, and have a verified MAX email.
- Acceptance claims the invitation inside a database transaction to prevent concurrent reuse.
- Creation, revocation, acceptance, member-role changes, member removal, and profile changes are recorded in the business audit log.

## Frontend pages

The portal lives in the MAX Auth frontend:

- `/businesses` — overview
- `/businesses/register` — create a business identity
- `/businesses/dashboard` — list your business memberships
- `/businesses/dashboard/:businessId` — business workspace, member roles, invitations, and recent audit history
- `/businesses/accept-invitation?token=...` — accept a team invitation

The frontend API client uses `NEXT_PUBLIC_API_URL` (default `https://auth.max-ai.name.ng/api/v1`).

## Email configuration

Production invitations must not run with `MAIL_PROVIDER=console`. Configure the existing mail integration, for example:

- `MAIL_PROVIDER=resend`
- `RESEND_API_KEY` — secret, server-side only
- `MAIL_FROM` — a verified sender identity
- `FRONTEND_URL` — the MAX Auth frontend origin used to build invitation links

Never expose `RESEND_API_KEY` through a `NEXT_PUBLIC_*` variable or put secrets in source control.

## Database safety and release

The business migration is additive: it creates business enums, tables, indexes, and foreign keys. It does not reset or delete existing MAX Auth users, sessions, or OAuth data.

Before release:
1. Review the migration against the existing Neon schema.
2. Confirm the deployed service's Prisma migration process and backup/recovery plan.
3. Apply the migration through the approved deployment workflow; do not manually reset production.
4. Verify registration, member permissions, email delivery, invitation expiry/revocation/reuse, and audit history against a test business.
5. Keep the feature unavailable to production users until backend migration and frontend deployment are both ready.
