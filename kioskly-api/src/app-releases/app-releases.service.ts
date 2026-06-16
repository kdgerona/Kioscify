// kioskly-api/src/app-releases/app-releases.service.ts
import {
  Injectable,
  InternalServerErrorException,
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

    let checksum: string;
    try {
      checksum = await this.computeSha256(file.path);
    } catch {
      fs.unlinkSync(file.path);
      throw new InternalServerErrorException('Failed to process uploaded file');
    }

    const relativePath = `uploads/apks/${file.filename}`;
    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const apkUrl = `${apiBaseUrl}/${relativePath}`;

    try {
      return await this.prisma.appRelease.create({
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
    } catch (err) {
      fs.unlinkSync(file.path);
      throw err;
    }
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

    // Delete DB record first. If this fails, both record and file survive (safe).
    // If file delete fails after, the stale file can be cleaned up separately.
    const deleted = await this.prisma.appRelease.delete({ where: { id } });

    const absolutePath = path.join(process.cwd(), existing.apkPath);
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch {
        // Log but do not fail — file cleanup is best-effort after DB delete
      }
    }

    return deleted;
  }
}
