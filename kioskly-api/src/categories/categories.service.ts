import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto, tenantId: string) {
    const { name, description, sequenceNo } = createCategoryDto;

    return this.prisma.category.create({
      data: {
        id: randomUUID(),
        name,
        description,
        tenantId,
        sequenceNo: sequenceNo ?? 0,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
      include: {
        products: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    tenantId: string,
  ) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.category.delete({
      where: { id },
    });
  }
}
