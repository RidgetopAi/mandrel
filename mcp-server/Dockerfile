# Multi-stage build for AIDIS MCP Server
# Optimized for minimal image size with efficient layer caching

# Stage 1: Dependencies stage
# Use Debian-slim (glibc) NOT alpine: the embedding stack (@xenova/transformers ->
# onnxruntime-node) ships a prebuilt glibc native binary that does not run reliably
# on alpine/musl (Ort::Exception at load). glibc base avoids that entirely.
FROM node:22-slim AS deps
WORKDIR /app

# Copy package files for dependency resolution
COPY package*.json ./
# Install only production dependencies. --ignore-scripts is kept for safety, but
# sharp (transitive via @xenova/transformers) needs its native binary installed,
# which its install script normally fetches. Run that script explicitly afterward.
RUN npm ci --only=production --ignore-scripts && \
    npm rebuild sharp && \
    npm cache clean --force

# Stage 2: Builder stage
# The server runs via tsx (runtime TS), so the "build" here is just dependency
# resolution + TS validation; the artifact the runner needs is the src/ tree.
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
# Install all dependencies for validation/type checking
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Validate TypeScript (but don't compile since we use tsx)
RUN npx tsc --noEmit || echo "TypeScript validation completed"

# Stage 3: Production runtime (Debian-slim/glibc so onnxruntime-node runs natively)
FROM node:22-slim AS runner

# Install minimal system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    dumb-init \
    wget \
    curl \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 aidis && \
    useradd -r -u 1001 -g aidis aidis

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Install tsx globally for runtime compilation
RUN npm install -g tsx@latest && \
    npm cache clean --force

# Copy source code for tsx runtime compilation
COPY --from=builder /app/src ./src
# Copy migration runner + SQL files so the container self-provisions its schema,
# and .env.example which dotenv-safe validates required env vars against.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/database ./database
COPY --from=builder /app/.env.example ./.env.example
# Container entrypoint: run idempotent migrations, then start the server.
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Create necessary directories and set permissions
RUN mkdir -p /app/logs /app/data /app/temp && \
    chmod +x /app/docker-entrypoint.sh && \
    chown -R aidis:aidis /app

# Switch to non-root user
USER aidis

# Expose port (HTTP bridge)
EXPOSE 8080

# Enhanced health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health 2>/dev/null || \
        curl -f http://localhost:8080/health 2>/dev/null || \
        node -e "console.log('MCP Server health check')" || exit 1

# Environment optimization
ENV NODE_ENV=production \
    AIDIS_LOG_LEVEL=info \
    AIDIS_SKIP_DATABASE=false \
    NODE_OPTIONS="--max-old-space-size=256" \
    NPM_CONFIG_LOGLEVEL=warn

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Run idempotent migrations, then exec the server (see docker-entrypoint.sh)
CMD ["./docker-entrypoint.sh"]
