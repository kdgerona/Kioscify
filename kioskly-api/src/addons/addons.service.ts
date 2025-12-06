import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';

@Injectable()
export class AddonsService {
  constructor(private prisma: PrismaService) {}

  async create(createAddonDto: CreateAddonDto, tenantId: string) {
    const { id, name, price } = createAddonDto;

    const existingAddon = await this.prisma.addon.findUnique({
      where: { id },
    });

    if (existingAddon) {
      throw new ConflictException('Addon with this ID already exists');
    }

    return this.prisma.addon.create({
      data: { id, name, price, tenantId },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.addon.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const addon = await this.prisma.addon.findFirst({
      where: { id, tenantId },
    });

    if (!addon) {
      throw new NotFoundException(`Addon with ID ${id} not found`);
    }

    return addon;
  }

  async update(id: string, updateAddonDto: UpdateAddonDto, tenantId: string) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.addon.update({
      where: { id },
      data: updateAddonDto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.addon.delete({
      where: { id },
    });
  }
}
