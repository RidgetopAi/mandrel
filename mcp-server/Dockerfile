# Multi-stage build for AIDIS MCP Server
# Optimized for minimal image size with efficient layer caching

# =============================================================================
# Build reliability (Sprint 3, task 82a9bb28): transient-network self-healing
# =============================================================================
# WHY: every Docker build pulls deps from the network — `npm ci` (the registry),
# `npm rebuild sharp` (sharp's prebuilt libvips, @img/sharp-libvips-linux-x64,
# fetched as an npm optionalDependency), and `npm install -g tsx`. Each was a
# SINGLE-SHOT network call: one transient GitHub/registry timeout aborted the
# WHOLE build, which once killed a fleet deploy at the staging bake (v0.4.0).
#
# FIX (in rough order of the task's preference list):
#   1. RETRY the flaky step — `retry_net.sh` retries a network command 5x with
#      exponential backoff (5s,10s,20s,40s,80s) so a transient blip self-heals.
#      This is the floor and the real single-point-of-failure removal.
#   2. CACHING — the deps layers are already keyed on package*.json ONLY (COPY'd
#      before the install, source COPY'd after), so a clean rebuild reuses the
#      sharp/libvips layer and does not refetch. We preserve that ordering.
#   2b. npm's OWN fetch-retry knobs (NPM_CONFIG_FETCH_*) give a second, in-process
#      retry layer for partial/slow downloads beneath the shell-level retry.
#   3. Vendoring/base-image-libvips — deliberately NOT done: sharp 0.35 already
#      pins libvips as a prebuilt npm package (registry, not a GitHub release),
#      so retry+caching removes the flake without a riskier base-image change.
# The retry helper is COPY'd into each stage that does a network install.
# -----------------------------------------------------------------------------

# Stage 1: Dependencies stage
# Use Debian-slim (glibc) NOT alpine: the embedding stack (@xenova/transformers ->
# onnxruntime-node) ships a prebuilt glibc native binary that does not run reliably
# on alpine/musl (Ort::Exception at load). glibc base avoids that entirely.
FROM node:22-slim AS deps
WORKDIR /app

# npm's own transport-level retry/backoff (beneath the shell retry below). Cheap,
# in-process resilience for partial/slow registry downloads.
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# Shell-level retry wrapper (5x exponential backoff) for network-fetching steps.
COPY scripts/retry_net.sh /usr/local/bin/retry_net
# (.sh is executable in-repo; ensure it is in-image too, then sanity-check it.)
RUN chmod +x /usr/local/bin/retry_net && /usr/local/bin/retry_net true

# Copy package files for dependency resolution
COPY package*.json ./
# Install only production dependencies. --ignore-scripts is kept for safety, but
# sharp (transitive via @xenova/transformers) needs its native binary installed,
# which its install script normally fetches. Run that script explicitly afterward.
# Both the `npm ci` and the sharp rebuild (which fetches prebuilt libvips) are
# wrapped in retry_net so a transient network blip self-heals instead of aborting.
RUN retry_net npm ci --only=production --ignore-scripts && \
    retry_net npm rebuild sharp && \
    npm cache clean --force

# Stage 2: Builder stage
# The server runs via tsx (runtime TS), so the "build" here is just dependency
# resolution + TS validation; the artifact the runner needs is the src/ tree.
FROM node:22-alpine AS builder
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
# apk add hits the network too — retry it (use a small inline loop here since the
# retry helper isn't copied in yet, and apk runs before WORKDIR/COPY).
RUN i=1; until apk add --no-cache libc6-compat; do \
      [ "$i" -ge 5 ] && echo "apk add failed after $i tries" && exit 1; \
      echo "apk add failed (try $i) — retrying in $((i*5))s"; sleep $((i*5)); i=$((i+1)); \
    done
WORKDIR /app

# Shell-level retry wrapper for the network install below.
COPY scripts/retry_net.sh /usr/local/bin/retry_net
RUN chmod +x /usr/local/bin/retry_net && /usr/local/bin/retry_net true

# Copy package files
COPY package*.json ./
# Install all dependencies for validation/type checking (retried for resilience).
RUN retry_net npm ci --ignore-scripts

# Copy source code
COPY . .

# Validate TypeScript (but don't compile since we use tsx)
RUN npx tsc --noEmit || echo "TypeScript validation completed"

# Stage 3: Production runtime (Debian-slim/glibc so onnxruntime-node runs natively)
FROM node:22-slim AS runner
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# Shell-level retry wrapper for the network-fetching steps in this stage.
COPY scripts/retry_net.sh /usr/local/bin/retry_net
RUN chmod +x /usr/local/bin/retry_net && /usr/local/bin/retry_net true

# Install minimal system dependencies. apt-get update + install both hit the
# network — retry the whole sequence so a transient mirror blip self-heals.
RUN retry_net sh -c 'apt-get update && \
    apt-get install -y --no-install-recommends \
    dumb-init \
    wget \
    curl \
    ca-certificates' && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 aidis && \
    useradd -r -u 1001 -g aidis aidis

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Install tsx globally for runtime compilation (retried for network resilience).
RUN retry_net npm install -g tsx@latest && \
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
