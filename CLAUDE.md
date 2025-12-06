# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kioskly is a multi-tenant POS (Point of Sale) kiosk system for beverage businesses. Built as a monorepo using Turborepo, it consists of a NestJS backend API and a React Native/Expo mobile application.

## Architecture

### Monorepo Structure
- **kioskly-api**: NestJS backend with Prisma ORM and MongoDB
- **kioskly-app**: React Native/Expo mobile application

Both packages are managed through npm workspaces and Turborepo for efficient parallel builds and caching.

### Multi-Tenancy
The system supports multiple businesses with complete data isolation:
- Each tenant has unique branding (logo, theme colors)
- All data (users, products, categories, transactions) is scoped to tenants
- Tenants are identified by unique slugs (e.g., "coffee-shop")
- Mobile app loads tenant configuration at startup via slug entry

## Development Commands

### Root Level (Turborepo)
```bash
npm run dev              # Run all apps in development mode (parallel)
npm run build            # Build all packages with caching
npm run test             # Run tests across all packages
npm run lint             # Lint all packages
npm run clean            # Clean all build artifacts and node_modules

# Individual workspace commands
npm run api:dev          # Run API only
npm run app:dev          # Run mobile app only
npm run api:build        # Build API only
npm run app:build        # Build app only
```

### API (kioskly-api)
```bash
# Development
npm run start:dev        # Start API in watch mode (port 3000)
npm run start:prod       # Start production build

# Prisma Database
npm run prisma:generate  # Generate Prisma Client (run after schema changes)
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio GUI
npm run prisma:seed      # Seed database with initial data

# Testing
npm run test             # Run unit tests
npm run test:watch       # Run tests in watch mode
npm run test:cov         # Run tests with coverage
npm run test:e2e         # Run end-to-end tests
```

### Mobile App (kioskly-app)
```bash
npm start                # Start Expo dev server (interactive menu)
npm run android          # Run on Android emulator/device
npm run ios              # Run on iOS simulator/device
npm run web              # Run web version
npm run lint             # Run ESLint
```

## Database Architecture

### MongoDB Setup
- Uses MongoDB with replica set enabled (required for Prisma transactions)
- Configured via Docker Compose in `docker/docker-compose.yml`
- Replica set name: `rs0`
- Default credentials: `admin:admin123` (change in production)

Start MongoDB:
```bash
docker-compose up -d      # From project root
```

Connection string format:
```
mongodb://admin:admin123@localhost:27017/kioskly?authSource=admin&replicaSet=rs0
```

### Schema Design (Multi-Tenant)
All models have `tenantId` foreign key for data isolation:
- **Tenant**: Stores business info, logo, theme colors
- **User**: Tenant-scoped users (ADMIN/CASHIER roles)
- **Category**: Product categories per tenant
- **Product**: Products with category relationship
- **Size**: Size options with price modifiers
- **Addon**: Product add-ons/extras
- **Transaction**: Sales records with payment details
- **TransactionItem**: Line items with size and addon selections

Key constraints:
- Username/email unique per tenant (not globally)
- All data cascades on tenant deletion
- Users cannot be deleted if they have transactions (onDelete: Restrict)

## Backend (kioskly-api)

### Technology Stack
- NestJS with TypeScript
- Prisma ORM with MongoDB
- JWT authentication with Passport
- Swagger/OpenAPI documentation
- bcrypt for password hashing
- Multer for file uploads (tenant logos)

### Module Structure
```
src/
├── auth/           # JWT authentication, login, registration
├── tenants/        # Tenant CRUD, logo upload (ADMIN only)
├── categories/     # Category management
├── products/       # Product management
├── sizes/          # Size management
├── addons/         # Addon management
├── transactions/   # Transaction processing, statistics
├── common/         # Shared decorators, guards, pipes
│   ├── decorators/ # @Roles(), @Tenant() decorators
│   └── guards/     # JwtAuthGuard, RolesGuard
└── prisma/         # PrismaService wrapper
```

### Authentication & Authorization
- JWT tokens expire in 7 days (configurable via JWT_EXPIRES_IN)
- Role-based access control (ADMIN, CASHIER)
- Use `@Roles()` decorator for endpoint protection
- Tenant management endpoints are ADMIN-only

### File Uploads
- Logos stored in `uploads/logos/` directory
- Served statically at `/uploads/logos/:filename`
- Validation: JPG, PNG, GIF, SVG (max 5MB)
- Filenames: `{originalname}-{timestamp}.{ext}`

### API Documentation
Swagger UI available at `http://localhost:3000/api` when running

### Default Seed Data
After running `npm run prisma:seed`:
- Admin user: `username=admin`, `password=admin123`
- Cashier user: `username=cashier`, `password=cashier123`
- Sample categories, products, sizes, addons (if tenant exists)

## Frontend (kioskly-app)

### Technology Stack
- React Native 0.81.5 with React 19
- Expo SDK 54 with New Architecture enabled
- Expo Router (file-based routing)
- NativeWind v4 (TailwindCSS for React Native)
- TypeScript with strict mode
- AsyncStorage for tenant persistence

### App Flow
1. **Tenant Setup** (`app/tenant-setup.tsx`): Enter store slug
2. **Login** (`app/index.tsx`): Authenticate with tenant branding
3. **Home/POS** (`app/home.tsx`): Product browsing, ordering, checkout

### Tenant Context
Global state managed via `contexts/TenantContext.tsx`:
- Fetches tenant by slug from API
- Stores tenant info and theme colors
- Persists selected tenant to AsyncStorage
- Provides `useTenant()` hook for accessing tenant state

### Dynamic Theming
Theme colors applied throughout the app:
- Primary: Main brand color (buttons, headers)
- Secondary: Secondary accents (gradients)
- Accent: Highlights (selected items)
- Background/Text: Base colors

Custom color classes available:
```tsx
className="bg-primary text-secondary-gold border-accent"
```

### Styling with NativeWind
- Use `className` prop with Tailwind utilities (not `style`)
- Import `global.css` at top of each screen
- Metro bundler configured via `withNativeWind()`
- Babel preset: `nativewind/babel`

### State Management
Currently uses local React state (useState/useEffect):
- No global state library (Redux, Zustand, etc.)
- Tenant context is the only shared state
- Order state managed in `app/home.tsx`

## Environment Variables

### API (.env)
```env
DATABASE_URL="mongodb://admin:admin123@localhost:27017/kioskly?authSource=admin&replicaSet=rs0"
JWT_SECRET="change-this-in-production"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
UPLOAD_PATH=./uploads
```

### Mobile App
No environment variables currently used. API URL is hardcoded in contexts (should be configured for production).

## Turborepo Configuration

### Task Pipeline
Defined in `turbo.json`:
- **build**: Caches outputs (`dist/`, `.next/`, `.expo/`, `build/`)
- **dev/start**: No caching (persistent processes)
- **lint/test**: Depends on `^build` completing first
- **test:cov**: Caches coverage reports

### Cache Invalidation
Cache invalidates when:
- Source files change
- Dependencies change
- Environment variables change (see `globalEnv` in turbo.json)

Force cache bypass:
```bash
npm run build -- --force
```

### Workspace Commands
```bash
# Run command in specific workspace
npm run <script> --workspace=kioskly-api

# Install dependency in workspace
npm install <package> --workspace=kioskly-api
npm install -D <package> --workspace=kioskly-app
```

## Testing Multi-Tenancy

### Create a Tenant
```bash
# Login first to get JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Create tenant (use token from login)
curl -X POST http://localhost:3000/tenants \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Coffee Shop",
    "slug": "demo-coffee",
    "themeColors": {
      "primary": "#8b4513",
      "secondary": "#a67c52",
      "accent": "#d4a574",
      "background": "#ffffff",
      "text": "#1f2937"
    }
  }'
```

### Upload Tenant Logo
```bash
curl -X POST http://localhost:3000/tenants/{tenantId}/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@path/to/logo.png"
```

### Test in Mobile App
1. Launch app with `npm start`
2. Enter tenant slug (e.g., "demo-coffee")
3. Login with admin credentials
4. Verify branding and theme colors

## Common Issues & Solutions

### MongoDB Replica Set Errors
If Prisma complains about replica set:
1. Verify Docker is running: `docker-compose ps`
2. Check replica set status: `docker exec -it kioskly-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin --eval "rs.status()"`
3. Ensure DATABASE_URL includes `replicaSet=rs0`

### Prisma Client Out of Sync
After schema changes, always run:
```bash
npm run prisma:generate --workspace=kioskly-api
```

### Metro Bundler Cache Issues
Clear cache and restart:
```bash
npm start -- --reset-cache  # From kioskly-app
```

### Turbo Cache Issues
```bash
npm run clean        # Clear all caches
npm install          # Reinstall dependencies
npm run build        # Rebuild from scratch
```

## Code Style & Patterns

### Backend (NestJS)
- Use DTOs for request/response validation (class-validator)
- Apply guards at controller level: `@UseGuards(JwtAuthGuard, RolesGuard)`
- Use `@Tenant()` decorator to access tenant context (not implemented yet in all modules)
- Return consistent response shapes
- Use Prisma transactions for multi-step operations

### Frontend (React Native)
- Functional components with hooks
- Use `useTenant()` for accessing tenant state
- Apply theme colors dynamically via tenant context
- Use NativeWind classes for styling (no inline styles)
- Handle loading/error states explicitly

### TypeScript
- Strict mode enabled in both projects
- Define interfaces for all data structures
- Use type inference where possible
- Avoid `any` type (use `unknown` if necessary)

## Important Notes

1. **Seed Data**: Current seed file doesn't create tenants automatically. Create tenants manually before seeding products.

2. **API URL**: Mobile app has hardcoded API URL. Configure this for production deployments.

3. **Security**: Default credentials (admin/admin123) are for development only. Change in production.

4. **File Uploads**: The `uploads/` directory must exist. Create with `mkdir -p kioskly-api/uploads/logos`.

5. **MongoDB Replica Set**: Required for Prisma transactions. Use provided Docker Compose setup.

6. **Turborepo Caching**: If builds behave unexpectedly, try `--force` flag to bypass cache.

7. **New Architecture**: Expo's New Architecture is enabled. Some legacy libraries may not be compatible.
