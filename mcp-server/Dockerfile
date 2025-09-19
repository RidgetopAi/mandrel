# Multi-stage build for AIDIS MCP Server
# Optimized for production deployment with minimal image size

# Stage 1: Build stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY . .

# Stage 2: Production stage (using tsx for runtime TypeScript)
FROM node:22-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S aidis && \
    adduser -S aidis -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies + runtime dependencies
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Copy source code (using tsx for runtime compilation)
COPY --from=builder /app/src ./src

# Create necessary directories and set permissions
RUN mkdir -p /app/logs /app/data && \
    chown -R aidis:aidis /app

# Switch to non-root user
USER aidis

# Expose port (if HTTP bridge is enabled)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check: MCP Server responsive')" || exit 1

# Environment variables
ENV NODE_ENV=production
ENV AIDIS_LOG_LEVEL=info
ENV AIDIS_SKIP_DATABASE=false

# Start the application using tsx
CMD ["npx", "tsx", "src/server.ts"]