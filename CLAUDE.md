# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kioskly is a multi-tenant POS (Point of Sale) system for beverage businesses. Built as a monorepo using Turborepo with three packages:
- **kioskly-api**: NestJS backend with Prisma ORM and MongoDB
- **kioskly-admin**: Next.js 15 admin dashboard (web)
- **kioskly-app**: React Native/Expo mobile POS app (not in npm workspaces — managed separately)

## Development Commands

### Root Level (Turborepo)
```bash
npm run dev              # Run API + admin in parallel
npm run build            # Build all packages with caching
npm run test             # Run tests across all packages
npm run lint             # Lint all packages
npm run clean            # Clean all build artifacts and node_modules

npm run api:dev          # API only (watch mode, port 3000)
npm run admin:dev        # Admin dashboard only (Next.js dev)
npm run app:dev          # Mobile app only (Expo, not in workspace — runs via cd)
```

### API (kioskly-api)
```bash
npm run start:dev        # Start with watch mode
npm run prisma:generate  # Regenerate Prisma Client after schema changes
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio GUI
npm run prisma:seed      # Seed initial data (requires tenant to exist first)
npm run test             # Unit tests
npm run test:e2e         # E2E tests
```

### Mobile App (kioskly-app — run from that directory)
```bash
npm start                # Expo dev server
npm run android          # Android emulator/device
npm run ios              # iOS simulator/device
```

## Database

### MongoDB Setup
- Requires replica set (for Prisma transactions) — configured via `docker/docker-compose.yml`
- Replica set name: `rs0`, default credentials: `admin:admin123`

```bash
docker-compose up -d    # Start MongoDB
```

Connection string: `mongodb://admin:admin123@localhost:27017/kioskly?authSource=admin&replicaSet=rs0`

### Schema Models (Multi-Tenant)
All models include `tenantId` for isolation. Key models:

| Model | Purpose |
|---|---|
| Tenant | Business config, branding, themeColors |
| User | ADMIN / CASHIER roles, scoped per tenant |
| Category, Product, Size, Addon | Menu/product catalog |
| Transaction, TransactionItem | Sales records with void workflow |
| Expense | Business expenses with void workflow |
| InventoryItem, InventoryRecord | Inventory tracking |
| SubmittedReport | Daily snapshot report (sales + expenses) |
| SubmittedInventoryReport | Daily inventory snapshot |

**Void workflow**: Transactions and Expenses have `voidStatus` (NONE → PENDING → APPROVED/REJECTED) managed by separate requester/reviewer user references.

Constraints: username/email unique per tenant (not globally); users with transactions cannot be deleted (Restrict); all other data cascades on tenant deletion.

## Backend (kioskly-api)

### API Prefix & Docs
- All routes prefixed with `/api/v1` (configurable via `API_PREFIX` env var)
- `GET /health` is excluded from prefix (for load balancers)
- Swagger UI: `http://localhost:3000/api/v1/docs`

### Module Structure
```
src/
├── auth/                         # JWT login, register, profile
├── tenants/                      # Tenant CRUD + logo upload (ADMIN only)
├── categories/                   # Category management
├── products/                     # Product management
├── sizes/                        # Size options
├── addons/                       # Add-ons/extras
├── transactions/                 # Sales records + void workflow
├── expenses/                     # Expense tracking + void workflow
├── inventory/                    # Inventory items and records
├── reports/                      # Aggregated reporting
├── submitted-reports/            # Snapshot daily reports
├── submitted-inventory-reports/  # Snapshot inventory reports
├── common/
│   ├── decorators/               # @Roles(), @TenantId()
│   └── guards/                   # JwtAuthGuard, RolesGuard
└── prisma/                       # PrismaService
```

### Auth Patterns
- JWT tokens (7-day default). Use `@UseGuards(JwtAuthGuard, RolesGuard)` at controller level.
- `@Roles('ADMIN')` for admin-only endpoints.
- `@TenantId()` param decorator extracts `tenantId` from JWT payload.
- Login requires `tenantId` in the request body alongside credentials.

### File Uploads
- Logos: `uploads/logos/` directory, served at `/uploads/logos/:filename`
- Ensure `mkdir -p kioskly-api/uploads/logos` before first run.

## Admin Dashboard (kioskly-admin)

Next.js 15 App Router web app for tenant administrators.

### Routes (`app/(main)/`)
`dashboard`, `products`, `categories`, `sizes`, `addons`, `transactions`, `expenses`, `inventory`, `inventory-alerts`, `inventory-progression`, `inventory-reports`, `submitted-reports`, `reports`, `settings`

Entry flow: `tenant-setup` → `login` → `(main)` layout with sidebar

### Key Patterns
- API client: `lib/api.ts` — Axios instance that reads `auth_token` from `localStorage` on each request
- TenantContext (`contexts/TenantContext.tsx`): same slug-based pattern as mobile app, persists to `localStorage`
- UI components: Radix UI primitives + Tailwind CSS + `tailwind-merge`/`clsx`

### Environment Variable
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

## Frontend (kioskly-app)

### Technology Stack
- React Native 0.81.5 with React 19, Expo SDK 54 (New Architecture enabled)
- Expo Router (file-based routing), NativeWind v4 (Tailwind for React Native)
- AsyncStorage for tenant persistence

### App Flow
1. `app/tenant-setup.tsx` — enter store slug
2. `app/index.tsx` — login with tenant branding
3. `app/home.tsx` — POS product browsing, ordering, checkout

### Styling
Use `className` (NativeWind) not `style` prop. Import `global.css` at top of each screen. Theme colors (primary, secondary, accent) come from `useTenant()` and are applied via tenant context.

## Environment Variables

### API (.env in kioskly-api/)
```env
DATABASE_URL="mongodb://admin:admin123@localhost:27017/kioskly?authSource=admin&replicaSet=rs0"
JWT_SECRET="change-this-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
UPLOAD_PATH=./uploads
API_PREFIX=api/v1
```

### Admin (.env.local in kioskly-admin/)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### Mobile App
API URL is hardcoded in contexts — configure for production.

## Turborepo

`kioskly-app` is **not** in npm workspaces (`package.json` workspaces only lists `kioskly-api` and `kioskly-admin`). To install dependencies for the mobile app, `cd kioskly-app && npm install` directly.

```bash
# Install dependency in a workspace
npm install <package> --workspace=kioskly-api
npm install <package> --workspace=kioskly-admin

# Force bypass Turborepo cache
npm run build -- --force
```

## Common Issues

**MongoDB replica set errors**: Check `docker-compose ps`, verify `replicaSet=rs0` in `DATABASE_URL`, inspect with:
```bash
docker exec -it kioskly-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin --eval "rs.status()"
```

**Prisma client out of sync**: Run `npm run prisma:generate --workspace=kioskly-api` after any schema changes.

**Metro bundler cache**: `cd kioskly-app && npm start -- --reset-cache`

**Seed data**: The seed file does not create tenants. Create a tenant via the API first, then seed.
