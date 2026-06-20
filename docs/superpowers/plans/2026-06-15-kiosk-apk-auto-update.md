# Kiosk APK Auto-Update System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted APK update system: NestJS upload/version API, a platform portal management page, and in-app update checking + download + native installation on the Android kiosk app.

**Architecture:** The NestJS backend stores APK files under `uploads/apks/` (same static-serve pattern as logos), exposes a public `GET /app/version` endpoint returning the latest published release, and gates all upload/CRUD behind `@Roles('PLATFORM_ADMIN')`. The platform portal adds an "app-releases" page following the existing pure-Tailwind table+modal pattern. The Android app gains an `AppUpdateContext` that polls on startup/resume/30-min interval, shows a blocking or dismissible `UpdateDialog`, downloads via `expo-file-system`, and installs via a native Kotlin module that uses FileProvider.

**Tech Stack:** NestJS 10 + Prisma + MongoDB, multer diskStorage, Node crypto (SHA256); Next.js 15 App Router + Axios + Tailwind + Lucide; React Native 0.81.5 / Expo SDK 54, NativeWind v2, expo-file-system, expo-application, native Kotlin + FileProvider + streaming SHA-256 in Kotlin (no expo-crypto).

---

## File Map

### Backend (`kioskly-api/`)
| Action | File |
|---|---|
| Modify | `prisma/schema.prisma` |
| Create | `src/app-releases/app-releases.module.ts` |
| Create | `src/app-releases/app-releases.service.ts` |
| Create | `src/app-releases/app-releases.controller.ts` |
| Create | `src/app-releases/dto/create-app-release.dto.ts` |
| Create | `src/app-releases/dto/update-app-release.dto.ts` |
| Modify | `src/app.module.ts` |
| Modify | `.env` (add `API_BASE_URL`) |

### Platform Portal (`kioscify-platform/`)
| Action | File |
|---|---|
| Modify | `types/index.ts` |
| Modify | `lib/api.ts` |
| Create | `app/(main)/app-releases/page.tsx` |
| Modify | `app/(main)/layout.tsx` |

### Android App (`kioskly-app/`)
| Action | File |
|---|---|
| Modify | `package.json` / `yarn.lock` |
| Create | `android/app/src/main/java/com/kioscify/app/AppInstallerModule.kt` |
| Create | `android/app/src/main/java/com/kioscify/app/AppInstallerPackage.kt` |
| Modify | `android/app/src/main/java/com/kioscify/app/MainApplication.kt` |
| Modify | `android/app/src/main/AndroidManifest.xml` |
| Create | `android/app/src/main/res/xml/file_paths.xml` |
| Create | `utils/apkDownloader.ts` |
| Create | `utils/apkInstaller.ts` |
| Create | `contexts/AppUpdateContext.tsx` |
| Create | `components/UpdateDialog.tsx` |
| Modify | `app/_layout.tsx` |

---

## Task 0: Write Design Spec

**Files:**
- Create: `docs/superpowers/specs/2026-06-16-kiosk-apk-auto-update-design.md`

- [ ] **Step 1: Create the design spec**

Create `docs/superpowers/specs/2026-06-16-kiosk-apk-auto-update-design.md`:

```markdown
# Kiosk APK Auto-Update System — Design Spec

## Context
Kioscify distributes its Android kiosk app as a standalone APK outside Google Play.
This spec defines a self-hosted update mechanism: platform admins upload APKs, the app
polls for updates, and installs them with a blocking or dismissible dialog.

## Architecture

```
Platform Portal (Next.js)
  → POST /api/v1/app-releases (PLATFORM_ADMIN) — upload APK + metadata
  → PATCH/DELETE /api/v1/app-releases/:id     — manage releases

NestJS API
  → stores APK in uploads/apks/ (same static-serve as logos)
  → computes SHA-256 at upload time via Node crypto stream
  → GET /app/version (@Public) → latest PUBLISHED release by highest versionCode

Android Kiosk App
  → polls GET /app/version on startup / foreground / every 30 min
  → if server version_code > nativeBuildVersion → show UpdateDialog
  → expo-file-system downloads APK
  → Kotlin native module streams file to compute SHA-256, compares to server value
  → FileProvider intent launches system package installer
```

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| APK URL security | Public static URL | Internal distribution; randomized filename |
| Download mechanism | expo-file-system | Sufficient for foreground kiosk use |
| Checksum verification | Kotlin streaming SHA-256 | Avoids loading 100MB file into JS ArrayBuffer |
| Install mechanism | Kotlin FileProvider + Intent | Required for Android sideloading |
| Auth on CRUD | PLATFORM_ADMIN only | Portal-side management |
| Version selection | Highest versionCode PUBLISHED | Not latest createdAt |

## Data Model

```prisma
model AppRelease {
  id              String            @id @default(auto()) @map("_id") @db.ObjectId
  versionCode     Int
  versionName     String
  apkPath         String
  apkUrl          String
  fileSize        Int
  checksumSha256  String
  releaseNotes    String[]
  forceUpdate     Boolean           @default(false)
  status          AppReleaseStatus  @default(DRAFT)
  uploadedById    String?           @db.ObjectId
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  @@index([status, createdAt])
  @@map("app_releases")
}

enum AppReleaseStatus { DRAFT PUBLISHED }
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /app-releases | PLATFORM_ADMIN | Upload APK (multipart, 200 MB max) |
| GET | /app-releases | PLATFORM_ADMIN | List all releases |
| PATCH | /app-releases/:id | PLATFORM_ADMIN | Edit notes/status/forceUpdate |
| DELETE | /app-releases/:id | PLATFORM_ADMIN | Delete record + file |
| GET | /app/version | Public | Latest PUBLISHED release |

GET /app/version response:
```json
{
  "version_code": 5,
  "version_name": "1.0.5",
  "apk_url": "https://api.kioscify.com/uploads/apks/kioscify-1749999.apk",
  "force_update": true,
  "checksum_sha256": "abc123...",
  "release_notes": ["Added inventory sync", "Fixed cashier logout"]
}
```

## Android Update Flow

1. `AppUpdateContext` polls `GET /app/version` silently (never crashes app)
2. If `version_code > nativeBuildVersion`, store `updateInfo` in context state
3. `UpdateDialog` renders as transparent `<Modal>` over entire app
4. User taps "Update Now" → `expo-file-system` streams download with progress callback
5. After download: `AppInstallerModule.computeSha256(filePath)` → compare to `checksum_sha256`
6. Mismatch → show error, delete file, allow retry
7. Match → `AppInstallerModule.installApk(filePath)` → system installer launches
8. `force_update: true` → no "Later" button, `onRequestClose` is `undefined`

## Error Codes (DownloadError)
- `NO_INTERNET` — network unavailable
- `INSUFFICIENT_STORAGE` — ENOSPC
- `CHECKSUM_MISMATCH` — SHA-256 does not match server value
- `FAILED` — all other errors
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-16-kiosk-apk-auto-update-design.md
git commit -m "docs: add kiosk APK auto-update system design spec"
```

Expected: commit succeeds with no errors.

---

## Task 1: Prisma Schema — Add AppRelease Model

**Files:**
- Modify: `kioskly-api/prisma/schema.prisma`

- [ ] **Step 1: Add enum and model to schema.prisma**

Append the following block at the end of `prisma/schema.prisma`, before the closing (after `PlatformConfig`):

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// APP RELEASES — Kiosk Android APK distribution
// ─────────────────────────────────────────────────────────────────────────────

model AppRelease {
  id              String            @id @default(auto()) @map("_id") @db.ObjectId
  versionCode     Int               // Android versionCode (integer, monotonically increasing)
  versionName     String            // Human-readable version string e.g. "1.0.5"
  apkPath         String            // Relative path: /uploads/apks/<filename>
  apkUrl          String            // Full URL for download by the Android app
  fileSize        Int               // Bytes
  checksumSha256  String            // SHA-256 hex of the APK file
  releaseNotes    String[]          // Array of release note strings
  forceUpdate     Boolean           @default(false)
  status          AppReleaseStatus  @default(DRAFT)
  uploadedById    String?           @db.ObjectId  // User.id of the PLATFORM_ADMIN who uploaded
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([status, createdAt])
  @@map("app_releases")
}

enum AppReleaseStatus {
  DRAFT
  PUBLISHED
}
```

- [ ] **Step 2: Regenerate Prisma Client**

Run from the project root:
```bash
npm run prisma:generate --workspace=kioskly-api
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/prisma/schema.prisma
git commit -m "feat(api): add AppRelease model and AppReleaseStatus enum to Prisma schema"
```

---

## Task 2: App Releases DTOs and Module Scaffold

**Files:**
- Create: `kioskly-api/src/app-releases/dto/create-app-release.dto.ts`
- Create: `kioskly-api/src/app-releases/dto/update-app-release.dto.ts`
- Create: `kioskly-api/src/app-releases/app-releases.module.ts`
- Modify: `kioskly-api/src/app.module.ts`

- [ ] **Step 1: Create create-app-release.dto.ts**

```typescript
// kioskly-api/src/app-releases/dto/create-app-release.dto.ts
import { IsString, IsInt, IsBoolean, IsEnum, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export enum AppReleaseStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export class CreateAppReleaseDto {
  @IsString()
  versionName: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  versionCode: number;

  // Frontend sends JSON.stringify(string[]) as a form field
  @Transform(({ value }) => {
    try { return JSON.parse(value); } catch { return []; }
  })
  @IsArray()
  @IsString({ each: true })
  releaseNotes: string[];

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  forceUpdate: boolean;

  @IsEnum(AppReleaseStatus)
  status: AppReleaseStatus;
}
```

- [ ] **Step 2: Create update-app-release.dto.ts**

```typescript
// kioskly-api/src/app-releases/dto/update-app-release.dto.ts
import { IsString, IsBoolean, IsEnum, IsArray, IsOptional } from 'class-validator';

export class UpdateAppReleaseDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  releaseNotes?: string[];

  @IsBoolean()
  @IsOptional()
  forceUpdate?: boolean;

  @IsEnum({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' })
  @IsOptional()
  status?: string;
}
```

- [ ] **Step 3: Create app-releases.module.ts**

```typescript
// kioskly-api/src/app-releases/app-releases.module.ts
import { Module } from '@nestjs/common';
import { AppReleasesService } from './app-releases.service';
import { AppReleasesController } from './app-releases.controller';
import { AppVersionController } from './app-releases.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppReleasesController, AppVersionController],
  providers: [AppReleasesService],
})
export class AppReleasesModule {}
```

- [ ] **Step 4: Register in app.module.ts**

In `kioskly-api/src/app.module.ts`, add the import at the top:
```typescript
import { AppReleasesModule } from './app-releases/app-releases.module';
```

And add `AppReleasesModule` to the `imports` array under "Store operations" (or as a new section):
```typescript
// Kiosk app management
AppReleasesModule,
```

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/app-releases/ kioskly-api/src/app.module.ts
git commit -m "feat(api): scaffold app-releases module with DTOs"
```

---

## Task 3: App Releases Service

**Files:**
- Create: `kioskly-api/src/app-releases/app-releases.service.ts`
- Modify: `kioskly-api/.env` (add `API_BASE_URL`)

- [ ] **Step 1: Add API_BASE_URL to .env**

Add to `kioskly-api/.env`:
```env
API_BASE_URL=http://localhost:3000
```

In production this should be the public API URL, e.g. `https://api.kioscify.com`.

- [ ] **Step 2: Create app-releases.service.ts**

```typescript
// kioskly-api/src/app-releases/app-releases.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppReleaseDto } from './dto/create-app-release.dto';
import { UpdateAppReleaseDto } from './dto/update-app-release.dto';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AppReleasesService {
  constructor(private readonly prisma: PrismaService) {}

  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async create(
    file: Express.Multer.File,
    dto: CreateAppReleaseDto,
    uploadedById: string,
  ) {
    const existing = await this.prisma.appRelease.findFirst({
      where: { versionCode: dto.versionCode },
    });
    if (existing) {
      fs.unlinkSync(file.path);
      throw new BadRequestException(
        `Version code ${dto.versionCode} already exists`,
      );
    }

    const checksum = await this.computeSha256(file.path);
    const relativePath = `/uploads/apks/${file.filename}`;
    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const apkUrl = `${apiBaseUrl}${relativePath}`;

    return this.prisma.appRelease.create({
      data: {
        versionCode: dto.versionCode,
        versionName: dto.versionName,
        apkPath: relativePath,
        apkUrl,
        fileSize: file.size,
        checksumSha256: checksum,
        releaseNotes: dto.releaseNotes,
        forceUpdate: dto.forceUpdate,
        status: dto.status,
        uploadedById,
      },
    });
  }

  findAll() {
    return this.prisma.appRelease.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findLatestPublished() {
    const release = await this.prisma.appRelease.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { versionCode: 'desc' },
    });
    if (!release) {
      throw new NotFoundException('No published release found');
    }
    return {
      version_code: release.versionCode,
      version_name: release.versionName,
      apk_url: release.apkUrl,
      force_update: release.forceUpdate,
      checksum_sha256: release.checksumSha256,
      release_notes: release.releaseNotes,
    };
  }

  async update(id: string, dto: UpdateAppReleaseDto) {
    const existing = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Release not found');
    return this.prisma.appRelease.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Release not found');

    const absolutePath = path.join(process.cwd(), existing.apkPath);
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);

    return this.prisma.appRelease.delete({ where: { id } });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/app-releases/app-releases.service.ts kioskly-api/.env
git commit -m "feat(api): implement AppReleasesService with SHA-256 checksum and file management"
```

---

## Task 4: App Releases Controller

**Files:**
- Modify: `kioskly-api/src/app-releases/app-releases.module.ts` (fix imports after creating controller)
- Create: `kioskly-api/src/app-releases/app-releases.controller.ts`

- [ ] **Step 1: Create app-releases.controller.ts**

```typescript
// kioskly-api/src/app-releases/app-releases.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AppReleasesService } from './app-releases.service';
import { CreateAppReleaseDto } from './dto/create-app-release.dto';
import { UpdateAppReleaseDto } from './dto/update-app-release.dto';

@ApiTags('app-releases')
@Controller('app-releases')
export class AppReleasesController {
  constructor(private readonly appReleasesService: AppReleasesService) {}

  @Post()
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new APK release' })
  @UseInterceptors(
    FileInterceptor('apk', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = './uploads/apks';
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, `kioscify-${Date.now()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = [
          'application/vnd.android.package-archive',
          'application/octet-stream',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Only APK files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAppReleaseDto,
    @Request() req,
  ) {
    if (!file) throw new BadRequestException('APK file is required');
    return this.appReleasesService.create(file, dto, req.user.id);
  }

  @Get()
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all APK releases' })
  findAll() {
    return this.appReleasesService.findAll();
  }

  @Patch(':id')
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update release metadata' })
  update(@Param('id') id: string, @Body() dto: UpdateAppReleaseDto) {
    return this.appReleasesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a release and its APK file' })
  remove(@Param('id') id: string) {
    return this.appReleasesService.remove(id);
  }
}

@ApiTags('app')
@Controller('app')
export class AppVersionController {
  constructor(private readonly appReleasesService: AppReleasesService) {}

  @Get('version')
  @Public()
  @ApiOperation({ summary: 'Get latest published APK version (used by kiosk app)' })
  getLatestVersion() {
    return this.appReleasesService.findLatestPublished();
  }
}
```

- [ ] **Step 2: Verify the module imports both controllers**

Confirm `app-releases.module.ts` has:
```typescript
import { AppReleasesController, AppVersionController } from './app-releases.controller';
// ...
controllers: [AppReleasesController, AppVersionController],
```

- [ ] **Step 3: Start API and verify in Swagger**

```bash
npm run api:dev
```

Open `http://localhost:3000/api/v1/docs`. Verify:
- `POST /api/v1/app-releases` is listed under `app-releases` tag
- `GET /api/v1/app-releases` is listed
- `GET /api/v1/app/version` is listed under `app` tag
- `GET /api/v1/app/version` returns 404 when no published release exists

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/src/app-releases/
git commit -m "feat(api): add AppReleasesController and AppVersionController with multer APK upload"
```

---

## Task 5: Platform Portal — Types and API Methods

**Files:**
- Modify: `kioscify-platform/types/index.ts`
- Modify: `kioscify-platform/lib/api.ts`

- [ ] **Step 1: Add AppRelease type to types/index.ts**

At the end of `kioscify-platform/types/index.ts`, append:

```typescript
export interface AppRelease {
  id: string;
  versionCode: number;
  versionName: string;
  apkPath: string;
  apkUrl: string;
  fileSize: number;
  checksumSha256: string;
  releaseNotes: string[];
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  uploadedById?: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add API methods to lib/api.ts**

In `kioscify-platform/lib/api.ts`, find the section for platform admins (e.g., after `deletePlatformAdmin`) and add:

```typescript
// App Releases
async getAppReleases(): Promise<AppRelease[]> {
  const { data } = await this.client.get<AppRelease[]>('/app-releases');
  return data;
}

async uploadAppRelease(formData: FormData): Promise<AppRelease> {
  const { data } = await this.client.post<AppRelease>('/app-releases', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

async updateAppRelease(
  id: string,
  payload: { releaseNotes?: string[]; forceUpdate?: boolean; status?: string },
): Promise<AppRelease> {
  const { data } = await this.client.patch<AppRelease>(`/app-releases/${id}`, payload);
  return data;
}

async deleteAppRelease(id: string): Promise<void> {
  await this.client.delete(`/app-releases/${id}`);
}
```

Add the `AppRelease` import at the top of `lib/api.ts`:
```typescript
import type { ..., AppRelease } from '@/types';
```
(Add `AppRelease` to the existing named import from `@/types`.)

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/types/index.ts kioscify-platform/lib/api.ts
git commit -m "feat(platform): add AppRelease type and API methods"
```

---

## Task 6: Platform Portal — APK Management Page

**Files:**
- Create: `kioscify-platform/app/(main)/app-releases/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// kioscify-platform/app/(main)/app-releases/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { AppRelease } from '@/types';
import { Plus, Pencil, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';

const UPLOAD_MAX_SIZE = 200 * 1024 * 1024; // 200 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'PUBLISHED'
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-500';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

interface UploadForm {
  versionName: string;
  versionCode: string;
  releaseNotes: string;
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
}

const defaultUploadForm: UploadForm = {
  versionName: '',
  versionCode: '',
  releaseNotes: '',
  forceUpdate: false,
  status: 'DRAFT',
};

interface EditForm {
  releaseNotes: string;
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
}

export default function AppReleasesPage() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadForm>(defaultUploadForm);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editTarget, setEditTarget] = useState<AppRelease | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    releaseNotes: '',
    forceUpdate: false,
    status: 'DRAFT',
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AppRelease | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadReleases() {
    setLoading(true);
    try {
      setReleases(await api.getAppReleases());
    } catch {
      toast.error('Failed to load releases');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReleases(); }, []);

  function openEdit(release: AppRelease) {
    setEditTarget(release);
    setEditForm({
      releaseNotes: release.releaseNotes.join('\n'),
      forceUpdate: release.forceUpdate,
      status: release.status,
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError('');

    if (!apkFile) { setUploadError('Please select an APK file'); return; }
    if (apkFile.size > UPLOAD_MAX_SIZE) {
      setUploadError('File too large (max 200 MB)');
      return;
    }
    if (!uploadForm.versionName.trim()) {
      setUploadError('Version name is required');
      return;
    }
    if (!uploadForm.versionCode || isNaN(parseInt(uploadForm.versionCode))) {
      setUploadError('Version code must be a number');
      return;
    }

    const formData = new FormData();
    formData.append('apk', apkFile);
    formData.append('versionName', uploadForm.versionName);
    formData.append('versionCode', uploadForm.versionCode);
    formData.append(
      'releaseNotes',
      JSON.stringify(
        uploadForm.releaseNotes.split('\n').map((l) => l.trim()).filter(Boolean),
      ),
    );
    formData.append('forceUpdate', String(uploadForm.forceUpdate));
    formData.append('status', uploadForm.status);

    setUploading(true);
    try {
      await api.uploadAppRelease(formData);
      toast.success('APK uploaded successfully');
      setShowUpload(false);
      setUploadForm(defaultUploadForm);
      setApkFile(null);
      await loadReleases();
    } catch (err: any) {
      setUploadError(err?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.updateAppRelease(editTarget.id, {
        releaseNotes: editForm.releaseNotes
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        forceUpdate: editForm.forceUpdate,
        status: editForm.status,
      });
      toast.success('Release updated');
      setEditTarget(null);
      await loadReleases();
    } catch {
      toast.error('Failed to update release');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteAppRelease(deleteTarget.id);
      toast.success('Release deleted');
      setDeleteTarget(null);
      await loadReleases();
    } catch {
      toast.error('Failed to delete release');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiosk App</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage APK releases for the Kioscify Kiosk Android app
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Upload APK
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : releases.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No APK releases yet. Upload one to get started.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Version Name', 'Version Code', 'File Size', 'Force Update', 'Status', 'Uploaded', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {releases.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {r.versionName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.versionCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatBytes(r.fileSize)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.forceUpdate ? (
                      <span className="text-red-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={r.apkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Download APK"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">Upload New APK</h2>
              <button
                onClick={() => { setShowUpload(false); setUploadError(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpload} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  APK File <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={(e) => setApkFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  required
                />
                {apkFile && (
                  <p className="text-xs text-gray-400 mt-1">
                    {apkFile.name} — {formatBytes(apkFile.size)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Version Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1.0.5"
                    value={uploadForm.versionName}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, versionName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Version Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5"
                    value={uploadForm.versionCode}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, versionCode: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Release Notes (one per line)
                </label>
                <textarea
                  rows={4}
                  placeholder="Added inventory sync&#10;Fixed cashier logout issue"
                  value={uploadForm.releaseNotes}
                  onChange={(e) =>
                    setUploadForm((f) => ({ ...f, releaseNotes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadForm.forceUpdate}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, forceUpdate: e.target.checked }))
                    }
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">Force Update</span>
                </label>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={uploadForm.status}
                    onChange={(e) =>
                      setUploadForm((f) => ({
                        ...f,
                        status: e.target.value as 'DRAFT' | 'PUBLISHED',
                      }))
                    }
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              {uploadError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
                  {uploadError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadError(''); }}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">
                Edit Release — {editTarget.versionName}
              </h2>
              <button
                onClick={() => setEditTarget(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Release Notes (one per line)
                </label>
                <textarea
                  rows={4}
                  value={editForm.releaseNotes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, releaseNotes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.forceUpdate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, forceUpdate: e.target.checked }))
                    }
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">Force Update</span>
                </label>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        status: e.target.value as 'DRAFT' | 'PUBLISHED',
                      }))
                    }
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Delete Release?</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete{' '}
              <strong>{deleteTarget.versionName}</strong> and its APK file. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test the page**

Start the platform portal:
```bash
npm run platform:dev
```

Login as PLATFORM_ADMIN, navigate to `/app-releases`. Verify:
- Table renders empty state correctly
- Upload modal opens and validates fields
- Uploading an APK succeeds and the table refreshes
- Edit modal opens with existing data
- Delete confirmation deletes the release

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/(main)/app-releases/
git commit -m "feat(platform): add Kiosk App APK management page"
```

---

## Task 7: Platform Portal — Sidebar Navigation

**Files:**
- Modify: `kioscify-platform/app/(main)/layout.tsx`

- [ ] **Step 1: Add Kiosk App nav item**

In `kioscify-platform/app/(main)/layout.tsx`, update the imports to add `Smartphone`:

```typescript
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  Smartphone,
} from 'lucide-react';
```

Update `navItems` to include the new item:

```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/app-releases', label: 'Kiosk App', icon: Smartphone },
  { href: '/settings', label: 'Settings', icon: Settings },
];
```

- [ ] **Step 2: Verify navigation**

Confirm the "Kiosk App" link appears in the sidebar and navigates to the APK management page.

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/(main)/layout.tsx
git commit -m "feat(platform): add Kiosk App nav item to platform sidebar"
```

---

## Task 8: Android App — Install Required Packages

**Files:**
- Modify: `kioskly-app/package.json` and `yarn.lock`

- [ ] **Step 1: Install packages**

```bash
cd kioskly-app
npx expo install expo-file-system expo-application
```

Expected: packages added to `dependencies` in `package.json`. Do NOT install `expo-crypto` — SHA-256 is handled by the Kotlin native module to avoid loading large APK files into a JS ArrayBuffer.

- [ ] **Step 2: Verify installation**

```bash
npx expo install --check
```

Expected: no peer dependency warnings for the new packages.

- [ ] **Step 3: Commit**

```bash
cd kioskly-app
git add package.json yarn.lock
git commit -m "feat(app): install expo-file-system and expo-application for APK update system"
```

---

## Task 9: Android App — Native APK Installer Module

**Files:**
- Create: `kioskly-app/android/app/src/main/res/xml/file_paths.xml`
- Modify: `kioskly-app/android/app/src/main/AndroidManifest.xml`
- Create: `kioskly-app/android/app/src/main/java/com/kioscify/app/AppInstallerModule.kt`
- Create: `kioskly-app/android/app/src/main/java/com/kioscify/app/AppInstallerPackage.kt`
- Modify: `kioskly-app/android/app/src/main/java/com/kioscify/app/MainApplication.kt`

- [ ] **Step 1: Create file_paths.xml**

Create `kioskly-app/android/app/src/main/res/xml/file_paths.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <files-path name="files" path="." />
    <cache-path name="cache" path="." />
    <external-files-path name="external_files" path="." />
</paths>
```

- [ ] **Step 2: Update AndroidManifest.xml**

In `kioskly-app/android/app/src/main/AndroidManifest.xml`, add the following permission with the existing `<uses-permission>` block:

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

Add the FileProvider inside the `<application>` tag (before the closing `</application>`):

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

- [ ] **Step 3: Create AppInstallerModule.kt**

```kotlin
// kioskly-app/android/app/src/main/java/com/kioscify/app/AppInstallerModule.kt
package com.kioscify.app

import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.security.MessageDigest

class AppInstallerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AppInstaller"

    @ReactMethod
    fun computeSha256(filePath: String, promise: Promise) {
        try {
            val cleanPath = filePath.removePrefix("file://")
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File not found at: $cleanPath")
                return
            }
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { stream ->
                val buffer = ByteArray(8192)
                var bytes: Int
                while (stream.read(buffer).also { bytes = it } != -1) {
                    digest.update(buffer, 0, bytes)
                }
            }
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            promise.resolve(hex)
        } catch (e: Exception) {
            promise.reject("CHECKSUM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun installApk(filePath: String, promise: Promise) {
        try {
            val cleanPath = filePath.removePrefix("file://")
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file not found at: $cleanPath")
                return
            }
            val uri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                file,
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", e.message, e)
        }
    }
}
```

- [ ] **Step 4: Create AppInstallerPackage.kt**

```kotlin
// kioskly-app/android/app/src/main/java/com/kioscify/app/AppInstallerPackage.kt
package com.kioscify.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AppInstallerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(AppInstallerModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```

- [ ] **Step 5: Register in MainApplication.kt**

In `kioskly-app/android/app/src/main/java/com/kioscify/app/MainApplication.kt`, update the `getPackages()` lambda to register the new package:

```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(AppInstallerPackage())
    }
```

- [ ] **Step 6: Commit**

```bash
git add \
  kioskly-app/android/app/src/main/res/xml/file_paths.xml \
  kioskly-app/android/app/src/main/AndroidManifest.xml \
  kioskly-app/android/app/src/main/java/com/kioscify/app/AppInstallerModule.kt \
  kioskly-app/android/app/src/main/java/com/kioscify/app/AppInstallerPackage.kt \
  kioskly-app/android/app/src/main/java/com/kioscify/app/MainApplication.kt
git commit -m "feat(app): add native AppInstaller Kotlin module with FileProvider for APK installation"
```

---

## Task 10: Android App — APK Downloader Utility

**Files:**
- Create: `kioskly-app/utils/apkDownloader.ts`
- Create: `kioskly-app/utils/apkInstaller.ts`

- [ ] **Step 1: Create apkDownloader.ts**

```typescript
// kioskly-app/utils/apkDownloader.ts
import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';

const { AppInstaller } = NativeModules;

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_INTERNET' | 'INSUFFICIENT_STORAGE' | 'CHECKSUM_MISMATCH' | 'FAILED',
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export async function downloadApk(
  url: string,
  expectedChecksum: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const fileUri = `${FileSystem.documentDirectory}kioscify-update.apk`;

  // Remove any incomplete previous download
  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (progress) => {
      if (progress.totalBytesExpectedToWrite > 0) {
        onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    },
  );

  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg.includes('Network') || msg.includes('network') || msg.includes('internet')) {
      throw new DownloadError('No internet connection', 'NO_INTERNET');
    }
    if (msg.includes('storage') || msg.includes('space') || msg.includes('ENOSPC')) {
      throw new DownloadError('Not enough storage space', 'INSUFFICIENT_STORAGE');
    }
    throw new DownloadError(msg || 'Download failed', 'FAILED');
  }

  if (!result || result.status !== 200) {
    throw new DownloadError('Download failed — server returned an error', 'FAILED');
  }

  // Verify integrity via streaming SHA-256 in Kotlin (avoids loading large file into JS)
  const actualChecksum: string = await AppInstaller.computeSha256(result.uri);
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new DownloadError('APK checksum mismatch — file may be corrupted', 'CHECKSUM_MISMATCH');
  }

  return result.uri;
}
```

- [ ] **Step 2: Create apkInstaller.ts**

```typescript
// kioskly-app/utils/apkInstaller.ts
import { NativeModules } from 'react-native';

const { AppInstaller } = NativeModules;

export async function installApk(filePath: string): Promise<void> {
  if (!AppInstaller) {
    throw new Error('AppInstaller native module is not available');
  }
  await AppInstaller.installApk(filePath);
}
```

- [ ] **Step 3: Commit**

```bash
git add kioskly-app/utils/apkDownloader.ts kioskly-app/utils/apkInstaller.ts
git commit -m "feat(app): add APK downloader utility with progress tracking and error handling"
```

---

## Task 11: Android App — AppUpdateContext

**Files:**
- Create: `kioskly-app/contexts/AppUpdateContext.tsx`

- [ ] **Step 1: Create AppUpdateContext.tsx**

```typescript
// kioskly-app/contexts/AppUpdateContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Application from 'expo-application';
import { apiGet } from '@/utils/api';
import { downloadApk } from '@/utils/apkDownloader';
import { installApk } from '@/utils/apkInstaller';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export interface UpdateInfo {
  version_code: number;
  version_name: string;
  apk_url: string;
  force_update: boolean;
  checksum_sha256: string;
  release_notes: string[];
}

interface AppUpdateContextValue {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  dismissUpdate: () => void;
  downloadAndInstall: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentVersionCode = parseInt(
    Application.nativeBuildVersion ?? '0',
    10,
  );

  const checkForUpdates = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const data = await apiGet<UpdateInfo>('/app/version');
      if (data.version_code > currentVersionCode) {
        setUpdateInfo(data);
      }
    } catch {
      // Silently fail — update check must never crash the app
    } finally {
      setIsChecking(false);
    }
  };

  const dismissUpdate = () => {
    if (updateInfo?.force_update) return; // Cannot dismiss force updates
    setUpdateInfo(null);
    setError(null);
  };

  const downloadAndInstall = async () => {
    if (!updateInfo || isDownloading) return;
    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);
    try {
      const filePath = await downloadApk(updateInfo.apk_url, updateInfo.checksum_sha256, setDownloadProgress);
      await installApk(filePath);
    } catch (e: any) {
      setError(e?.message ?? 'Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    checkForUpdates();

    intervalRef.current = setInterval(checkForUpdates, UPDATE_INTERVAL_MS);

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const wasBackground = appStateRef.current.match(/inactive|background/);
        if (wasBackground && nextState === 'active') {
          checkForUpdates();
        }
        appStateRef.current = nextState;
      },
    );

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, []);

  return (
    <AppUpdateContext.Provider
      value={{
        updateInfo,
        isChecking,
        isDownloading,
        downloadProgress,
        error,
        checkForUpdates,
        dismissUpdate,
        downloadAndInstall,
      }}
    >
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used inside AppUpdateProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-app/contexts/AppUpdateContext.tsx
git commit -m "feat(app): add AppUpdateContext with startup/resume/interval update checks"
```

---

## Task 12: Android App — UpdateDialog Component

**Files:**
- Create: `kioskly-app/components/UpdateDialog.tsx`

- [ ] **Step 1: Create UpdateDialog.tsx**

```typescript
// kioskly-app/components/UpdateDialog.tsx
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Application from 'expo-application';
import { useAppUpdate } from '@/contexts/AppUpdateContext';

export default function UpdateDialog() {
  const {
    updateInfo,
    isDownloading,
    downloadProgress,
    error,
    dismissUpdate,
    downloadAndInstall,
  } = useAppUpdate();

  if (!updateInfo) return null;

  const currentVersion = Application.nativeApplicationVersion ?? '—';
  const progressPct = Math.round(downloadProgress * 100);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={updateInfo.force_update ? undefined : dismissUpdate}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 24,
          }}
        >
          <Text
            style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 }}
          >
            Update Available
          </Text>
          <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
            A new version of Kioscify is ready to install.
          </Text>

          {/* Version info */}
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}
            >
              <Text style={{ fontSize: 13, color: '#6B7280' }}>Current Version</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#111827' }}>
                {currentVersion}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: '#6B7280' }}>New Version</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669' }}>
                {updateInfo.version_name}
              </Text>
            </View>
          </View>

          {/* Release notes */}
          {updateInfo.release_notes.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}
              >
                {"What's New:"}
              </Text>
              {updateInfo.release_notes.map((note, i) => (
                <Text
                  key={i}
                  style={{ fontSize: 13, color: '#4B5563', marginBottom: 2 }}
                >
                  {'• '}{note}
                </Text>
              ))}
            </View>
          )}

          {/* Error */}
          {error ? (
            <Text
              style={{
                fontSize: 12,
                color: '#DC2626',
                backgroundColor: '#FEF2F2',
                borderRadius: 6,
                padding: 8,
                marginBottom: 12,
              }}
            >
              {error}
            </Text>
          ) : null}

          {/* Download progress */}
          {isDownloading ? (
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <ActivityIndicator size="large" color="#EA580C" />
              <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>
                Downloading… {progressPct}%
              </Text>
              {/* Progress bar */}
              <View
                style={{
                  width: '100%',
                  height: 4,
                  backgroundColor: '#E5E7EB',
                  borderRadius: 2,
                  marginTop: 8,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    backgroundColor: '#EA580C',
                  }}
                />
              </View>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                onPress={downloadAndInstall}
                style={{
                  backgroundColor: '#EA580C',
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {error ? 'Retry Update' : 'Update Now'}
                </Text>
              </TouchableOpacity>

              {!updateInfo.force_update && (
                <TouchableOpacity
                  onPress={dismissUpdate}
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#6B7280', fontSize: 14 }}>Later</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {updateInfo.force_update && (
            <Text
              style={{
                fontSize: 11,
                color: '#9CA3AF',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              This update is required to continue using the app.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-app/components/UpdateDialog.tsx
git commit -m "feat(app): add UpdateDialog component with force/optional update flow and progress bar"
```

---

## Task 13: Android App — Wire Up and Rebuild

**Files:**
- Modify: `kioskly-app/app/_layout.tsx`

- [ ] **Step 1: Update _layout.tsx**

In `kioskly-app/app/_layout.tsx`, add the imports:

```typescript
import { AppUpdateProvider } from '../contexts/AppUpdateContext';
import UpdateDialog from '../components/UpdateDialog';
```

Update `AppNavigator` to render `UpdateDialog`:

```typescript
function AppNavigator() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <UpdateDialog />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="tenant-setup" />
        <Stack.Screen name="store-picker" />
        <Stack.Screen name="home" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="transactions" />
        <Stack.Screen name="shift-report" />
      </Stack>
    </View>
  );
}
```

Wrap `AppNavigator` with `AppUpdateProvider` in `RootLayout`:

```typescript
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <TenantProvider>
      <AuthProvider>
        <SyncProvider>
          <AppUpdateProvider>
            <AppNavigator />
          </AppUpdateProvider>
        </SyncProvider>
      </AuthProvider>
    </TenantProvider>
  </GestureHandlerRootView>
);
```

- [ ] **Step 2: Build and run on Android**

Since native Kotlin modules were added, a full rebuild is required:

```bash
cd kioskly-app
npx expo run:android
```

Expected: app builds and installs successfully on the device/emulator.

- [ ] **Step 3: End-to-end test**

1. In the platform portal, upload an APK with `versionCode` higher than the app's current build version, and set status to `PUBLISHED`.
2. Launch the kiosk app on Android.
3. Verify the update dialog appears within a few seconds.
4. If `force_update` is `true`, verify the dialog cannot be dismissed.
5. Tap "Update Now", verify the progress bar updates during download.
6. Verify the Android system package installer launches after download completes.

- [ ] **Step 4: Commit**

```bash
git add kioskly-app/app/_layout.tsx
git commit -m "feat(app): wire AppUpdateProvider and UpdateDialog into root layout"
```

---

## Verification Checklist

### Backend
- [ ] `GET /api/v1/app/version` returns 404 when no PUBLISHED release exists
- [ ] `GET /api/v1/app/version` returns the highest `versionCode` PUBLISHED release (not just latest by date)
- [ ] `POST /api/v1/app-releases` rejects non-APK file types with 400
- [ ] `POST /api/v1/app-releases` rejects duplicate `versionCode` with 400
- [ ] Uploaded APK is accessible via `GET /uploads/apks/<filename>`
- [ ] `DELETE /api/v1/app-releases/:id` removes both DB record and file from disk

### Platform Portal
- [ ] APK Management page is accessible at `/app-releases` (PLATFORM_ADMIN only)
- [ ] Upload form validates file type, version name, and version code before submitting
- [ ] Table shows version, file size, force update flag, and status badge
- [ ] Edit modal updates status from DRAFT → PUBLISHED
- [ ] Download icon links to the APK file URL

### Android App
- [ ] App checks for updates on launch
- [ ] No crash when API returns 404 (no published release)
- [ ] No crash when device is offline
- [ ] Update dialog appears when server `version_code` > app `BuildConfig.VERSION_CODE`
- [ ] Force update dialog has no "Later" button and cannot be dismissed with back button
- [ ] Download progress bar animates from 0 to 100%
- [ ] System package installer launches after download completes
- [ ] Error message appears if download fails, with retry option
- [ ] Corrupted download (checksum mismatch) shows error and does NOT launch installer
