import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MenusService } from '../menus/menus.service';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';

@Injectable()
export class PreferencesService {
  constructor(
    private prisma: PrismaService,
    private menusService: MenusService,
  ) {}

  async create(createPreferenceDto: CreatePreferenceDto, menuId: string) {
    const { id: providedId, name } = createPreferenceDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.preference.findUnique({ where: { id } });
      if (existing) throw new ConflictException('Preference with this ID already exists');
    }

    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { brandId: true } });
    if (!menu) throw new BadRequestException(`Menu ${menuId} not found`);

    return this.prisma.preference.create({
      data: { id, name, menuId, brandId: menu.brandId },
    });
  }

  /**
   * `menuId` (explicit, admin/builder context) takes priority; otherwise
   * resolved from the requesting store's current menu via `tenantId`
   * (mobile/store-portal read context). Returns [] rather than throwing when
   * scope can't be resolved — an unassigned store must see an empty list.
   */
  async findAll(params: { menuId?: string; tenantId?: string }) {
    const menuId =
      params.menuId ?? (params.tenantId ? await this.menusService.resolveStoreMenuId(params.tenantId) : null);
    if (!menuId) return [];
    return this.prisma.preference.findMany({
      where: { menuId, tombstone: { not: 1 } },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string) {
    const preference = await this.prisma.preference.findFirst({
      where: { id, tombstone: { not: 1 } },
    });
    if (!preference) throw new NotFoundException(`Preference with ID ${id} not found`);
    return preference;
  }

  async update(id: string, updatePreferenceDto: UpdatePreferenceDto) {
    const existing = await this.findOne(id);
    if (updatePreferenceDto.isDefault) {
      const targetMenuId = existing.menuId;
      return this.prisma.$transaction([
        this.prisma.preference.updateMany({
          where: { menuId: targetMenuId, id: { not: id } },
          data: { isDefault: false },
        }),
        this.prisma.preference.update({ where: { id }, data: updatePreferenceDto }),
      ]).then(([, updated]) => updated);
    }
    return this.prisma.preference.update({ where: { id }, data: updatePreferenceDto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.preference.update({ where: { id }, data: { tombstone: 1 } });
  }
}
