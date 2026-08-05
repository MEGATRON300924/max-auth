# MAX Auth — Security Documentation

## Password storage

Passwords are hashed with **Argon2id** (via the `argon2` library), the winner of the
Password Hashing Competition and OWASP's current recommendation. Tunable via
`ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM` in `.env` — defaults are
conservative for a general-purpose server; raise `MEMORY_COST` if your host has RAM to
spare, since memory-hardness is Argon2's main defense against GPU cracking.

Plaintext passwords are never logged, and password strength is enforced both by Zod
(`≥8 chars`, letter + number) and again server-side as defense in depth. The last 5
password hashes per user are retained (`password_history`) to block immediate reuse.

## Tokens

- **Access tokens** (JWT, `JWT_ACCESS_SECRET`, 15 min default) — stateless, verified by
  signature only, never touch the database on the hot path.
- **Refresh tokens** (JWT, `JWT_REFRESH_SECRET` — a *different* secret from access
  tokens, 30 day default) — stored **only as a SHA-256 hash** in the `sessions` table,
  set as an `httpOnly`, `Secure` (in production), `SameSite=Strict` cookie scoped to
  `/api/v1/auth`.
- **Rotation**: every `/auth/refresh` call revokes the current session row and issues a
  brand new access+refresh pair tied to a new session row. A replayed old refresh token
  fails immediately because its session is already `isRevoked = true`.
- **Email verification / password reset tokens** — high-entropy random values
  (32 bytes via `crypto.randomBytes`), stored only as a SHA-256 hash, single-use
  (`usedAt` set on consumption), time-limited (`EMAIL_VERIFICATION_TOKEN_TTL_HOURS`,
  `PASSWORD_RESET_TOKEN_TTL_MINUTES`).

## Transport & headers

- **Helmet** sets standard hardening headers (`X-Content-Type-Options`,
  `X-Frame-Options`, `Strict-Transport-Security` in production, etc.).
- **CORS** is allow-listed via `CORS_ALLOWED_ORIGINS` — no wildcard `*` in production.
- **Compression** and a **1MB JSON body limit** to reduce trivial DoS surface.

## CSRF

Cookie-based endpoints (`/auth/refresh`, `/auth/logout`) are protected by the
double-submit cookie pattern (`csrf-csrf` library): the client fetches a token from
`GET /security/csrf-token` and must echo it back in the `x-csrf-token` header. Bearer
token requests (the vast majority of the API) are not vulnerable to CSRF since browsers
do not auto-attach `Authorization` headers cross-site, so CSRF protection is scoped
specifically to the cookie-reliant routes.

## Rate limiting & brute-force protection

- Global limiter: `RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_MINUTES` per IP.
- Login: separately and more strictly limited (`LOGIN_RATE_LIMIT_MAX`), with
  `skipSuccessfulRequests` so legitimate users aren't punished — only repeated failures
  count against the limit.
- Sensitive actions (forgot-password, resend-verification): 5/hour.
- Registration: 20/hour per IP to slow bulk account creation.
- **Production note**: the default store is in-memory per process. For a multi-instance
  deployment, point `express-rate-limit` at Redis via the already-included
  `rate-limit-redis` package so limits are enforced across all instances, not per-pod.

## User enumeration resistance

- `forgot-password` always returns the same generic success message whether or not the
  email exists.
- `login` performs a dummy Argon2 verify even when the identifier doesn't match any
  user, to avoid a timing signal that would reveal account existence.

## Input validation & injection protection

- **Zod** schemas validate and coerce every request body/query/param before it reaches
  a controller — malformed input never reaches business logic.
- **SQL injection**: Prisma uses parameterized queries exclusively; there is no raw SQL
  string concatenation anywhere in the codebase (the one `$queryRaw` call, in the health
  check, is a static literal `SELECT 1` with no interpolation).
- **XSS**: this is an API-only backend (no server-rendered HTML), so reflected/stored
  XSS in this service specifically is not applicable — but `helmet`'s CSP is enabled in
  production as defense in depth for any documentation pages served from `/docs`.

## Audit trail

Every security-relevant action — registration, login (success and failure), logout,
token refresh, password change/reset, email verification, account deletion, device
trust/revoke, session revoke, OAuth client/consent changes, admin actions — is recorded
in `audit_logs` with actor, IP, user agent, and a JSON metadata blob. `login_history`
additionally tracks every login attempt with pass/fail + reason for brute-force
forensics.

## Sessions & device management

Users can view all active sessions and known devices, individually revoke any of them,
or nuke all sessions at once ("log out everywhere" — automatically triggered on password
reset). Devices are fingerprinted (hashed from userId + user agent + optional client
hint) so returning devices are recognized without client-side storage of a device ID.

## Architecture-ready, not yet wired up

These have full database support so they can be shipped without a schema migration,
but the runtime logic is intentionally not implemented in this build:

- **2FA** (`two_factor_auth` table) — TOTP/SMS code generation & verification
- **Passkeys / WebAuthn** (`passkeys` table) — registration & assertion ceremonies
- **Recovery codes** (`recovery_codes` table) — generation & one-time consumption
- **Third-party OAuth handshakes** (`connected_accounts` table) — Google/X/Instagram/
  Snapchat/Spotify/Discord/GitHub token exchange
- **"Continue with MAX AI" grant flow** — `/oauth/authorize` and `/oauth/token` return
  `501 Not Implemented`; client registration and consent management are live

## Secrets management

`.env` is git-ignored. `.env.example` documents every variable with no real secrets.
Generate strong values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `CSRF_SECRET`
with `openssl rand -base64 64` — never reuse the same secret across access/refresh
tokens. In production (Render, VPS, etc.), set these as environment variables in the
hosting platform, never committed to source control.
