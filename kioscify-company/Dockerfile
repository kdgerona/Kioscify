# ================================
# kioscify-company — Production Dockerfile
# ================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# Stage 2: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PLATFORM_DOMAIN
ARG NEXT_PUBLIC_STORE_PORTAL_BASE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_PLATFORM_DOMAIN=${NEXT_PUBLIC_PLATFORM_DOMAIN}
ENV NEXT_PUBLIC_STORE_PORTAL_BASE_URL=${NEXT_PUBLIC_STORE_PORTAL_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN yarn build

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache dumb-init

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001 || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
