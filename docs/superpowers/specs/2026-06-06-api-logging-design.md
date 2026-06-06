# API Logging Design

**Date:** 2026-06-06
**Scope:** `kioskly-api` (NestJS backend)
**Status:** Approved

## Goal

Add structured logging to the NestJS API for debugging and production visibility. Logs go to stdout (Docker captures them). Pretty output in development, JSON in production.

## Packages

| Package | Type | Purpose |
|---|---|---|
| `nestjs-pino` | dependency | Replaces NestJS Logger with Pino |
| `pino-http` | dependency | HTTP request logging middleware (peer dep) |
| `pino-pretty` | devDependency | Dev-mode colorized pretty printer |

## Architecture

### LoggerModule (AppModule)

Registered with `LoggerModule.forRootAsync()` reading `NODE_ENV` from `ConfigService`.

**Development config:**
- Transport: `pino-pretty` with `colorize: true`, `singleLine: true`
- Log level: `debug`

**Production config:**
- Transport: none (raw JSON to stdout)
- Log level: `info`

**Redacted fields (all environments):**
- `req.headers.authorization`
- `req.body.password`

### main.ts

`NestFactory.create` receives `Logger` from `nestjs-pino` as the app logger so NestJS bootstrap messages go through Pino.

## HTTP Request Logging

Handled automatically by `pino-http` middleware — no custom interceptor needed.

Each log line includes:
- `method`, `url`, `statusCode`, `responseTime` (ms)
- Auto-generated `reqId` per request (useful for tracing a request across log lines)

Request/response bodies are **not** logged at the HTTP layer (too verbose, sensitive data risk).

**Dev example:**
```
[12:34:56.789] INFO: GET /api/v1/products 200 12ms
```

**Prod example:**
```json
{"level":30,"time":1717660496789,"pid":1,"hostname":"api","req":{"id":1,"method":"GET","url":"/api/v1/products"},"res":{"statusCode":200},"responseTime":12,"msg":"request completed"}
```

## Global Exception Filter

**File:** `src/common/filters/all-exceptions.filter.ts`

Catches every unhandled exception globally via `app.useGlobalFilters()`.

| Error type | Log level | Fields |
|---|---|---|
| 4xx (HttpException) | `warn` | `statusCode`, `message`, `path` |
| 5xx (unexpected) | `error` | `statusCode`, `message`, `path`, `stack` |

Existing HTTP response behaviour is preserved — the filter adds logging then delegates to the normal error response.

## Auth Event Logging

`PinoLogger` injected into `AuthService`.

| Event | Level | Fields |
|---|---|---|
| Successful login | `info` | `tenantId`, `username`, `role` |
| Failed login (bad password) | `warn` | `tenantId`, `username`, `reason: 'invalid_password'` |
| Failed login (user not found) | `warn` | `tenantId`, `username`, `reason: 'user_not_found'` |

Passwords and tokens are **never** logged. Fields are constructed manually (not spread from request body).

## File Changes Summary

| File | Change |
|---|---|
| `package.json` | Add `nestjs-pino`, `pino-http`; add `pino-pretty` to devDependencies |
| `src/main.ts` | Use `nestjs-pino` Logger; wire `AllExceptionsFilter` globally |
| `src/app.module.ts` | Import `LoggerModule.forRootAsync()` |
| `src/common/filters/all-exceptions.filter.ts` | New — global exception filter |
| `src/auth/auth.service.ts` | Inject `PinoLogger`; add login success/failure log calls |

## Out of Scope

- Logging request/response bodies
- External log shipping (Datadog, Sentry, etc.) — stdout is sufficient for Docker
- Per-module verbose logging (can be added incrementally later)
