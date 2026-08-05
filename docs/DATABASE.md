# MAX Auth — Database Documentation

Database: **PostgreSQL**, managed via **Prisma ORM**. Source of truth: `prisma/schema.prisma`.

## Core tables

### `users`
The MAX Account itself. One row per person, shared across every MAX product.

| Field | Notes |
|---|---|
| `id` | UUID primary key |
| `username` | unique, 3–32 chars |
| `email` | unique, lowercased before storage |
| `passwordHash` | Argon2id hash — never the plaintext, never reversible |
| `subscriptionTier` | FREE / PLUS / PRO / BUSINESS / ENTERPRISE |
| `verificationStatus` | UNVERIFIED / PENDING / VERIFIED |
| `status` | ACTIVE / SUSPENDED / BANNED / DELETED / DEACTIVATED |
| `isAdmin` | gates `/admin/*` routes |

Deletion is a **soft delete** (`status = DELETED`, `deletedAt` set) — rows are never
hard-deleted so audit trails and referential integrity stay intact.

### `sessions` + `devices`
A `session` is one refresh-token lifetime tied optionally to a `device`. Only the
**hash** of the refresh token is stored (`refreshTokenHash`), never the raw token.
Revoking a session (logout, password reset, "log out everywhere") sets
`isRevoked = true` — the row is kept for audit purposes rather than deleted.

`devices` are fingerprinted from `userId + userAgent + client hint` so returning
devices are recognized without needing a device ID from the client.

### `login_history` vs `audit_logs`
- `login_history` — specifically login attempts (success/fail + reason), one row per attempt.
- `audit_logs` — every security-relevant action across the account (password changes,
  email verification, device trust/revoke, OAuth consent changes, admin actions, etc.),
  tagged with an `AuditAction` enum and free-form `metadata` JSON.

### `password_history`
Stores the last N password hashes (service enforces last 5) so users cannot immediately
reuse a recently-retired password.

### `verification_tokens`
Single table for both email-verification and password-reset tokens, disambiguated by
`purpose`. Only the SHA-256 hash of the opaque token is stored; the raw token is only
ever in the emailed link, never persisted.

### 2FA / Passkeys / Recovery — architecture only
`two_factor_auth`, `recovery_codes`, and `passkeys` tables exist with the fields needed
for TOTP/SMS 2FA, WebAuthn passkeys, and one-time recovery codes respectively. **No
verification logic is implemented yet** — these are ready for a future milestone.

### `connected_accounts` — architecture only
One row per linked third-party account (Google, X, Instagram, Snapchat, Spotify,
Discord, GitHub), storing encrypted tokens and scope. **No OAuth handshake logic is
implemented** — only CRUD to store/list/unlink accounts once tokens are obtained
through a future integration layer.

### `ai_profiles`
Per-user personalization data for MAX AI: `interests`, `preferences`, `languages`,
`connectedServices` (all JSON), plus a reserved `memoryMetadata` JSON column for a
future AI memory engine (not built yet — explicitly out of scope per spec).

### OAuth tables (`oauth_clients`, `oauth_authorization_codes`, `oauth_access_tokens`,
`oauth_refresh_tokens`, `oauth_consents`)
Full OAuth 2.0 + PKCE-ready data model for "Continue with MAX AI." Client registration
and consent-listing APIs are live; the interactive `/authorize` + `/token` grant flows
are intentionally stubbed (`501 Not Implemented`) until third-party integration begins.

## Indexes

Indexes are defined directly in `schema.prisma` (`@@index`, `@unique`) on every field
used in a `WHERE`, `ORDER BY`, or join in the current query set: `email`, `username`,
`status`, `sessions.userId/deviceId/expiresAt`, `auditLogs.userId/action/createdAt`,
`connectedAccounts.userId` + unique `(provider, providerAccountId)`, and all OAuth
tables' `clientId`/`userId`.

## Migrations

```bash
npx prisma migrate dev --name <description>     # local dev, creates + applies a migration
npx prisma migrate deploy                        # production, applies pending migrations only
npx prisma studio                                 # visual DB browser
npx prisma generate                               # regenerate the Prisma Client after schema changes
```

Never edit a migration file after it's been applied to any shared environment — create
a new migration instead.

## Data retention notes

- `sessions` and `login_history`/`audit_logs` will grow indefinitely in an active system.
  Plan a periodic job to purge/archive expired sessions and old audit rows once volume
  is significant (see `docs/ARCHITECTURE.md` → Scaling).
- Soft-deleted users (`status = DELETED`) retain their row; if you need GDPR-style hard
  erasure later, add a scheduled job that scrubs PII fields (email, displayName, avatarUrl)
  on accounts deleted more than N days ago, while keeping the UUID for referential
  integrity in audit logs.
