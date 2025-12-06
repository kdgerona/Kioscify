# Kioskly

A modern kiosk management system built with a monorepo architecture using Turborepo.

## Project Structure

This monorepo contains:

- **kioskly-api** - NestJS backend API with Prisma ORM
- **kioskly-app** - React Native/Expo mobile application

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 10.0.0

### Installation

Install dependencies for all packages:

```bash
npm install
```

### Development

Run all apps in development mode:

```bash
npm run dev
```

Run individual apps:

```bash
# API only
npm run api:dev

# App only
npm run app:dev
```

### Building

Build all packages:

```bash
npm run build
```

Build individual packages:

```bash
# API only
npm run api:build

# App only
npm run app:build
```

### Other Commands

```bash
# Run linting across all packages
npm run lint

# Run tests across all packages
npm run test

# Format code across all packages
npm run format

# Clean all node_modules and build artifacts
npm run clean
```

## Turborepo

This project uses [Turborepo](https://turbo.build/repo) for:

- **Fast builds** - Turborepo caches build outputs and only rebuilds what changed
- **Parallel execution** - Run tasks across multiple packages simultaneously
- **Task dependencies** - Automatically run tasks in the correct order
- **Remote caching** - Share build cache across your team (optional)

### Useful Turborepo Commands

```bash
# Run a specific task
turbo run <task-name>

# Run with verbose output
turbo run build --verbose

# Clear the cache
turbo run build --force

# Generate a task graph
turbo run build --graph
```

## Packages

### kioskly-api

NestJS-based REST API with:
- JWT authentication
- Prisma ORM
- Swagger documentation
- Role-based access control

[View API README](./kioskly-api/README.md)

### kioskly-app

React Native/Expo mobile app with:
- Expo Router for navigation
- NativeWind for styling
- Transaction management
- Checkout flow

[View App README](./kioskly-app/README.md)

## License

UNLICENSED

