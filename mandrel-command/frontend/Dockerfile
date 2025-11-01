# Multi-stage build for AIDIS Command Frontend
# Optimized React application with nginx - size and performance optimized

# Stage 1: Dependencies stage
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for dependency resolution
COPY package*.json ./
# Install dependencies with cache optimization
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Stage 2: Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

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

# Create optimized nginx configuration
RUN echo 'server {
    listen 3000;
    server_name localhost;

    # Enable compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Root location with cache headers
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header X-Content-Type-Options "nosniff";
        }

        # No cache for HTML files
        location ~* \.html$ {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }
    }

    # API proxy with optimizations
    location /api {
        proxy_pass http://aidis-command-backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\'' '\''unsafe-inline'\''; style-src '\''self'\'' '\''unsafe-inline'\'';" always;
}' > /etc/nginx/conf.d/default.conf

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf.dpkg-dist

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

# Start nginx with optimized worker processes
CMD ["nginx", "-g", "daemon off; worker_processes auto;"]