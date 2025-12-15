# ================================
# Kioskly API - Production Dockerfile
# ================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY package.json yarn.lock* ./
COPY prisma ./prisma/

# Install dependencies
RUN yarn install --frozen-lockfile || yarn install

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL for Prisma and dumb-init for proper signal handling
RUN apk add --no-cache openssl dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package.json yarn.lock* ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production || yarn install --production

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application
COPY --from=builder /app/dist ./dist

# Create uploads directory structure with proper permissions
RUN mkdir -p uploads/logos uploads/products uploads/categories && \
    chown -R nestjs:nodejs uploads && \
    chmod -R 755 uploads

# Set ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/src/main"]

