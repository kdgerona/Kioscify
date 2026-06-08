import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  async create(createPreferenceDto: CreatePreferenceDto, brandId: string) {
    const { id: providedId, name } = createPreferenceDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.preference.findUnique({ where: { id } });
      if (existing) throw new ConflictException('Preference with this ID already exists');
    }

    return this.prisma.preference.create({
      data: { id, name, brandId },
    });
  }

  async findAll(brandId: string) {
    return this.prisma.preference.findMany({
      where: { brandId, tombstone: { not: 1 } },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string, brandId?: string) {
    const preference = await this.prisma.preference.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
    });
    if (!preference) throw new NotFoundException(`Preference with ID ${id} not found`);
    return preference;
  }

  async update(id: string, updatePreferenceDto: UpdatePreferenceDto, brandId?: string) {
    const existing = await this.findOne(id, brandId);
    if (updatePreferenceDto.isDefault) {
      const targetBrandId = existing.brandId;
      return this.prisma.$transaction([
        this.prisma.preference.updateMany({
          where: { brandId: targetBrandId, id: { not: id } },
          data: { isDefault: false },
        }),
        this.prisma.preference.update({ where: { id }, data: updatePreferenceDto }),
      ]).then(([, updated]) => updated);
    }
    return this.prisma.preference.update({ where: { id }, data: updatePreferenceDto });
  }

  async remove(id: string, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.preference.update({ where: { id }, data: { tombstone: 1 } });
  }
}
