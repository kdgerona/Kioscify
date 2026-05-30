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

  async create(createAddonDto: CreateAddonDto, brandId: string) {
    const { id, name, price } = createAddonDto;

    const existingAddon = await this.prisma.addon.findUnique({ where: { id } });
    if (existingAddon) throw new ConflictException('Addon with this ID already exists');

    return this.prisma.addon.create({
      data: { id, name, price, brandId },
    });
  }

  async findAll(brandId: string) {
    return this.prisma.addon.findMany({
      where: { brandId, tombstone: { not: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, brandId: string) {
    const addon = await this.prisma.addon.findFirst({ where: { id, brandId, tombstone: { not: 1 } } });
    if (!addon) throw new NotFoundException(`Addon with ID ${id} not found`);
    return addon;
  }

  async update(id: string, updateAddonDto: UpdateAddonDto, brandId: string) {
    await this.findOne(id, brandId);
    return this.prisma.addon.update({ where: { id }, data: updateAddonDto });
  }

  async remove(id: string, brandId: string) {
    await this.findOne(id, brandId);
    return this.prisma.addon.update({ where: { id }, data: { tombstone: 1 } });
  }
}
