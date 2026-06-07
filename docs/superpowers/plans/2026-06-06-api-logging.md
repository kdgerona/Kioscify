# API Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured HTTP request logging and auth event logging to the NestJS API using Pino — pretty output in dev, JSON in prod (stdout for Docker).

**Architecture:** `nestjs-pino` replaces NestJS's Logger interface globally; `pino-http` middleware logs every HTTP request automatically; a new `AllExceptionsFilter` logs 4xx at warn and 5xx at error level; `PinoLogger` is injected into `AuthService` for explicit auth event logging.

**Tech Stack:** `nestjs-pino`, `pino-http`, `pino-pretty` (dev only), NestJS 11, Jest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `kioskly-api/package.json` | Modify | Add `nestjs-pino`, `pino-http` to deps; `pino-pretty` to devDeps |
| `src/app.module.ts` | Modify | Import `LoggerModule.forRootAsync()` with env-based config |
| `src/main.ts` | Modify | Use Pino as app logger; wire `AllExceptionsFilter` globally |
| `src/common/filters/all-exceptions.filter.ts` | Create | Global exception filter — logs 4xx (warn) and 5xx (error) |
| `src/common/filters/all-exceptions.filter.spec.ts` | Create | Unit tests for the exception filter |
| `src/auth/auth.service.ts` | Modify | Inject `PinoLogger`; log auth success/failure for all three login flows |
| `src/auth/auth.service.spec.ts` | Create | Unit tests for auth event logging |

---

## Task 1: Install packages

**Files:**
- Modify: `kioskly-api/package.json` (done automatically by npm)

- [ ] **Step 1: Install runtime logging packages**

Run from the repo root:
```bash
npm install nestjs-pino pino-http --workspace=kioskly-api
```

Expected: both packages appear in `kioskly-api/package.json` under `dependencies`.

- [ ] **Step 2: Install pino-pretty as a dev dependency**

```bash
npm install pino-pretty --workspace=kioskly-api --save-dev
```

Expected: `pino-pretty` appears in `kioskly-api/package.json` under `devDependencies`.

- [ ] **Step 3: Verify all existing tests still pass**

```bash
npm run test --workspace=kioskly-api
```

Expected:
```
Tests: 20 passed, 20 total
```

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/package.json kioskly-api/package-lock.json
git commit -m "chore(api): install nestjs-pino, pino-http, pino-pretty"
```

---

## Task 2: Configure LoggerModule and update main.ts

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Import LoggerModule in AppModule**

In `src/app.module.ts`, add the import at the top of the file:
```typescript
import { LoggerModule } from 'nestjs-pino';
```

Then add `LoggerModule.forRootAsync(...)` as the **first** entry inside the `imports` array (before `ConfigModule`), so it is available to all other modules:

```typescript
imports: [
  LoggerModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const isProduction = config.get<string>('NODE_ENV') === 'production';
      return {
        pinoHttp: {
          level: isProduction ? 'info' : 'debug',
          redact: ['req.headers.authorization', 'req.body.password'],
          ...(isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                },
              }),
        },
      };
    },
  }),
  ConfigModule.forRoot({ isGlobal: true }),
  // ... rest of imports unchanged
],
```

> `LoggerModule.forRootAsync` is global by default — no need to import it in other modules.

- [ ] **Step 2: Update main.ts to use Pino as the app logger**

In `src/main.ts`, add this import:
```typescript
import { Logger } from 'nestjs-pino';
```

Change the `NestFactory.create` call to buffer logs during bootstrap (prevents losing early log messages before the logger is wired up):
```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
```

Remove the two `console.log` lines at the bottom and replace with:
```typescript
const logger = app.get(Logger);
await app.listen(port);
logger.log(`🚀 Kioscify API running on: http://localhost:${port}`);
logger.log(`📚 Swagger docs: http://localhost:${port}/${globalPrefix}/docs`);
```

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
npm run test --workspace=kioskly-api
```

Expected: 20 tests pass.

- [ ] **Step 4: Start the API and verify request logs appear**

```bash
npm run api:dev
```

Then in another terminal:
```bash
curl http://localhost:3000/health
```

Expected: a log line appears in the terminal showing the request. In dev it will look like:
```
[12:00:00.000] INFO: GET /health 200 5ms
```

Stop the server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/app.module.ts kioskly-api/src/main.ts
git commit -m "feat(api): configure nestjs-pino logger with HTTP request logging"
```

---

## Task 3: Create AllExceptionsFilter (TDD)

**Files:**
- Create: `src/common/filters/all-exceptions.filter.ts`
- Create: `src/common/filters/all-exceptions.filter.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/common/filters/all-exceptions.filter.spec.ts`:

```typescript
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockLogger: { warn: jest.Mock; error: jest.Mock };
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockRequest: { url: string };
  let mockHost: any;

  beforeEach(() => {
    mockLogger = { warn: jest.fn(), error: jest.fn() };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = { url: '/api/v1/test' };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
    filter = new AllExceptionsFilter(mockLogger as any);
  });

  it('logs 4xx HttpException at warn level with statusCode and path', () => {
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), mockHost);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { statusCode: 404, path: '/api/v1/test' },
      'Not Found',
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logs non-HttpException at error level with stack trace', () => {
    const err = new Error('Database crashed');
    filter.catch(err, mockHost);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        path: '/api/v1/test',
        stack: err.stack,
      }),
      'Internal server error',
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns 404 JSON response for HttpException NOT_FOUND', () => {
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Not Found', path: '/api/v1/test' }),
    );
  });

  it('returns 500 JSON response for unexpected Error', () => {
    filter.catch(new Error('Crash'), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, path: '/api/v1/test' }),
    );
  });

  it('logs 401 UnauthorizedException at warn level', () => {
    filter.catch(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED), mockHost);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { statusCode: 401, path: '/api/v1/test' },
      'Unauthorized',
    );
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm run test --workspace=kioskly-api -- --testPathPattern=all-exceptions.filter
```

Expected: FAIL with `Cannot find module './all-exceptions.filter'`.

- [ ] **Step 3: Implement AllExceptionsFilter**

Create `src/common/filters/all-exceptions.filter.ts`:

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = isHttp ? exception.getResponse() : null;
    const message = isHttp
      ? typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse as any).message ?? exception.message
      : 'Internal server error';

    const logMeta = { statusCode, path: request.url };
    const logMessage = typeof message === 'string' ? message : JSON.stringify(message);

    if (statusCode >= 500) {
      this.logger.error(
        { ...logMeta, stack: (exception as Error).stack },
        logMessage,
      );
    } else {
      this.logger.warn(logMeta, logMessage);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test --workspace=kioskly-api -- --testPathPattern=all-exceptions.filter
```

Expected:
```
PASS src/common/filters/all-exceptions.filter.spec.ts
Tests: 5 passed, 5 total
```

- [ ] **Step 5: Wire the filter globally in main.ts**

In `src/main.ts`, add this import:
```typescript
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
```

After `app.useLogger(app.get(Logger));`, add:
```typescript
app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
```

- [ ] **Step 6: Run all tests to confirm nothing regressed**

```bash
npm run test --workspace=kioskly-api
```

Expected: 25 tests pass (20 existing + 5 new).

- [ ] **Step 7: Commit**

```bash
git add kioskly-api/src/common/filters/all-exceptions.filter.ts kioskly-api/src/common/filters/all-exceptions.filter.spec.ts kioskly-api/src/main.ts
git commit -m "feat(api): add global exception filter with structured error logging"
```

---

## Task 4: Add auth event logging to AuthService (TDD)

**Files:**
- Create: `src/auth/auth.service.spec.ts`
- Modify: `src/auth/auth.service.ts`

- [ ] **Step 1: Write the failing auth logging tests**

Create `src/auth/auth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getLoggerToken } from 'nestjs-pino';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
const bcryptCompare = bcrypt.compare as jest.Mock;

const mockPrisma = {
  tenant: { findFirst: jest.fn(), findUnique: jest.fn() },
  user: { findFirst: jest.fn(), findUnique: jest.fn() },
  userStoreAccess: { findFirst: jest.fn() },
  company: { findFirst: jest.fn() },
};
const mockJwt = { sign: jest.fn().mockReturnValue('mock-token') };
const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

const mockStore = {
  id: 'store-1',
  slug: 'store-1',
  brandId: 'brand-1',
  companyId: 'company-1',
};
const mockUser = {
  id: 'user-1',
  username: 'john',
  password: '$hashed$',
  role: 'ADMIN',
  isActive: true,
  tenantId: 'store-1',
  isFirstLogin: false,
};
const mockUserWithRelations = {
  ...mockUser,
  tenant: { ...mockStore, name: 'Store One', brand: null, company: null },
  storeAccess: [],
};

describe('AuthService — logging', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: getLoggerToken(AuthService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.resetAllMocks();
    mockJwt.sign.mockReturnValue('mock-token');
  });

  describe('loginStore', () => {
    it('logs warn with reason user_not_found when user does not exist', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(mockStore);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.loginStore({ storeSlug: 'store-1', username: 'ghost', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ghost', reason: 'user_not_found' }),
        expect.any(String),
      );
    });

    it('logs warn with reason invalid_password on bad password', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(mockStore);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.loginStore({ storeSlug: 'store-1', username: 'john', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'store-1', username: 'john', reason: 'invalid_password' }),
        expect.any(String),
      );
    });

    it('logs info on successful store login', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(mockStore);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcryptCompare.mockResolvedValue(true);
      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithRelations);

      await service.loginStore({ storeSlug: 'store-1', username: 'john', password: 'correct' });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'store-1', username: 'john', role: 'STORE_ADMIN' }),
        expect.any(String),
      );
    });
  });

  describe('loginCompany', () => {
    const mockCompany = { id: 'company-1', slug: 'acme' };
    const mockCompanyUser = {
      id: 'user-2',
      username: 'admin',
      password: '$hashed$',
      role: 'COMPANY_ADMIN',
      companyId: 'company-1',
      isActive: true,
      isFirstLogin: false,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    };

    it('logs warn when company is not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);

      await expect(
        service.loginCompany({ companySlug: 'ghost', username: 'admin', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ companySlug: 'ghost', reason: 'company_not_found' }),
        expect.any(String),
      );
    });

    it('logs warn when company user credentials are invalid', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany);
      mockPrisma.user.findFirst.mockResolvedValue(mockCompanyUser);
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.loginCompany({ companySlug: 'acme', username: 'admin', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ companySlug: 'acme', username: 'admin', reason: 'invalid_credentials' }),
        expect.any(String),
      );
    });

    it('logs info on successful company login', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany);
      mockPrisma.user.findFirst.mockResolvedValue(mockCompanyUser);
      bcryptCompare.mockResolvedValue(true);

      await service.loginCompany({ companySlug: 'acme', username: 'admin', password: 'correct' });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1', username: 'admin', role: 'COMPANY_ADMIN' }),
        expect.any(String),
      );
    });
  });

  describe('loginPlatform', () => {
    const mockPlatformUser = {
      id: 'user-3',
      username: 'kevin',
      password: '$hashed$',
      role: 'PLATFORM_ADMIN',
      isActive: true,
      isFirstLogin: false,
      firstName: 'K',
      lastName: 'G',
      email: 'kevin@k.com',
    };

    it('logs warn on invalid platform credentials', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.loginPlatform({ username: 'ghost', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ghost', reason: 'invalid_credentials' }),
        expect.any(String),
      );
    });

    it('logs info on successful platform login', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockPlatformUser);
      bcryptCompare.mockResolvedValue(true);

      await service.loginPlatform({ username: 'kevin', password: 'correct' });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'kevin', role: 'PLATFORM_ADMIN' }),
        expect.any(String),
      );
    });
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm run test --workspace=kioskly-api -- --testPathPattern=auth.service
```

Expected: FAIL — `getLoggerToken` not found or logger not injected.

- [ ] **Step 3: Inject PinoLogger into AuthService**

In `src/auth/auth.service.ts`, add these imports:
```typescript
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
```

Update the constructor to inject the logger:
```typescript
constructor(
  private prisma: PrismaService,
  private jwtService: JwtService,
  @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
) {}
```

- [ ] **Step 4: Add logging to loginStore**

In `loginStore`, find the line `if (!store) throw new UnauthorizedException('Invalid credentials');` and add a warn log before the throw:

```typescript
if (!store) {
  this.logger.warn(
    { storeSlug: dto.storeSlug, reason: 'store_not_found' },
    'Store login failed',
  );
  throw new UnauthorizedException('Invalid credentials');
}
```

Find the second `if (!user) throw new UnauthorizedException('Invalid credentials');` (after the UserStoreAccess fallback) and replace it:

```typescript
if (!user) {
  this.logger.warn(
    { storeSlug: dto.storeSlug, username: dto.username, reason: 'user_not_found' },
    'Store login failed',
  );
  throw new UnauthorizedException('Invalid credentials');
}
```

Find `if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');` and replace it:

```typescript
if (!passwordMatch) {
  this.logger.warn(
    { tenantId: store.id, username: dto.username, reason: 'invalid_password' },
    'Store login failed',
  );
  throw new UnauthorizedException('Invalid credentials');
}
```

Before the `return { accessToken: ... }` statement at the end of `loginStore`, add:

```typescript
this.logger.log(
  { tenantId: activeStore.id, username: user.username, role },
  'Store login successful',
);
```

- [ ] **Step 5: Add logging to loginCompany**

In `loginCompany`, find the `if (!company)` block and add before the throw:

```typescript
if (!company) {
  this.logger.warn(
    { companySlug: dto.companySlug, reason: 'company_not_found' },
    'Company login failed',
  );
  throw new UnauthorizedException('Invalid credentials');
}
```

Find `if (!user || !(await bcrypt.compare(dto.password, user.password)))` and replace the full block:

```typescript
if (!user || !(await bcrypt.compare(dto.password, user.password))) {
  this.logger.warn(
    { companySlug: dto.companySlug, username: dto.username, reason: 'invalid_credentials' },
    'Company login failed',
  );
  throw new UnauthorizedException('Invalid credentials');
}
```

Before the `return { accessToken: ... }` statement at the end of `loginCompany`, add:

```typescript
this.logger.log(
  { companyId: user.companyId, username: user.username, role: user.role },
  'Company login successful',
);
```

- [ ] **Step 6: Add logging to loginPlatform**

In `loginPlatform`, find `if (!user || !(await bcrypt.compare(dto.password, user.password)))` and replace:

```typescript
if (!user || !(await bcrypt.compare(dto.password, user.password))) {
  this.logger.warn(
    { username: dto.username, reason: 'invalid_credentials' },
    'Platform login failed',
  );
  throw new UnauthorizedException('Invalid credentials');
}
```

Before the `return { accessToken: ... }` statement at the end of `loginPlatform`, add:

```typescript
this.logger.log(
  { username: user.username, role: user.role },
  'Platform login successful',
);
```

- [ ] **Step 7: Run auth service tests to confirm they pass**

```bash
npm run test --workspace=kioskly-api -- --testPathPattern=auth.service
```

Expected:
```
PASS src/auth/auth.service.spec.ts
Tests: 8 passed, 8 total
```

- [ ] **Step 8: Run all tests to confirm nothing regressed**

```bash
npm run test --workspace=kioskly-api
```

Expected: 33 tests pass (20 existing + 5 filter + 8 auth).

- [ ] **Step 9: Commit**

```bash
git add kioskly-api/src/auth/auth.service.ts kioskly-api/src/auth/auth.service.spec.ts
git commit -m "feat(api): add structured auth event logging with PinoLogger"
```

---

## Verification

After all tasks, start the API and trigger a few scenarios to confirm logs appear as expected:

```bash
npm run api:dev
```

**Test successful login** (should log `info` with tenantId, username, role):
```bash
curl -X POST http://localhost:3000/api/v1/auth/store/login \
  -H "Content-Type: application/json" \
  -d '{"storeSlug":"your-store","username":"your-user","password":"correct"}'
```

**Test failed login** (should log `warn` with reason):
```bash
curl -X POST http://localhost:3000/api/v1/auth/store/login \
  -H "Content-Type: application/json" \
  -d '{"storeSlug":"your-store","username":"ghost","password":"wrong"}'
```

**Test 404** (should log `warn`):
```bash
curl http://localhost:3000/api/v1/does-not-exist
```

All log lines should appear in colorized single-line format in dev.
