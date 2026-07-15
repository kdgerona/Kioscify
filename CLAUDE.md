# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kioscify** is a Store Management & Monitoring Platform for multi-brand franchise businesses. Built as a monorepo using Turborepo.

### Business Model Hierarchy
```
Kioscify (Platform) → Company → Brand → Store/Tenant
```

### Packages
| Package | Status | Purpose | Port |
|---|---|---|---|
| `kioskly-api` | active (rename pending → `kioscify-api`) | NestJS backend, Prisma + MongoDB | 3000 |
| `kioskly-admin` | active (rename pending → `kioscify-store`) | Store Portal (Next.js 15) | 3100 |
| `kioscify-company` | active | Company + Brand Portal (Next.js 15) | 3001 |
| `kioscify-platform` | active | Kioscify Platform Admin (Next.js 15) | 3002 |
| `kioskly-app` | not in workspaces | React Native/Expo — store staff POS | — |

### User Roles
| Role | Portal | Scope |
|---|---|---|
| PLATFORM_ADMIN | kioscify-platform | Kioscify-wide |
| COMPANY_ADMIN | kioscify-company | One Company + its Brands |
| STORE_ADMIN | kioskly-admin + mobile | One Store |
| CASHIER | mobile only | One Store |
| ADMIN | legacy — treated as STORE_ADMIN | — |

## Development Commands

### Root Level (Turborepo)
```bash
npm run dev              # Run all packages in parallel
npm run build            # Build all packages with caching
npm run test             # Run tests across all packages
npm run lint             # Lint all packages
npm run clean            # Clean all build artifacts and node_modules

npm run api:dev          # API only (watch mode, port 3000)
npm run store:dev        # Store Portal (port 3100)
npm run company:dev      # Company + Brand Portal (port 3001)
npm run platform:dev     # Platform Admin (port 3002)
npm run app:dev          # Mobile app (Expo, not in workspace — runs via cd)

# Install dependency into a specific workspace
npm install <package> --workspace=kioskly-api
npm install <package> --workspace=kioskly-admin
npm install <package> --workspace=kioscify-company
npm install <package> --workspace=kioscify-platform

# Force bypass Turborepo cache
npm run build -- --force
```

### API (run from `kioskly-api/`)
```bash
npm run start:dev            # Start with watch mode
npm run prisma:generate      # Regenerate Prisma Client after schema changes
npm run prisma:migrate       # Run migrations
npm run prisma:studio        # Open Prisma Studio GUI
npm run prisma:seed          # Seed initial data (requires tenant to exist first)
npm run test                 # Unit tests (Jest)
npm run test:e2e             # E2E tests
npm run create:platform-admin  # Bootstrap first PLATFORM_ADMIN user
```

### Root-level one-off scripts
```bash
npm run platform:bootstrap   # Create platform admin (wraps create:platform-admin with dotenv)
npm run migrate:hierarchy     # Run hierarchy migration script
```

### Mobile App (run from `kioskly-app/`)
```bash
npm start                # Expo dev server
npm run android          # Android emulator/device
npm run ios              # iOS simulator/device
```

## Local Development Setup

The local dev setup runs **only MongoDB, Redis, and Nginx in Docker**. App services run natively.

```bash
# Start infrastructure
npm run local:up        # docker compose -f docker-compose.local.yml up -d
npm run local:down      # Stop infrastructure
npm run local:logs      # Tail Nginx logs

# Then start app services in separate terminals:
npm run api:dev         → http://localhost:3000
npm run store:dev       → http://localhost:3100
npm run company:dev     → http://localhost:3001
npm run platform:dev    → http://localhost:3002
```

### Local DNS (for subdomain routing)
Option A — dnsmasq (recommended, handles all subdomains):
```bash
brew install dnsmasq
echo 'address=/.kioscify.localhost/127.0.0.1' | sudo tee -a $(brew --prefix)/etc/dnsmasq.conf
sudo brew services start dnsmasq
sudo mkdir -p /etc/resolver
echo 'nameserver 127.0.0.1' | sudo tee /etc/resolver/localhost
```

Option B — `/etc/hosts` (manual per subdomain):
```bash
sudo sh -c 'echo "127.0.0.1 kioscify.localhost" >> /etc/hosts'
sudo sh -c 'echo "127.0.0.1 platform.kioscify.localhost" >> /etc/hosts'
sudo sh -c 'echo "127.0.0.1 <company-slug>.kioscify.localhost" >> /etc/hosts'
```

Access via Nginx gateway:
- Store Portal: `http://kioscify.localhost`
- Platform Admin: `http://platform.kioscify.localhost`
- Company Portal: `http://<company-slug>.kioscify.localhost`
- API (direct): `http://localhost:3000/api/v1`

## Database

### MongoDB + Redis
- MongoDB requires a replica set (for Prisma transactions)
- Redis is used for JWT token blacklist (logout/invalidation)
- Both are started via `docker-compose.local.yml`

Local MongoDB credentials (different from old docker-compose.yml):
```
mongodb://root:s3cr3t@localhost:27017/kioscify?authSource=admin&replicaSet=rs0
```

Inspect replica set:
```bash
docker exec -it kioscify-mongo-local mongosh -u root -p s3cr3t --authenticationDatabase admin --eval "rs.status()"
```

### Schema Models (Multi-Tenant Hierarchy)

**Hierarchy models:**
| Model | Purpose |
|---|---|
| Company | Top-level franchise organization; owns Brands and Stores |
| Brand | Product catalog owner; groups Stores under one menu |
| Tenant (Store) | Operational unit; `brandId`/`companyId` nullable during migration |
| UserStoreAccess | Many-to-many: User ↔ Tenant with role per store |
| PlatformConfig | Singleton — maintenance flags, global platform settings |

**Operational models (store-scoped):**
| Model | Purpose |
|---|---|
| User | Auth for all roles; `tenantId`/`companyId`/`brandId` depend on role |
| Category, Product, Size, Addon, Preference | Catalog — **brand-scoped**, not tenant-scoped |
| Transaction, TransactionItem | Sales records + void workflow |
| Expense | Business expenses + void workflow |
| InventoryItem, InventoryRecord | Inventory tracking |
| SubmittedReport | Daily snapshot report |
| SubmittedInventoryReport | Daily inventory snapshot |

**Catalog ownership note**: Categories, Products, Sizes, Addons, and Preferences are owned by `Brand`, not `Tenant`. `tenantId` fields remain nullable during migration and will be removed post-migration.

**Void workflow**: `voidStatus` (NONE → PENDING → APPROVED/REJECTED) managed by separate requester/reviewer user references on Transactions and Expenses.

**User scoping by role:**
- `PLATFORM_ADMIN`: no tenantId/companyId/brandId
- `COMPANY_ADMIN`: companyId set, tenantId null
- `STORE_ADMIN` / `CASHIER`: tenantId + companyId + brandId all set

Constraints: username/email unique per tenant (not globally). Users with transactions cannot be deleted (Restrict). All other data cascades on tenant/company deletion.

## Backend (kioskly-api)

### API Prefix & Docs
- All routes prefixed with `/api/v1` (configurable via `API_PREFIX`)
- `GET /health` excluded from prefix (load balancer probe)
- Swagger UI: `http://localhost:3000/api/v1/docs`

### Module Structure
```
src/
├── auth/                         # Login (store/company/platform), JWT, password change
├── platform/                     # PLATFORM_ADMIN: stats, company/brand/store CRUD, maintenance
├── companies/                    # Company CRUD (PLATFORM_ADMIN)
├── brands/                       # Brand CRUD (COMPANY_ADMIN / PLATFORM_ADMIN)
├── stores/                       # Store/Tenant CRUD (was: tenants/)
├── users/                        # User management across roles
├── categories/                   # Brand-scoped catalog
├── products/                     # Brand-scoped catalog
├── sizes/                        # Brand-scoped catalog
├── addons/                       # Brand-scoped catalog
├── preferences/                  # Brand-scoped delivery platform preferences
├── analytics/                    # Company-level franchise analytics
├── transactions/                 # Store-scoped, void workflow
├── expenses/                     # Store-scoped, void workflow
├── inventory/                    # Inventory items and records
├── reports/                      # Aggregated reporting
├── submitted-reports/            # Daily snapshot reports
├── submitted-inventory-reports/  # Daily inventory snapshots
├── common/
│   ├── decorators/               # @Roles(), @TenantId(), @Public()
│   ├── guards/                   # JwtAuthGuard, RolesGuard
│   └── filters/                  # AllExceptionsFilter, MulterExceptionFilter
└── prisma/                       # PrismaService
```

### Auth Patterns
Three separate login endpoints by role:
- `POST /auth/login` — store users (STORE_ADMIN / CASHIER); requires `tenantId` in body
- `POST /auth/company-login` — COMPANY_ADMIN; requires `companyId` or slug
- `POST /auth/platform-login` — PLATFORM_ADMIN
- `POST /auth/switch-store` — switches active store for a STORE_ADMIN with multi-store access

JWT tokens (7-day default). Apply at controller level:
```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STORE_ADMIN')           // or 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'CASHIER'
```

Decorators:
- `@TenantId()` — extracts `tenantId` from JWT payload
- `@Public()` — marks endpoint as unauthenticated (no guards needed)
- `@Roles(...)` — role allowlist; `ADMIN` is treated as `STORE_ADMIN` for backwards compat

Login is rate-limited (20 attempts / 15 min by default; configure via `THROTTLE_LOGIN_TTL` / `THROTTLE_LOGIN_LIMIT`).

### Company Portal Subdomain Middleware
`kioscify-company/middleware.ts` extracts the company slug from the subdomain (`<slug>.kioscify.com`). In local dev, subdomain check is bypassed for `localhost`. Maintenance mode is checked first via `GET /platform/maintenance-status`.

### File Uploads
- Logos: `uploads/logos/` served at `/uploads/logos/:filename`
- CORS policy: `crossOriginResourcePolicy: cross-origin` so images load from portal subdomains
- Run `mkdir -p kioskly-api/uploads/logos` before first run

## Portals

### Store Portal (kioskly-admin) — port 3100
Entry: `tenant-setup` → `login` → `(main)` layout with sidebar

Routes (`app/(main)/`): `dashboard`, `products`, `categories`, `sizes`, `addons`, `transactions`, `expenses`, `inventory`, `inventory-alerts`, `inventory-progression`, `inventory-reports`, `submitted-reports`, `reports`, `settings`, `users`

### Company Portal (kioscify-company) — port 3001
Accessed via `<slug>.kioscify.com`. Routes (`app/(main)/`): `dashboard`, `brands`, `analytics`, `settings`, `users`

### Platform Admin (kioscify-platform) — port 3002
Routes (`app/(main)/`): `dashboard`, `companies`, `settings`, `users`

### Shared Frontend Patterns
- API client: `lib/api.ts` — Axios instance; token stored and read from `localStorage`
- UI: Radix UI primitives + Tailwind CSS + `tailwind-merge`/`clsx`
- Company portal sends `x-company-slug` header where needed

## Mobile App (kioskly-app)

- React Native 0.81.5 + React 19, Expo SDK 54 (New Architecture enabled)
- Expo Router (file-based routing), NativeWind v4 (Tailwind for React Native)
- AsyncStorage for tenant persistence
- Flow: `tenant-setup` → `login` → `home` (POS)
- Use `className` (NativeWind), not `style`. Import `global.css` at top of each screen.
- **Not in npm workspaces** — install deps via `cd kioskly-app && npm install`

## Environment Variables

### API (`kioskly-api/.env`)
```env
DATABASE_URL="mongodb://root:s3cr3t@localhost:27017/kioscify?authSource=admin&replicaSet=rs0"
JWT_SECRET="change-this-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
UPLOAD_PATH=./uploads
API_PREFIX=api/v1
ALLOWED_ORIGINS=http://kioscify.localhost,http://platform.kioscify.localhost,http://*.kioscify.localhost
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Store Portal (`kioskly-admin/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### Company Portal (`kioscify-company/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_PLATFORM_DOMAIN=kioscify.localhost
```

### Platform Admin (`kioscify-platform/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### Mobile App
API URL is hardcoded in contexts — configure for production.

## Common Issues

**MongoDB replica set errors**: Check `docker compose -f docker-compose.local.yml ps`, verify `replicaSet=rs0` in `DATABASE_URL`.

**Prisma client out of sync**: Run `npm run prisma:generate --workspace=kioskly-api` after any schema changes.

**Metro bundler cache**: `cd kioskly-app && npm start -- --reset-cache`

**Seed data**: The seed file does not create tenants. Create a tenant via the API first, then seed.

**First platform admin**: Run `npm run platform:bootstrap` (reads `kioskly-api/.env`).

**CORS errors from portals**: Ensure `ALLOWED_ORIGINS` in the API `.env` includes the portal's origin. The API supports wildcard patterns (e.g. `http://*.kioscify.localhost`).

**Adding a required field to an existing Prisma model (MongoDB gotcha)**: MongoDB is schemaless — `prisma generate`/`db push` only teaches Prisma Client about the new field, it does **not** retroactively write that field onto existing documents. Any query that filters on the new field (e.g. the `tombstone: { not: 1 }` soft-delete idiom) will silently exclude every pre-existing document that lacks it, instead of treating "missing" as "matches the default." This caused a real incident (2026-07-06): adding `tombstone` to `User` without backfilling broke every user list and login. Whenever you add a required field with a default to a model that already has data, you MUST also write and run a one-time backfill script (see `kioskly-api/src/scripts/backfill-user-tombstone.ts` for the pattern) against every environment (local, staging, production) — ideally before or atomically with deploying the code that filters on it, not after. This applies to list/array fields too, even ones you don't currently filter on — see `kioskly-api/src/scripts/backfill-transaction-payments.ts` (backfills `Transaction.payments` to `[]`), added defensively when the split-payment feature introduced that field, precisely so a future query added against it can't repeat the same incident.
