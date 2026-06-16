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
