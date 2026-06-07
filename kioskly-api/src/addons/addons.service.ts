import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';

@Injectable()
export class AddonsService {
  constructor(private prisma: PrismaService) {}

  async create(createAddonDto: CreateAddonDto, brandId: string) {
    const { id: providedId, name, price, foodpandaPrice, grabPrice } = createAddonDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.addon.findUnique({ where: { id } });
      if (existing) throw new ConflictException('Addon with this ID already exists');
    }

    return this.prisma.addon.create({
      data: { id, name, price, foodpandaPrice, grabPrice, brandId },
    });
  }

  async findAll(brandId: string) {
    return this.prisma.addon.findMany({
      where: { brandId, tombstone: { not: 1 } },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string, brandId?: string) {
    const addon = await this.prisma.addon.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
    });
    if (!addon) throw new NotFoundException(`Addon with ID ${id} not found`);
    return addon;
  }

  async update(id: string, updateAddonDto: UpdateAddonDto, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.addon.update({ where: { id }, data: updateAddonDto });
  }

  async remove(id: string, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.addon.update({ where: { id }, data: { tombstone: 1 } });
  }
}
