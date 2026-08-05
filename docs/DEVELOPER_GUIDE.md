# MAX Auth — Developer Guide

Written plainly for working day-to-day on this codebase without needing to be a
backend specialist.

## Running it locally

```bash
cd backend
cp .env.example .env
# Open .env and fill in: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CSRF_SECRET
# Generate secrets quickly with: openssl rand -base64 64

npm install
npx prisma migrate dev --name init   # creates the database tables
npm run dev                           # starts the server with auto-reload
```

Open `http://localhost:4000/docs` to see and test every endpoint interactively.

## Adding a new field to the User table

1. Open `prisma/schema.prisma`, add the field to the `User` model.
2. Run `npx prisma migrate dev --name add_my_field`.
3. If it should be returned/updated via the API, add it to the relevant Zod schema in
   `src/validators/` and to `updateProfile` in `src/services/user.service.ts` if needed.

## Adding a brand-new endpoint

1. **Validator** (if it takes input): add a Zod schema in `src/validators/`.
2. **Service**: add the actual logic in the relevant `src/services/*.service.ts` file
   (or create a new one if it's a new domain).
3. **Controller**: add a thin handler in `src/controllers/*.controller.ts` that calls the
   service and returns `ok(res, data)`.
4. **Route**: wire it up in `src/routes/*.routes.ts` with the right middleware
   (`authenticate` if it needs login, `validate(schema)` if it takes input).
5. It's automatically documented in Swagger via the `@openapi` JSDoc comment above the
   route — copy the pattern from an existing route.

## Where things live

| I want to... | Go to... |
|---|---|
| Change password rules | `src/validators/auth.validators.ts` + `src/security/password.ts` |
| Change token expiry | `.env` → `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` |
| Add a new audit event | `AuditAction` enum in `prisma/schema.prisma`, then call `auditService.record(...)` |
| Change rate limits | `src/middleware/rateLimiter.ts` |
| Hook up a real email provider | `src/services/mail.service.ts` — replace the console branch |
| Add a new OAuth scope | `src/services/oauth.service.ts` when creating a client |

## Running tests

```bash
npm test
```

Tests currently cover password hashing and JWT signing/verification (pure logic, no
DB needed). To test database-backed flows (register/login end-to-end), point
`DATABASE_URL` at a disposable test database and add `supertest`-based route tests
under `tests/` — `supertest` is already a dev dependency.

## Common gotchas

- **"Missing required environment variable"** on startup — you forgot to fill in
  `.env`. Copy from `.env.example` and set every value marked required.
- **Prisma Client out of date** after editing `schema.prisma` — run
  `npx prisma generate` (this also runs automatically as part of `migrate dev`).
- **CORS errors from your frontend** — add your frontend's origin to
  `CORS_ALLOWED_ORIGINS` in `.env` (comma-separated, no trailing slash).
- **401 on `/auth/refresh` or `/auth/logout`** — these need the CSRF header. Call
  `GET /security/csrf-token` first, then send its value back as `x-csrf-token`.
- **`prisma migrate dev` refuses to run in production** — that's intentional; use
  `npx prisma migrate deploy` in production/CI, which only applies existing migrations
  and never prompts interactively.

## Code style

- TypeScript strict mode is on — the compiler will catch most `undefined`/`null`
  mistakes at build time. Trust the red squiggles.
- Services never touch `req`/`res` — they take plain arguments and return plain data,
  which keeps them testable and reusable from anywhere (a future CLI, a cron job, etc.).
- Never `console.log` — use `logger` from `src/utils/logger.ts` so everything ends up
  in the rotating log files with proper levels.
