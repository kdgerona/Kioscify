/**
 * One-time migration script: move existing uploaded files from local disk to MinIO
 * and update all database URL references.
 *
 * Usage:
 *   npm run migrate:minio                 # live run
 *   npm run migrate:minio -- --dry-run   # preview only, no writes
 *
 * In production (run inside or against the container that has the old uploads volume):
 *   docker exec -it kioskly-api node dist/scripts/migrate-to-minio.js
 *   docker exec -it kioskly-api node dist/scripts/migrate-to-minio.js --dry-run
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DRY_RUN = process.argv.includes('--dry-run');

const prisma = new PrismaClient();

const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKET = process.env.MINIO_BUCKET || 'kioscify';
const PUBLIC_URL = (process.env.MINIO_PUBLIC_URL || 'http://kioscify.localhost/storage').replace(/\/$/, '');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

const stats = { migrated: 0, skipped: 0, alreadyMigrated: 0, errors: 0 };

function log(msg: string) {
  console.log(`[${DRY_RUN ? 'DRY-RUN' : 'LIVE'}] ${msg}`);
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.apk': 'application/vnd.android.package-archive',
  };
  return map[ext] || 'application/octet-stream';
}

function localPathFromStoredValue(value: string): string | null {
  // Already a MinIO storage URL — skip
  if (value.includes('/storage/')) return null;

  let localPath: string;
  if (value.startsWith('http')) {
    // e.g. https://kioscify.com/uploads/logos/brand-123.png
    try {
      const parsed = new URL(value);
      localPath = path.join(UPLOADS_DIR, '..', parsed.pathname);
    } catch {
      return null;
    }
  } else if (value.startsWith('/uploads/')) {
    // e.g. /uploads/logos/brand-123.png
    localPath = path.join(UPLOADS_DIR, '..', value);
  } else if (value.startsWith('uploads/')) {
    // e.g. uploads/apks/kioscify-123.apk
    localPath = path.join(UPLOADS_DIR, '..', value);
  } else {
    return null;
  }

  return localPath;
}

async function ensureBucketPublic() {
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    log(`Creating bucket: ${BUCKET}`);
    if (!DRY_RUN) await minio.makeBucket(BUCKET);
  }

  if (!DRY_RUN) {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${BUCKET}/*`],
        },
      ],
    };
    await minio.setBucketPolicy(BUCKET, JSON.stringify(policy));
  }
  log(`Bucket ready: ${BUCKET}`);
}

async function uploadFile(localPath: string, minioKey: string, mimetype: string): Promise<string> {
  const buffer = fs.readFileSync(localPath);
  if (!DRY_RUN) {
    await minio.putObject(BUCKET, minioKey, buffer, buffer.length, { 'Content-Type': mimetype });
  }
  return `${PUBLIC_URL}/${minioKey}`;
}

async function migrateField(
  entityName: string,
  entityId: string,
  field: string,
  value: string,
  minioFolder: string,
  onUpdate: (newUrl: string) => Promise<void>,
) {
  if (!value) return;

  if (value.includes('/storage/')) {
    log(`  SKIP (already migrated): ${entityName}[${entityId}].${field}`);
    stats.alreadyMigrated++;
    return;
  }

  const localPath = localPathFromStoredValue(value);
  if (!localPath) {
    log(`  SKIP (unrecognised format): ${entityName}[${entityId}].${field} = ${value}`);
    stats.skipped++;
    return;
  }

  if (!fs.existsSync(localPath)) {
    log(`  SKIP (file not found on disk): ${entityName}[${entityId}].${field} → ${localPath}`);
    stats.skipped++;
    return;
  }

  const filename = path.basename(localPath);
  const minioKey = `${minioFolder}/${filename}`;
  const mimetype = mimeFromFilename(filename);

  try {
    const newUrl = await uploadFile(localPath, minioKey, mimetype);
    log(`  MIGRATE: ${entityName}[${entityId}].${field}\n    ${value}\n    → ${newUrl}`);

    if (!DRY_RUN) {
      await onUpdate(newUrl);
    }
    stats.migrated++;
  } catch (err) {
    log(`  ERROR: ${entityName}[${entityId}].${field} — ${(err as Error).message}`);
    stats.errors++;
  }
}

async function migrateCompanies() {
  log('\n── Companies ──');
  const companies = await prisma.company.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, logoUrl: true },
  });
  for (const c of companies) {
    if (!c.logoUrl) continue;
    await migrateField('Company', c.id, 'logoUrl', c.logoUrl, 'logos', async (url) => {
      await prisma.company.update({ where: { id: c.id }, data: { logoUrl: url } });
    });
  }
}

async function migrateBrands() {
  log('\n── Brands ──');
  const brands = await prisma.brand.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, logoUrl: true },
  });
  for (const b of brands) {
    if (!b.logoUrl) continue;
    await migrateField('Brand', b.id, 'logoUrl', b.logoUrl, 'logos', async (url) => {
      await prisma.brand.update({ where: { id: b.id }, data: { logoUrl: url } });
    });
  }
}

async function migrateStores() {
  log('\n── Stores ──');
  const stores = await prisma.tenant.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, logoUrl: true },
  });
  for (const s of stores) {
    if (!s.logoUrl) continue;
    await migrateField('Store', s.id, 'logoUrl', s.logoUrl, 'logos', async (url) => {
      await prisma.tenant.update({ where: { id: s.id }, data: { logoUrl: url } });
    });
  }
}

async function migrateProducts() {
  log('\n── Products ──');
  const products = await prisma.product.findMany({
    where: { image: { not: null } },
    select: { id: true, image: true },
  });
  for (const p of products) {
    if (!p.image) continue;
    await migrateField('Product', p.id, 'image', p.image, 'products', async (url) => {
      await prisma.product.update({ where: { id: p.id }, data: { image: url } });
    });
  }
}

async function migrateAppReleases() {
  log('\n── AppReleases ──');
  const releases = await prisma.appRelease.findMany({
    select: { id: true, apkPath: true, apkUrl: true },
  });
  for (const r of releases) {
    // Use apkUrl for already-migrated detection; use apkPath to find the file
    if (r.apkUrl && r.apkUrl.includes('/storage/')) {
      log(`  SKIP (already migrated): AppRelease[${r.id}]`);
      stats.alreadyMigrated++;
      continue;
    }

    const localPath = localPathFromStoredValue(r.apkPath);
    if (!localPath) {
      log(`  SKIP (unrecognised format): AppRelease[${r.id}].apkPath = ${r.apkPath}`);
      stats.skipped++;
      continue;
    }

    if (!fs.existsSync(localPath)) {
      log(`  SKIP (file not found on disk): AppRelease[${r.id}] → ${localPath}`);
      stats.skipped++;
      continue;
    }

    const filename = path.basename(localPath);
    const minioKey = `apks/${filename}`;
    const mimetype = 'application/vnd.android.package-archive';

    try {
      const newUrl = await uploadFile(localPath, minioKey, mimetype);
      log(`  MIGRATE: AppRelease[${r.id}]\n    apkPath: ${r.apkPath} → apks/${filename}\n    apkUrl:  ${r.apkUrl} → ${newUrl}`);

      if (!DRY_RUN) {
        await prisma.appRelease.update({
          where: { id: r.id },
          data: { apkPath: minioKey, apkUrl: newUrl },
        });
      }
      stats.migrated++;
    } catch (err) {
      log(`  ERROR: AppRelease[${r.id}] — ${(err as Error).message}`);
      stats.errors++;
    }
  }
}

async function main() {
  log('Starting migration to MinIO...');
  if (DRY_RUN) log('DRY RUN — no files will be uploaded and no DB records will be updated.\n');

  await ensureBucketPublic();

  await migrateCompanies();
  await migrateBrands();
  await migrateStores();
  await migrateProducts();
  await migrateAppReleases();

  log('\n── Summary ──');
  log(`  Migrated:        ${stats.migrated}`);
  log(`  Already done:    ${stats.alreadyMigrated}`);
  log(`  Skipped:         ${stats.skipped}`);
  log(`  Errors:          ${stats.errors}`);

  if (stats.errors > 0) {
    log('\nSome files failed to migrate. Check the errors above and re-run to retry.');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
