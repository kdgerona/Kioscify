import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  async validateSubdomain(companySlug: string, brandSlug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug: companySlug },
      select: { id: true, name: true, isActive: true },
    });
    if (!company || !company.isActive) {
      return { valid: false, companyId: null, brandId: null, company: null, brand: null };
    }
    const brand = await this.prisma.brand.findFirst({
      where: { slug: brandSlug, companyId: company.id, isActive: true, tombstone: { not: 1 } },
      select: { id: true, name: true, logoUrl: true, themeColors: true, isActive: true },
    });
    if (!brand) {
      return { valid: false, companyId: company.id, brandId: null, company: null, brand: null };
    }
    return {
      valid: true,
      companyId: company.id,
      brandId: brand.id,
      company: { name: company.name },
      brand: { name: brand.name, logoUrl: brand.logoUrl, themeColors: brand.themeColors },
    };
  }

  async findAllByCompany(companyId: string) {
    return this.prisma.brand.findMany({
      where: companyId ? { companyId, tombstone: { not: 1 } } : { tombstone: { not: 1 } },
      include: {
        _count: { select: { stores: true, products: true, categories: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string | undefined) {
    const brand = await this.prisma.brand.findFirst({
      where: companyId ? { id, companyId, tombstone: { not: 1 } } : { id, tombstone: { not: 1 } },
      include: {
        stores: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
        _count: { select: { stores: true, products: true, categories: true, inventoryItems: true } },
      },
    });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    return brand;
  }

  async create(
    companyId: string,
    dto: CreateBrandDto,
    requestingRole: string,
    canCreateBrands: boolean,
  ) {
    // Enforce toggle: only PLATFORM_ADMIN can create brands unless toggle is on
    if (requestingRole !== 'PLATFORM_ADMIN' && !canCreateBrands) {
      throw new ForbiddenException('Your company is not configured to create brands');
    }

    const existing = await this.prisma.brand.findFirst({
      where: { companyId, slug: dto.slug },
    });
    if (existing) throw new ConflictException('Brand slug already exists in this company');

    return this.prisma.brand.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: UpdateBrandDto) {
    await this.assertOwnership(id, companyId);
    const { themeColors, ...rest } = dto;
    const data: any = { ...rest };
    if (themeColors) {
      // Prisma MongoDB embedded types require all fields — fetch existing and merge
      const existing = await this.prisma.brand.findFirst({ where: { id } });
      data.themeColors = {
        primary: themeColors.primary ?? existing?.themeColors?.primary ?? '#ea580c',
        secondary: themeColors.secondary ?? existing?.themeColors?.secondary ?? '#fb923c',
        accent: themeColors.accent ?? existing?.themeColors?.accent ?? '#fdba74',
        background: themeColors.background ?? existing?.themeColors?.background ?? '#ffffff',
        text: themeColors.text ?? existing?.themeColors?.text ?? '#1f2937',
      };
    }
    return this.prisma.brand.update({ where: { id }, data });
  }

  async remove(id: string, companyId: string, requestingRole: string) {
    await this.assertOwnership(id, companyId);
    if (requestingRole !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException('Only platform admins can delete brands');
    }
    return this.prisma.brand.update({ where: { id }, data: { tombstone: 1 } });
  }

  async uploadLogo(id: string, companyId: string, logoUrl: string) {
    await this.assertOwnership(id, companyId);
    return this.prisma.brand.update({ where: { id }, data: { logoUrl } });
  }

  // Called when a new store is created under a brand — copy all brand inventory templates to the store
  async fanOutInventoryToStore(brandId: string, storeId: string) {
    const templates = await this.prisma.inventoryItem.findMany({
      where: { brandId, isTemplate: true, tombstone: { not: 1 } },
    });

    for (const template of templates) {
      const alreadyExists = await this.prisma.inventoryItem.findFirst({
        where: { tenantId: storeId, brandId, name: template.name, tombstone: { not: 1 } },
      });
      if (alreadyExists) continue;

      await this.prisma.inventoryItem.create({
        data: {
          tenantId: storeId,
          brandId,
          isTemplate: false,
          name: template.name,
          category: template.category,
          unit: template.unit,
          description: template.description,
          minStockLevel: template.minStockLevel,
          requiresExpirationDate: template.requiresExpirationDate,
          expirationWarningDays: template.expirationWarningDays,
        },
      });
    }
  }

  private async assertOwnership(id: string, companyId: string | undefined) {
    const where: any = { id, tombstone: { not: 1 } };
    if (companyId) where.companyId = companyId;
    const brand = await this.prisma.brand.findFirst({ where });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    return brand;
  }
}
