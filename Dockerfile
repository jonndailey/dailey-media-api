# Dailey Media API Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build || echo "No build script defined"

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S dailey -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=dailey:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dailey:nodejs /app/src ./src
COPY --from=builder --chown=dailey:nodejs /app/package*.json ./
COPY --from=builder --chown=dailey:nodejs /app/ecosystem.config.cjs ./

# Copy web assets if they exist
COPY --from=builder --chown=dailey:nodejs /app/web/dist ./web/dist 2>/dev/null || true

# Create storage directory
RUN mkdir -p /app/storage/files && \
    mkdir -p /app/logs && \
    chown -R dailey:nodejs /app/storage && \
    chown -R dailey:nodejs /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 4000

# Switch to non-root user
USER dailey

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/index.js"]