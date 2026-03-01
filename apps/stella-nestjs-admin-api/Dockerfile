# ==============================================================
# Stella NestJS Admin API — Multi-stage Docker build
# ==============================================================

# ── Stage 1: Builder ──────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy dependency files first for layer caching
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ src/

RUN pnpm build

# ── Stage 2: Production dependencies ─────────────────────────
FROM node:20-slim AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

# ── Stage 3: Runner ──────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

RUN chown node /app

# Copy production deps and built output
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Docker health check
HEALTHCHECK --interval=5s --timeout=5s --retries=10 --start-period=10s \
  CMD node -e "fetch('http://0.0.0.0:3001/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
