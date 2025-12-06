# Turborepo Setup Guide

This document explains the Turborepo configuration for the Kioskly monorepo.

## What is Turborepo?

Turborepo is a high-performance build system for JavaScript and TypeScript monorepos. It provides:

- **Incremental Builds**: Only rebuilds what changed
- **Remote Caching**: Share build cache with your team (optional)
- **Parallel Execution**: Run tasks across packages simultaneously
- **Task Pipelines**: Define dependencies between tasks

## Configuration

### Root Configuration

The monorepo is configured in `package.json`:

```json
{
  "workspaces": ["kioskly-api", "kioskly-app"]
}
```

### Turbo Configuration

The `turbo.json` file defines task pipelines and caching strategies:

- **build**: Builds all packages with caching
- **dev**: Runs development servers (no caching, persistent)
- **lint**: Runs linting across packages
- **test**: Runs tests with coverage caching
- **format**: Formats code

## Available Commands

### Development

```bash
# Run all apps in development mode
npm run dev

# Run individual apps
npm run api:dev  # API only
npm run app:dev  # App only
```

### Building

```bash
# Build all packages
npm run build

# Build individual packages
npm run api:build
npm run app:build
```

### Testing & Linting

```bash
# Run tests across all packages
npm run test

# Run linting
npm run lint

# Format code
npm run format
```

### Maintenance

```bash
# Clean all build artifacts and node_modules
npm run clean

# Force rebuild (ignore cache)
turbo run build --force

# View task dependency graph
turbo run build --graph
```

## Task Pipeline

The task pipeline is defined in `turbo.json`:

1. **build** - Depends on dependencies being built first (`^build`)
2. **test** - Depends on build completing first
3. **lint** - Depends on build completing first
4. **dev/start** - No dependencies, run directly

## Caching

Turborepo caches:
- Build outputs (`dist/`, `.next/`, `.expo/`, etc.)
- Test coverage reports
- Lint results

Cache is stored in `.turbo/` directory (gitignored).

### Cache Invalidation

Cache is invalidated when:
- Source files change
- Dependencies change
- Environment variables change (see `globalEnv` in `turbo.json`)
- Task configuration changes

### Force Cache Bypass

```bash
# Bypass cache for a single run
turbo run build --force

# Or use the npm script
npm run build -- --force
```

## Environment Variables

Global environment variables (defined in `turbo.json`):
- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`

These are included in cache keys, so changing them invalidates the cache.

## Remote Caching (Optional)

To enable remote caching with Vercel:

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Link project: `vercel link`
4. Run builds: Turbo will automatically use remote cache

Or use Turbo's own remote cache:

```bash
npx turbo login
npx turbo link
```

## Workspace Commands

Run commands in specific workspaces:

```bash
# Run a command in a specific workspace
npm run <script> --workspace=kioskly-api
npm run <script> --workspace=kioskly-app

# Install a dependency in a specific workspace
npm install <package> --workspace=kioskly-api

# Install a dev dependency
npm install -D <package> --workspace=kioskly-app
```

## Troubleshooting

### Cache Issues

If you encounter unexpected behavior:

```bash
# Clear cache and rebuild
rm -rf .turbo node_modules
npm install
npm run build -- --force
```

### Workspace Not Found

Ensure package names in `package.json` match the workspace folders.

### Slow Builds

Check if tasks are running in parallel:

```bash
# View what's running
turbo run build --summarize

# Check for bottlenecks
turbo run build --graph
```

## Best Practices

1. **Define Clear Task Dependencies**: Use `dependsOn` to ensure tasks run in the correct order
2. **Cache Appropriately**: Mark long-running tasks as cacheable, skip caching for dev/watch tasks
3. **Use Parallel Execution**: Use `--parallel` flag for independent tasks
4. **Keep Outputs Consistent**: Ensure build outputs go to the same directory each time
5. **Version Lock**: Keep turbo version locked in `package.json` for consistency

## Advanced Usage

### Filter Packages

```bash
# Run build only for API
turbo run build --filter=kioskly-api

# Run build for API and its dependencies
turbo run build --filter=kioskly-api...

# Run build for packages that depend on API
turbo run build --filter=...kioskly-api
```

### Verbose Output

```bash
# See what turbo is doing
turbo run build --verbose

# See even more details
turbo run build --verbosity=2
```

### Task Profiles

```bash
# Profile task execution
turbo run build --profile=profile.json

# Upload to speedscope.app for visualization
```

## Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Turborepo Handbook](https://turbo.build/repo/docs/handbook)
- [Caching Guide](https://turbo.build/repo/docs/core-concepts/caching)

