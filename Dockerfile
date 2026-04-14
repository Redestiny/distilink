# Builder stage
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage - minimal image
FROM node:24-bookworm-slim AS runner

WORKDIR /app

# Install runtime helpers
RUN apt-get update && \
    apt-get install -y --no-install-recommends dumb-init gosu wget && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Create non-root user
RUN groupadd --system --gid 1001 nextjs && \
    useradd --system --uid 1001 --gid nextjs --create-home nextjs

# Copy only built artifacts
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nextjs /app/scripts ./scripts
COPY --chown=nextjs:nextjs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
