# =========================================
# MAX Auth - Production Dockerfile
# Multi-stage build for a small, secure runtime image
# =========================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

# Prisma's query engine needs openssl on Alpine (musl) images.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# ---- Stage 2: Production runtime ----
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup -S maxauth && adduser -S maxauth -G maxauth

# The prisma schema must be present BEFORE `npm ci`, because @prisma/client's
# postinstall hook regenerates the client against prisma/schema.prisma.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# Re-sync the fully generated client (with engine binaries) built in the
# builder stage, overwriting whatever the runner's own postinstall produced.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p logs && chown -R maxauth:maxauth /app

USER maxauth

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/v1/health/live', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
