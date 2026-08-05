# MAX Auth — Architecture

## Overview

MAX Auth is a standalone Node.js/TypeScript/Express service that owns identity for
the entire MAX ecosystem. Every MAX product (MAX AI, MAX Home, MAX Music, MAX Cloud,
MAX Browser, MAX OS, MAX Pay, MAX Security, MAX Studio) authenticates users against
this single service — one account, one identity, everywhere.

```
                     ┌─────────────────────┐
                     │   MAX AI (app)      │
                     ├─────────────────────┤
                     │   MAX Home           │
                     ├─────────────────────┤
                     │   MAX Music           │──────┐
                     ├─────────────────────┤      │
                     │   MAX Cloud, etc.     │      ▼
                     └─────────────────────┘  ┌───────────────┐
                                                │   MAX Auth    │
                     ┌─────────────────────┐  │  (this repo)  │
                     │ 3rd-party companies   │──┤               │
                     │ "Continue with MAX AI"│  └───────┬───────┘
                     └─────────────────────┘            │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │   PostgreSQL     │
                                                 └─────────────────┘
```

## Layered architecture

Requests flow through clearly separated layers, each with a single responsibility:

1. **Routes** (`src/routes`) — define URL paths, attach middleware (auth, validation, rate
   limiting), and delegate to controllers. No business logic lives here.
2. **Middleware** (`src/middleware`) — cross-cutting concerns: JWT verification, Zod
   validation, rate limiting, CSRF, error handling, request tracing.
3. **Controllers** (`src/controllers`) — translate HTTP requests into service calls and
   shape HTTP responses. No direct database access.
4. **Services** (`src/services`) — all business logic: password policy, token issuance,
   session lifecycle, audit logging, email dispatch. Framework-agnostic.
5. **Repositories** (`src/repositories`) — the only layer that talks to Prisma directly for
   the most frequently used models (User, Session, Device). Simpler models are queried
   straight from services via the Prisma client, which is still fine because Prisma itself
   is the abstraction over SQL — repositories exist to centralize the *hot-path* queries.
6. **Database** (`prisma/schema.prisma`, `src/database/prisma.ts`) — PostgreSQL via Prisma.

This separation means: swapping Express for Fastify only touches routes/controllers;
swapping Postgres for another SQL database only touches the Prisma schema/repositories;
business rules (password reuse policy, token rotation, etc.) never depend on HTTP or SQL
specifics.

## Authentication model

- **Access tokens**: short-lived (15 min default) JWTs signed with `JWT_ACCESS_SECRET`,
  sent as `Authorization: Bearer <token>`. Stateless — verified without a DB hit.
- **Refresh tokens**: longer-lived (30 days default) JWTs signed with a *different* secret
  (`JWT_REFRESH_SECRET`), stored as an httpOnly cookie, AND persisted server-side (hashed)
  in the `sessions` table. This hybrid (JWT + DB row) approach gives us the performance of
  stateless access tokens plus the revocability of server-side sessions.
- **Rotation**: every refresh call revokes the old session and issues a brand-new pair.
  If a stolen refresh token is replayed after the legitimate user has already rotated it,
  the old session is already revoked and the attacker is locked out.
- **CSRF**: because refresh/logout rely on cookies, those two routes are protected by a
  double-submit CSRF token (`GET /api/v1/security/csrf-token` → `x-csrf-token` header).
  Bearer-token routes don't need this since browsers won't auto-attach custom headers
  cross-site.

## Scaling to millions of users

- **Stateless access tokens** mean the vast majority of authenticated requests
  (every API call to every MAX product) need zero database round-trips for auth —
  just JWT signature verification in memory.
- **Prisma + PostgreSQL** with proper indexes (see `docs/DATABASE.md`) on `email`,
  `username`, `sessions.expiresAt`, `auditLogs.createdAt`, etc.
- **Horizontal scaling**: the service is fully stateless (no in-memory session store),
  so you can run N instances behind a load balancer. The one caveat is the default
  `express-rate-limit` store is in-memory per-instance — for multi-instance production
  deployments, swap in `rate-limit-redis` (dependency already included) pointed at a
  shared Redis instance so rate limits are enforced cluster-wide.
- **Database read scaling**: PostgreSQL read replicas can be added later; Prisma supports
  routing reads/writes via separate connection strings without touching business logic.
- **Session table growth**: expired/revoked sessions should be purged periodically
  (a simple cron job or `pg_cron` job deleting `sessions WHERE expiresAt < now()`).
- **Audit log growth**: `audit_logs` and `login_history` grow indefinitely; plan for
  partitioning by `createdAt` (native PostgreSQL declarative partitioning) once volume
  is high, or archive to cold storage after N months.

## The "Continue with MAX AI" vision

MAX Auth is designed so that, in the future, third-party companies can add a
"Continue with MAX AI" button the same way apps offer "Continue with Google."
The OAuth 2.0 data model (`oauth_clients`, `oauth_authorization_codes`,
`oauth_access_tokens`, `oauth_refresh_tokens`, `oauth_consents`) and client
management APIs already exist. What's deliberately not built yet is the actual
`/authorize` consent screen flow and `/token` grant exchange — those are the next
milestone once MAX AI has enough of an external developer audience to justify it.

## Deployment topologies

- **Vercel**: works for the API layer via serverless functions, though a long-running
  Express server is often a better fit on Vercel via their Node.js server runtime, or
  simply proxied. See `docs/DEPLOYMENT.md`.
- **VPS**: run via `docker compose up -d` or PM2 + `npm run build && npm start`.
- **Docker**: multi-stage `Dockerfile` produces a small Alpine-based production image
  running as a non-root user.
