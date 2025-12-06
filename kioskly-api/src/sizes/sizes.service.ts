import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSizeDto } from './dto/create-size.dto';
import { UpdateSizeDto } from './dto/update-size.dto';

@Injectable()
export class SizesService {
  constructor(private prisma: PrismaService) {}

  async create(createSizeDto: CreateSizeDto, tenantId: string) {
    const { id, name, priceModifier, volume } = createSizeDto;

    const existingSize = await this.prisma.size.findUnique({
      where: { id },
    });

    if (existingSize) {
      throw new ConflictException('Size with this ID already exists');
    }

    return this.prisma.size.create({
      data: { id, name, priceModifier, volume, tenantId },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.size.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const size = await this.prisma.size.findFirst({
      where: { id, tenantId },
    });

    if (!size) {
      throw new NotFoundException(`Size with ID ${id} not found`);
    }

    return size;
  }

  async update(id: string, updateSizeDto: UpdateSizeDto, tenantId: string) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.size.update({
      where: { id },
      data: updateSizeDto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.size.delete({
      where: { id },
    });
  }
}
