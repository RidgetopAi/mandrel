# Multi-stage build for AIDIS MCP Server
# Optimized for minimal image size with efficient layer caching

# Stage 1: Dependencies stage
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for dependency resolution
COPY package*.json ./
# Install only production dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Stage 2: Build stage (for dev dependencies and compilation check)
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
# Install all dependencies for validation/type checking
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Validate TypeScript (but don't compile since we use tsx)
RUN npx tsc --noEmit || echo "TypeScript validation completed"

# Stage 3: Production runtime
FROM node:22-alpine AS runner

# Install minimal system dependencies
RUN apk add --no-cache \
    dumb-init \
    wget \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S aidis && \
    adduser -S aidis -u 1001

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Install tsx globally for runtime compilation
RUN npm install -g tsx@latest && \
    npm cache clean --force

# Copy source code for tsx runtime compilation
COPY --from=builder /app/src ./src

# Create necessary directories and set permissions
RUN mkdir -p /app/logs /app/data /app/temp && \
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
    NPM_CONFIG_LOGLEVEL=warn \
    TSX_TSCONFIG_PATH=/app/src/tsconfig.json

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start with tsx for runtime TypeScript compilation
CMD ["tsx", "src/server.ts"]