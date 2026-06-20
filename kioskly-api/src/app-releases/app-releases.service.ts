import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateAppReleaseDto } from './dto/create-app-release.dto';
import { UpdateAppReleaseDto } from './dto/update-app-release.dto';
import * as crypto from 'crypto';
import { extname } from 'path';

@Injectable()
export class AppReleasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
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
      throw new BadRequestException(
        `Version code ${dto.versionCode} already exists`,
      );
    }

    let checksum: string;
    try {
      checksum = this.computeSha256(file.buffer);
    } catch {
      throw new InternalServerErrorException('Failed to process uploaded file');
    }

    const filename = `kioscify-${Date.now()}${extname(file.originalname)}`;
    let apkUrl: string;
    try {
      apkUrl = await this.storage.upload('apks', filename, file.buffer, file.mimetype);
    } catch {
      throw new InternalServerErrorException('Failed to upload file to storage');
    }

    const apkPath = `apks/${filename}`;

    return this.prisma.appRelease.create({
      data: {
        versionCode: dto.versionCode,
        versionName: dto.versionName,
        apkPath,
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

    // Delete DB record first. If this fails, both record and file survive (safe).
    const deleted = await this.prisma.appRelease.delete({ where: { id } });

    // Delete from MinIO — best-effort after DB delete
    await this.storage.delete(existing.apkUrl);

    return deleted;
  }
}
