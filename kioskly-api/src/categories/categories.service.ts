import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, brandId: string) {
    return this.prisma.category.create({
      data: {
        id: randomUUID(),
        name: dto.name,
        description: dto.description,
        brandId,
        sequenceNo: dto.sequenceNo ?? 0,
        type: dto.type ?? 'PRODUCT',
      },
    });
  }

  async findAll(brandId: string, type?: 'PRODUCT' | 'INVENTORY') {
    const typeFilter = type === 'INVENTORY'
      ? { type: 'INVENTORY' as const }
      : { NOT: { type: 'INVENTORY' as const } };  // null + PRODUCT = legacy-safe

    return this.prisma.category.findMany({
      where: { brandId, tombstone: { not: 1 }, ...typeFilter },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string, brandId?: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
      include: { products: true },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.category.update({ where: { id }, data: { tombstone: 1 } });
  }
}
