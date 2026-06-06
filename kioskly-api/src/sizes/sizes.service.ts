import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSizeDto } from './dto/create-size.dto';
import { UpdateSizeDto } from './dto/update-size.dto';

@Injectable()
export class SizesService {
  constructor(private prisma: PrismaService) {}

  async create(createSizeDto: CreateSizeDto, brandId: string) {
    const {
      id: providedId,
      name,
      priceModifier,
      foodpandaPrice,
      grabPrice,
      volume,
    } = createSizeDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.size.findUnique({ where: { id } });
      if (existing)
        throw new ConflictException('Size with this ID already exists');
    }

    return this.prisma.size.create({
      data: {
        id,
        name,
        priceModifier,
        foodpandaPrice,
        grabPrice,
        volume,
        brandId,
      },
    });
  }

  async findAll(brandId: string) {
    return this.prisma.size.findMany({
      where: { brandId, tombstone: { not: 1 } },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string, brandId?: string) {
    const size = await this.prisma.size.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
    });
    if (!size) throw new NotFoundException(`Size with ID ${id} not found`);
    return size;
  }

  async update(id: string, updateSizeDto: UpdateSizeDto, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.size.update({ where: { id }, data: updateSizeDto });
  }

  async remove(id: string, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.size.update({ where: { id }, data: { tombstone: 1 } });
  }
}
