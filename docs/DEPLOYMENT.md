# MAX Auth — Deployment Guide

## 1. Prepare a PostgreSQL database

Any managed Postgres works: Render, Supabase's raw Postgres (not their auth), Railway,
Neon, or your own VPS-hosted Postgres. Grab the connection string — it goes into
`DATABASE_URL`.

## 2. Set environment variables

Every variable in `.env.example` must be set in your hosting platform's environment
variable settings (never commit `.env`). At minimum:

```
DATABASE_URL
JWT_ACCESS_SECRET       (openssl rand -base64 64)
JWT_REFRESH_SECRET      (openssl rand -base64 64, DIFFERENT from access secret)
CSRF_SECRET             (openssl rand -base64 32)
FRONTEND_URL
CORS_ALLOWED_ORIGINS
COOKIE_DOMAIN
COOKIE_SECURE=true      (in production, always true)
NODE_ENV=production
```

## 3a. Deploy on a VPS (recommended for a long-running auth service)

```bash
git clone <your repo>
cd backend
cp .env.example .env    # fill in real values
npm ci
npx prisma migrate deploy
npm run build
npm start                # or better: use PM2 for process management
```

With PM2:
```bash
npm install -g pm2
pm2 start dist/server.js --name max-auth
pm2 save
pm2 startup
```

Put Nginx or Caddy in front for TLS termination and to proxy `443 -> 4000`.

## 3b. Deploy with Docker (VPS or any container host)

```bash
cp .env.example .env    # fill in real values
docker compose up -d --build
```

This runs Postgres + the backend together. For production, you'll typically point
`DATABASE_URL` at a managed Postgres instead of the bundled `postgres` service —
just remove the `postgres` service from `docker-compose.yml` and update
`DATABASE_URL` in `.env`.

To build and push the image standalone (e.g. for Render, Fly.io, Railway, ECS):
```bash
docker build -t max-auth-backend .
docker run -p 4000:4000 --env-file .env max-auth-backend
```

Run migrations once before starting the container in production:
```bash
docker run --env-file .env max-auth-backend npx prisma migrate deploy
```

## 3c. Deploy on Vercel

Vercel is primarily built for serverless/edge functions rather than a long-running
Express server. It's workable for MAX Auth but be aware of two things: (1) each
serverless invocation is stateless and cold-starts add latency to sensitive auth
paths, and (2) Prisma needs `binaryTargets` configured for Vercel's runtime.

1. Add to `prisma/schema.prisma`'s `generator client` block:
   ```prisma
   generator client {
     provider      = "prisma-client-js"
     binaryTargets = ["native", "rhel-openssl-3.0.x"]
   }
   ```
2. Add a `vercel.json` that routes all traffic to a serverless entry wrapping `app.ts`
   (Vercel needs a handler export, not `app.listen`) — e.g. an `api/index.ts` that does
   `export default createApp()` and lets Vercel's Node runtime handle the HTTP server.
3. Set all environment variables in the Vercel dashboard (Project → Settings →
   Environment Variables).
4. Because Vercel functions are ephemeral, run `prisma migrate deploy` from your local
   machine or CI against the production `DATABASE_URL` — not from within a serverless
   function.

For most MAX Auth deployments, a VPS or a container platform (Render, Fly.io, Railway)
running the Express server continuously is simpler and gives more predictable latency
for something as latency-sensitive as login/token refresh — Vercel is best treated as
a fallback option, not the primary path.

## 4. Post-deploy checklist

- [ ] `GET /api/v1/health/ready` returns `200`
- [ ] `GET /docs` loads Swagger UI
- [ ] Register + login flow works end-to-end against the real database
- [ ] CORS origin list matches your actual frontend domain(s)
- [ ] `COOKIE_SECURE=true` and you're serving over HTTPS (cookies with `Secure` won't
      be set over plain HTTP)
- [ ] Log rotation directory (`LOG_DIR`) is writable, or mounted as a persistent volume
      if you want logs to survive container restarts
- [ ] A real mail provider is wired into `src/services/mail.service.ts` (default is
      console-only, fine for testing, not for real users)
- [ ] Rate limiting is backed by Redis if running more than one instance
      (`rate-limit-redis`, already a dependency — swap the store in
      `src/middleware/rateLimiter.ts`)
