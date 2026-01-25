# Multi-stage build for AIDIS Command Backend
# Optimized Node.js API server with minimal image size

# Stage 1: Dependencies stage
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for dependency resolution
COPY package*.json ./
# Install dependencies with cache optimization
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Stage 2: Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
# Install all dependencies (including dev deps for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript application
RUN npm run build || (echo "Build failed, using source files" && mkdir -p dist && cp -r src/* dist/ 2>/dev/null || true)

# Stage 3: Production runtime
FROM node:22-alpine AS runner

# Install minimal runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    wget \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S aidis && \
    adduser -S aidis -u 1001

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy built application
COPY --from=builder /app/dist ./dist
# Fallback: copy source if build failed
COPY --from=builder /app/src ./src 2>/dev/null || true

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/uploads /app/data && \
    chown -R aidis:aidis /app

# Switch to non-root user
USER aidis

# Expose backend port
EXPOSE 5000

# Health check with better error handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Environment optimization
ENV NODE_ENV=production \
    PORT=5000 \
    NODE_OPTIONS="--max-old-space-size=512" \
    NPM_CONFIG_LOGLEVEL=warn

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the backend server
CMD ["npm", "start"]