# Platform Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow platform admins to create, list, enable/disable, reset passwords for, and delete other platform admin accounts from the `kioscify-platform` portal.

**Architecture:** Five new endpoints are added to the existing `platform` NestJS module (`PlatformController` / `PlatformService`), keeping all Kioscify-internal admin concerns in one place. The `kioscify-platform` frontend gets a new `/users` route wired into the sidebar and five new `ApiClient` methods.

**Tech Stack:** NestJS, Prisma (MongoDB), class-validator DTOs, Jest; Next.js 15 App Router, Axios, Tailwind CSS, lucide-react.

---

## File Map

**Create:**
- `kioskly-api/src/platform/dto/create-platform-admin.dto.ts` — DTO for new platform admin
- `kioskly-api/src/platform/platform.service.spec.ts` — unit tests for platform service
- `kioscify-platform/app/(main)/users/page.tsx` — Users management page

**Modify:**
- `kioskly-api/src/platform/platform.service.ts` — add 5 new methods
- `kioskly-api/src/platform/platform.controller.ts` — wire 5 new endpoints
- `kioscify-platform/lib/api.ts` — add 5 new API client methods
- `kioscify-platform/app/(main)/layout.tsx` — add Users nav item

---

## Task 1: Create `CreatePlatformAdminDto`

**Files:**
- Create: `kioskly-api/src/platform/dto/create-platform-admin.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// kioskly-api/src/platform/dto/create-platform-admin.dto.ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePlatformAdminDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-api/src/platform/dto/create-platform-admin.dto.ts
git commit -m "feat(platform): add CreatePlatformAdminDto"
```

---

## Task 2: Add `getPlatformAdmins` to `PlatformService` (TDD)

**Files:**
- Create: `kioskly-api/src/platform/platform.service.spec.ts`
- Modify: `kioskly-api/src/platform/platform.service.ts`

- [ ] **Step 1: Create spec file with failing test**

```typescript
// kioskly-api/src/platform/platform.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformService } from './platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  company: { count: jest.fn() },
  brand: { count: jest.fn() },
  tenant: { count: jest.fn() },
  transaction: { findMany: jest.fn() },
  platformConfig: { upsert: jest.fn() },
};

const mockAuthService = {
  generateSecurePassword: jest.fn().mockReturnValue('TempPass@123'),
};

const mockAdmin = {
  id: 'admin-1',
  username: 'admin1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@kioscify.com',
  role: 'PLATFORM_ADMIN',
  isActive: true,
  isFirstLogin: false,
  createdAt: new Date('2026-01-01'),
};

describe('PlatformService — admin management', () => {
  let service: PlatformService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = module.get<PlatformService>(PlatformService);
  });

  describe('getPlatformAdmins', () => {
    it('returns all PLATFORM_ADMIN users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockAdmin]);
      const result = await service.getPlatformAdmins();
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'PLATFORM_ADMIN' },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          isFirstLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockAdmin]);
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `TypeError: service.getPlatformAdmins is not a function` or similar.

- [ ] **Step 3: Add `getPlatformAdmins` to `PlatformService`**

Add the following import and method to `kioskly-api/src/platform/platform.service.ts`.

At the top of the file, add the import:
```typescript
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import * as bcrypt from 'bcrypt';
```

Replace the existing `import { Injectable } from '@nestjs/common';` line with the above.

Also add `AuthService` to the constructor:
```typescript
constructor(
  private prisma: PrismaService,
  private authService: AuthService,
) {}
```

Then add the method after `getActivity()`:
```typescript
// ─── Platform admin CRUD ──────────────────────────────────────────────────

async getPlatformAdmins() {
  return this.prisma.user.findMany({
    where: { role: 'PLATFORM_ADMIN' },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      isFirstLogin: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/platform/platform.service.ts kioskly-api/src/platform/platform.service.spec.ts
git commit -m "feat(platform): add getPlatformAdmins service method"
```

---

## Task 3: Add `createPlatformAdmin` to `PlatformService` (TDD)

**Files:**
- Modify: `kioskly-api/src/platform/platform.service.ts`
- Modify: `kioskly-api/src/platform/platform.service.spec.ts`

- [ ] **Step 1: Add failing test**

Append inside the `describe('PlatformService — admin management')` block in `platform.service.spec.ts`:

```typescript
  describe('createPlatformAdmin', () => {
    const dto = {
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@kioscify.com',
      username: 'bobjones',
    };

    it('throws ConflictException if username already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      await expect(service.createPlatformAdmin(dto)).rejects.toThrow(ConflictException);
    });

    it('creates a new PLATFORM_ADMIN and returns user + temporaryPassword', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const created = { id: 'admin-2', ...dto, role: 'PLATFORM_ADMIN', isActive: true, isFirstLogin: true };
      mockPrisma.user.create.mockResolvedValue(created);

      const result = await service.createPlatformAdmin(dto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: dto.username,
            email: dto.email,
            role: 'PLATFORM_ADMIN',
            isFirstLogin: true,
            tenantId: null,
            companyId: null,
          }),
        }),
      );
      expect(result.temporaryPassword).toBe('TempPass@123');
      expect(result.user).toEqual(created);
    });
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `TypeError: service.createPlatformAdmin is not a function`.

- [ ] **Step 3: Add `createPlatformAdmin` to `PlatformService`**

Add after `getPlatformAdmins()` in `platform.service.ts`:

```typescript
async createPlatformAdmin(dto: {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
}) {
  const existing = await this.prisma.user.findFirst({
    where: { username: dto.username, role: 'PLATFORM_ADMIN' },
  });
  if (existing) throw new ConflictException('Username already exists');

  const password = this.authService.generateSecurePassword();
  const hashed = await bcrypt.hash(password, 12);

  const user = await this.prisma.user.create({
    data: {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      username: dto.username,
      password: hashed,
      role: 'PLATFORM_ADMIN',
      isFirstLogin: true,
      isActive: true,
      tenantId: null,
      companyId: null,
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      isFirstLogin: true,
      createdAt: true,
    },
  });

  return {
    user,
    temporaryPassword: password,
    note: 'Share this password via a secure channel. User will be required to change it on first login.',
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/platform/platform.service.ts kioskly-api/src/platform/platform.service.spec.ts
git commit -m "feat(platform): add createPlatformAdmin service method"
```

---

## Task 4: Add `updatePlatformAdmin` to `PlatformService` (TDD)

**Files:**
- Modify: `kioskly-api/src/platform/platform.service.ts`
- Modify: `kioskly-api/src/platform/platform.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Append inside the describe block in `platform.service.spec.ts`:

```typescript
  describe('updatePlatformAdmin', () => {
    it('throws ForbiddenException if admin tries to update themselves', async () => {
      await expect(
        service.updatePlatformAdmin('admin-1', 'admin-1', { isActive: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if target user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.updatePlatformAdmin('admin-1', 'admin-2', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates isActive and returns updated user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      const updated = { ...mockAdmin, isActive: false };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updatePlatformAdmin('admin-1', 'admin-2', { isActive: false });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'admin-2' },
        data: { isActive: false },
        select: expect.any(Object),
      });
      expect(result.isActive).toBe(false);
    });
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `TypeError: service.updatePlatformAdmin is not a function`.

- [ ] **Step 3: Add `updatePlatformAdmin` to `PlatformService`**

Add after `createPlatformAdmin()` in `platform.service.ts`:

```typescript
async updatePlatformAdmin(
  requestingUserId: string,
  targetId: string,
  dto: { isActive: boolean },
) {
  if (requestingUserId === targetId) {
    throw new ForbiddenException('Cannot modify your own account');
  }
  const user = await this.prisma.user.findFirst({
    where: { id: targetId, role: 'PLATFORM_ADMIN' },
  });
  if (!user) throw new NotFoundException('Platform admin not found');

  return this.prisma.user.update({
    where: { id: targetId },
    data: { isActive: dto.isActive },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      isFirstLogin: true,
      createdAt: true,
    },
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/platform/platform.service.ts kioskly-api/src/platform/platform.service.spec.ts
git commit -m "feat(platform): add updatePlatformAdmin service method with self-guard"
```

---

## Task 5: Add `resetPlatformAdminPassword` to `PlatformService` (TDD)

**Files:**
- Modify: `kioskly-api/src/platform/platform.service.ts`
- Modify: `kioskly-api/src/platform/platform.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Append inside the describe block in `platform.service.spec.ts`:

```typescript
  describe('resetPlatformAdminPassword', () => {
    it('throws NotFoundException if target user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPlatformAdminPassword('admin-99')).rejects.toThrow(NotFoundException);
    });

    it('resets password and sets isFirstLogin: true', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      mockPrisma.user.update.mockResolvedValue({ ...mockAdmin, isFirstLogin: true });

      const result = await service.resetPlatformAdminPassword('admin-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-1' },
          data: expect.objectContaining({ isFirstLogin: true }),
        }),
      );
      expect(result.temporaryPassword).toBe('TempPass@123');
    });
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `TypeError: service.resetPlatformAdminPassword is not a function`.

- [ ] **Step 3: Add `resetPlatformAdminPassword` to `PlatformService`**

Add after `updatePlatformAdmin()` in `platform.service.ts`:

```typescript
async resetPlatformAdminPassword(targetId: string) {
  const user = await this.prisma.user.findFirst({
    where: { id: targetId, role: 'PLATFORM_ADMIN' },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      isFirstLogin: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundException('Platform admin not found');

  const password = this.authService.generateSecurePassword();
  const hashed = await bcrypt.hash(password, 12);
  await this.prisma.user.update({
    where: { id: targetId },
    data: { password: hashed, isFirstLogin: true },
  });

  return {
    user,
    temporaryPassword: password,
    note: 'Share this password via a secure channel. User will be required to change it on first login.',
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/platform/platform.service.ts kioskly-api/src/platform/platform.service.spec.ts
git commit -m "feat(platform): add resetPlatformAdminPassword service method"
```

---

## Task 6: Add `deletePlatformAdmin` to `PlatformService` (TDD)

**Files:**
- Modify: `kioskly-api/src/platform/platform.service.ts`
- Modify: `kioskly-api/src/platform/platform.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Append inside the describe block in `platform.service.spec.ts`:

```typescript
  describe('deletePlatformAdmin', () => {
    it('throws ForbiddenException if admin tries to delete themselves', async () => {
      await expect(
        service.deletePlatformAdmin('admin-1', 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if target user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.deletePlatformAdmin('admin-1', 'admin-99'),
      ).rejects.toThrow(NotFoundException);
    });

    it('hard deletes the target user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      mockPrisma.user.delete.mockResolvedValue(mockAdmin);

      const result = await service.deletePlatformAdmin('admin-1', 'admin-2');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'admin-2' } });
      expect(result).toEqual({ message: 'Platform admin deleted' });
    });
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `TypeError: service.deletePlatformAdmin is not a function`.

- [ ] **Step 3: Add `deletePlatformAdmin` to `PlatformService`**

Add after `resetPlatformAdminPassword()` in `platform.service.ts`:

```typescript
async deletePlatformAdmin(requestingUserId: string, targetId: string) {
  if (requestingUserId === targetId) {
    throw new ForbiddenException('Cannot delete your own account');
  }
  const user = await this.prisma.user.findFirst({
    where: { id: targetId, role: 'PLATFORM_ADMIN' },
  });
  if (!user) throw new NotFoundException('Platform admin not found');

  await this.prisma.user.delete({ where: { id: targetId } });
  return { message: 'Platform admin deleted' };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd kioskly-api && npx jest src/platform/platform.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/platform/platform.service.ts kioskly-api/src/platform/platform.service.spec.ts
git commit -m "feat(platform): add deletePlatformAdmin service method with self-guard"
```

---

## Task 7: Wire endpoints in `PlatformController` and register `AuthService` in `PlatformModule`

**Files:**
- Modify: `kioskly-api/src/platform/platform.controller.ts`
- Modify: `kioskly-api/src/platform/platform.module.ts`

- [ ] **Step 1: Update `PlatformModule` to import `AuthService`**

Read `kioskly-api/src/platform/platform.module.ts`. It currently only provides `PlatformService`. Add `AuthModule` import so `AuthService` is injectable.

Replace the contents of `platform.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
```

> **Note:** `PrismaModule` is `@Global()` so it does not need to be imported here. `AuthModule` exports `AuthService`, which `PlatformService` needs for `generateSecurePassword` and bcrypt.

- [ ] **Step 2: Add 5 endpoints to `PlatformController`**

Replace the contents of `kioskly-api/src/platform/platform.controller.ts` with:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  @Get('maintenance-status')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get maintenance status for all portals (public)' })
  getMaintenanceStatus() {
    return this.platformService.getMaintenanceStatus();
  }

  @Patch('maintenance-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update maintenance status for portals (PLATFORM_ADMIN)' })
  updateMaintenanceStatus(@Body() dto: UpdateMaintenanceStatusDto) {
    return this.platformService.updateMaintenanceStatus(dto);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Platform-wide statistics' })
  getStats() {
    return this.platformService.getStats();
  }

  @Get('companies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Paginated list of all companies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getCompanies(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.platformService.getCompanies(page ?? 1, limit ?? 20);
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recent platform activity (last 30 days)' })
  getActivity() {
    return this.platformService.getActivity();
  }

  // ─── Platform admin management ────────────────────────────────────────────

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all platform admins' })
  getPlatformAdmins() {
    return this.platformService.getPlatformAdmins();
  }

  @Post('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new platform admin (returns temporary password)' })
  createPlatformAdmin(@Body() dto: CreatePlatformAdminDto) {
    return this.platformService.createPlatformAdmin(dto);
  }

  @Patch('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable a platform admin' })
  updatePlatformAdmin(
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
    @Request() req,
  ) {
    return this.platformService.updatePlatformAdmin(req.user.id, id, dto);
  }

  @Post('admins/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a platform admin\'s password' })
  resetPlatformAdminPassword(@Param('id') id: string) {
    return this.platformService.resetPlatformAdminPassword(id);
  }

  @Delete('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a platform admin' })
  deletePlatformAdmin(@Param('id') id: string, @Request() req) {
    return this.platformService.deletePlatformAdmin(req.user.id, id);
  }
}
```

- [ ] **Step 3: Verify the API compiles**

```bash
cd kioskly-api && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Run all tests**

```bash
cd kioskly-api && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/platform/platform.controller.ts kioskly-api/src/platform/platform.module.ts
git commit -m "feat(platform): wire platform admin CRUD endpoints in controller"
```

---

## Task 8: Add API client methods in `kioscify-platform`

**Files:**
- Modify: `kioscify-platform/lib/api.ts`

- [ ] **Step 1: Add 5 methods to `ApiClient`**

In `kioscify-platform/lib/api.ts`, add the following methods after the `deleteUser` method (before the closing `}`):

```typescript
// ─── Platform admin management ────────────────────────────────────────────

async getPlatformAdmins(): Promise<User[]> {
  const { data } = await this.client.get<User[]>('/platform/admins');
  return data;
}

async createPlatformAdmin(payload: {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
}): Promise<{ user: User; temporaryPassword: string }> {
  const { data } = await this.client.post('/platform/admins', payload);
  return data;
}

async updatePlatformAdmin(
  id: string,
  payload: { isActive: boolean }
): Promise<User> {
  const { data } = await this.client.patch<User>(`/platform/admins/${id}`, payload);
  return data;
}

async resetPlatformAdminPassword(
  id: string
): Promise<{ user: User; temporaryPassword: string }> {
  const { data } = await this.client.post(`/platform/admins/${id}/reset-password`);
  return data;
}

async deletePlatformAdmin(id: string): Promise<{ message: string }> {
  const { data } = await this.client.delete(`/platform/admins/${id}`);
  return data;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioscify-platform && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/lib/api.ts
git commit -m "feat(platform): add platform admin API client methods"
```

---

## Task 9: Add "Users" nav item to sidebar

**Files:**
- Modify: `kioscify-platform/app/(main)/layout.tsx`

- [ ] **Step 1: Add Users icon import and nav entry**

In `kioscify-platform/app/(main)/layout.tsx`, update the lucide-react import to include `Users`:

```typescript
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
} from 'lucide-react';
```

Then update `navItems` to include the Users entry between Companies and Settings:

```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioscify-platform && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/(main)/layout.tsx
git commit -m "feat(platform): add Users nav item to sidebar"
```

---

## Task 10: Build the Users management page

**Files:**
- Create: `kioscify-platform/app/(main)/users/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// kioscify-platform/app/(main)/users/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/types';
import { Plus, RotateCcw, Trash2, Copy, Check } from 'lucide-react';

// ─── Temp password modal ─────────────────────────────────────────────────────

function TempPasswordModal({
  password,
  onClose,
}: {
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Temporary Password</h3>
        <p className="text-sm text-amber-600 mb-4">
          This password will not be shown again. Share it via a secure channel.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2 mb-4">
          <code className="flex-1 text-sm font-mono text-gray-900 break-all">{password}</code>
          <button
            onClick={handleCopy}
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Create admin modal ───────────────────────────────────────────────────────

function CreateAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (password: string) => void;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', username: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.createPlatformAdmin(form);
      onCreated(result.temporaryPassword);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 409 ? 'Username already exists.' : 'Failed to create admin. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Platform Admin</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-md py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white rounded-md py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border rounded-md py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-md py-2 text-sm font-medium text-white transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (userStr) {
      try {
        setCurrentUserId(JSON.parse(userStr).id);
      } catch { /* ignore */ }
    }

    api.getPlatformAdmins()
      .then(setAdmins)
      .finally(() => setLoading(false));
  }, []);

  function refreshAdmins() {
    return api.getPlatformAdmins().then(setAdmins);
  }

  async function handleToggleActive(admin: User) {
    setTogglingId(admin.id);
    setActionError('');
    try {
      const updated = await api.updatePlatformAdmin(admin.id, { isActive: !admin.isActive });
      setAdmins(prev => prev.map(a => (a.id === updated.id ? { ...a, isActive: updated.isActive } : a)));
    } catch {
      setActionError('Failed to update status.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleResetPassword(admin: User) {
    setConfirmReset(null);
    setActionError('');
    try {
      const result = await api.resetPlatformAdminPassword(admin.id);
      setTempPassword(result.temporaryPassword);
      refreshAdmins();
    } catch {
      setActionError('Failed to reset password.');
    }
  }

  async function handleDelete(admin: User) {
    setConfirmDelete(null);
    setActionError('');
    try {
      await api.deletePlatformAdmin(admin.id);
      setAdmins(prev => prev.filter(a => a.id !== admin.id));
    } catch {
      setActionError('Failed to delete admin.');
    }
  }

  function handleCreated(password: string) {
    setShowCreate(false);
    setTempPassword(password);
    refreshAdmins();
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage platform admin accounts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      {actionError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : admins.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">No platform admins found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map(admin => {
                const isSelf = admin.id === currentUserId;
                return (
                  <tr key={admin.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {admin.firstName} {admin.lastName}
                      {isSelf && (
                        <span className="ml-2 text-xs text-indigo-500 font-normal">(you)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{admin.username}</td>
                    <td className="px-6 py-4 text-gray-600">{admin.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        admin.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        {!isSelf && (
                          <button
                            onClick={() => handleToggleActive(admin)}
                            disabled={togglingId === admin.id}
                            className="text-xs px-2.5 py-1 rounded border text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            {togglingId === admin.id
                              ? '...'
                              : admin.isActive
                              ? 'Disable'
                              : 'Enable'}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmReset(admin)}
                          title="Reset password"
                          className="p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => setConfirmDelete(admin)}
                            title="Delete admin"
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateAdminModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          password={tempPassword}
          onClose={() => setTempPassword(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete ${confirmDelete.firstName} ${confirmDelete.lastName} (${confirmDelete.username})? This cannot be undone.`}
          confirmLabel="Delete"
          confirmClass="bg-red-600 hover:bg-red-700"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          message={`Reset password for ${confirmReset.firstName} ${confirmReset.lastName}? They will be required to change it on next login.`}
          confirmLabel="Reset Password"
          confirmClass="bg-indigo-600 hover:bg-indigo-700"
          onConfirm={() => handleResetPassword(confirmReset)}
          onCancel={() => setConfirmReset(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioscify-platform && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/(main)/users/page.tsx
git commit -m "feat(platform): add Users management page with full CRUD for platform admins"
```

---

## Task 11: End-to-end smoke test

- [ ] **Step 1: Start API and platform portal**

In two terminals:
```bash
# Terminal 1
npm run api:dev

# Terminal 2
npm run platform:dev
```

- [ ] **Step 2: Smoke test all flows**

1. Open `http://localhost:3002`, log in as a platform admin
2. Click "Users" in the sidebar — verify the table loads with your own account marked "(you)"
3. Click "Add Admin" — fill in the form and submit — verify the temp password modal appears, copy the password
4. Log out, log in as the new admin using the temp password — verify redirect to `/change-password`
5. Back as original admin: find the new admin row — click "Disable" — verify status badge changes to Inactive
6. Click Enable — verify it goes back to Active
7. Click the reset password icon — confirm — verify temp password modal appears
8. Click the delete icon — confirm — verify the row is removed
9. Verify all action buttons are hidden on your own row (no Disable, no Delete)

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(platform): address smoke test findings"
```
