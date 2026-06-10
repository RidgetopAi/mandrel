# Multi-stage build for AIDIS Command Frontend
# Optimized React application with nginx - size and performance optimized

# Stage 1: Dependencies stage
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for dependency resolution (.npmrc sets legacy-peer-deps for CRA5+TS5)
COPY package*.json .npmrc ./
# Install dependencies with cache optimization
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Stage 2: Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json .npmrc ./

# Copy source code
COPY . .

# Build React application with optimizations
ENV GENERATE_SOURCEMAP=false
ENV INLINE_RUNTIME_CHUNK=false
RUN npm run build

# Remove development files and clean build
RUN rm -rf node_modules && \
    rm -rf src && \
    find build -name "*.map" -delete && \
    find build -name "*.txt" ! -name "robots.txt" -delete

# Stage 3: Nginx production runtime
FROM nginx:1.25-alpine AS production

# Install minimal runtime dependencies
RUN apk add --no-cache \
    wget \
    && rm -rf /var/cache/apk/*

# Copy built React app to nginx html directory
COPY --from=builder /app/build /usr/share/nginx/html

# Install the nginx site config from a real file (listen 3000, SPA fallback, gzip)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user and adjust permissions
RUN addgroup -g 1001 -S aidis && \
    adduser -S aidis -u 1001 && \
    chown -R aidis:aidis /usr/share/nginx/html && \
    chown -R aidis:aidis /var/cache/nginx && \
    chown -R aidis:aidis /var/log/nginx && \
    chown -R aidis:aidis /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R aidis:aidis /var/run/nginx.pid

# Switch to non-root user
USER aidis

# Expose frontend port
EXPOSE 3000

# Optimized health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Start nginx in the foreground. (Do NOT set worker_processes here: the base
# nginx.conf already defines it, and a duplicate via -g is a fatal config error.)
CMD ["nginx", "-g", "daemon off;"]