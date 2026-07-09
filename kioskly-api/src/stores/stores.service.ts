import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthService } from '../auth/auth.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { OnboardAdminDto } from '../companies/dto/company.dto';
import { app as appConstants } from '../constants/env.constants';
import { Tenant, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { extname } from 'path';

@Injectable()
export class StoresService {
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    this.baseUrl = this.configService.get<string>(appConstants.base_url) || '';
  }

  private formatLogoUrl(store: any): any {
    const result = { ...store };
    if (result.logoUrl && !result.logoUrl.startsWith('http')) {
      result.logoUrl = `${this.baseUrl}${result.logoUrl}`;
    }
    if (result.brand?.logoUrl && !result.brand.logoUrl.startsWith('http')) {
      result.brand = { ...result.brand, logoUrl: `${this.baseUrl}${result.brand.logoUrl}` };
    }
    if (result.company?.logoUrl && !result.company.logoUrl.startsWith('http')) {
      result.company = { ...result.company, logoUrl: `${this.baseUrl}${result.company.logoUrl}` };
    }
    return result;
  }

  async findAll(companyId?: string, brandId?: string) {
    const where: Record<string, any> = { tombstone: { not: 1 } };
    if (companyId) where.companyId = companyId;
    if (brandId) where.brandId = brandId;
    const stores = await this.prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        brand: { select: { id: true, name: true, slug: true } },
        priceTier: { select: { id: true, name: true, isDefault: true } },
        menu: { select: { id: true, name: true } },
        inventorySetup: { select: { id: true, name: true } },
        _count: { select: { users: true, transactions: true } },
      },
    });
    return stores.map((s) => this.formatLogoUrl(s));
  }

  async findOne(id: string) {
    const store = await this.prisma.tenant.findFirst({
      where: { id, tombstone: { not: 1 } },
      include: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true, themeColors: true, enabledDeliveryPlatforms: true, preferenceLabel: true } },
        company: { select: { id: true, name: true, slug: true, logoUrl: true } },
        priceTier: { select: { id: true, name: true, isDefault: true } },
        menu: { select: { id: true, name: true } },
        inventorySetup: { select: { id: true, name: true } },
        _count: { select: { users: true, transactions: true } },
      },
    });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return this.formatLogoUrl(store);
  }

  async findBySlug(slug: string, companySlug?: string, brandSlug?: string) {
    const where: Record<string, any> = { slug, tombstone: { not: 1 } };
    if (companySlug) where.company = { slug: companySlug };
    if (brandSlug) where.brand = { slug: brandSlug };

    const matches = await this.prisma.tenant.findMany({
      where,
      include: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true, themeColors: true, enabledDeliveryPlatforms: true, preferenceLabel: true } },
        company: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });
    if (matches.length === 0) throw new NotFoundException(`Store not found`);
    if (matches.length > 1) {
      throw new ConflictException('Multiple stores match this slug — specify companySlug and/or brandSlug to disambiguate');
    }
    return this.formatLogoUrl(matches[0]);
  }

  async create(
    dto: CreateStoreDto,
    requestingRole: string,
    companyId?: string,
  ) {
    // Enforce canOnboardStores toggle
    if (requestingRole !== 'PLATFORM_ADMIN' && companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { canOnboardStores: true },
      });
      if (!company?.canOnboardStores) {
        throw new ForbiddenException('Your company is not configured to onboard stores');
      }
    }

    // Enforce slug uniqueness per company + brand
    if (dto.companyId) {
      const existing = await this.prisma.tenant.findFirst({
        where: { slug: dto.slug, companyId: dto.companyId, brandId: dto.brandId ?? null },
      });
      if (existing) throw new ConflictException('Store slug already exists in this company and brand');
    }

    // menuId/inventorySetupId are optional at creation time (decision: a
    // store can be created and configured later) — every catalog/inventory
    // read endpoint already handles an unassigned store gracefully (empty
    // results, not errors). No fan-out step needed anymore: Menu/
    // InventorySetup are shared, assigned wholesale via these fields, not
    // copied per store.
    return this.prisma.tenant.create({ data: dto });
  }

  async update(id: string, dto: UpdateStoreDto) {
    const store = await this.findOne(id);
    if (dto.slug !== undefined || dto.companyId !== undefined || dto.brandId !== undefined) {
      const slug = dto.slug ?? store.slug;
      const companyId = dto.companyId ?? store.companyId ?? null;
      const brandId = dto.brandId ?? store.brandId ?? null;
      const conflict = await this.prisma.tenant.findFirst({
        where: { slug, companyId, brandId, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Store slug already exists in this company and brand');
    }
    if (dto.enabledDeliveryPlatforms !== undefined) {
      const brandPlatforms = (store as any).brand?.enabledDeliveryPlatforms ?? [];
      const invalid = dto.enabledDeliveryPlatforms.filter(p => !brandPlatforms.includes(p));
      if (invalid.length > 0) {
        throw new BadRequestException(`Platform(s) not enabled on this brand: ${invalid.join(', ')}`);
      }
    }
    // PriceTier is Menu-scoped (see schema.prisma) — a tier from the store's
    // previous menu is meaningless under a newly-assigned one, so clear it in
    // the same write rather than leaving a stale id that would silently
    // resolve to wrong-menu pricing.
    const data: Prisma.TenantUncheckedUpdateInput = { ...dto };
    if (dto.menuId !== undefined && dto.menuId !== store.menuId && dto.priceTierId === undefined) {
      data.priceTierId = null;
    }
    const updated = await this.prisma.tenant.update({
      where: { id },
      data,
      include: {
        priceTier: { select: { id: true, name: true, isDefault: true } },
        menu: { select: { id: true, name: true } },
        inventorySetup: { select: { id: true, name: true } },
      },
    });
    return this.formatLogoUrl(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tenant.update({ where: { id }, data: { tombstone: 1 } });
  }

  async uploadLogo(id: string, file: Express.Multer.File) {
    const existing = await this.findOne(id);
    if (existing.logoUrl) await this.storage.delete(existing.logoUrl);
    const filename = `store-${Date.now()}${extname(file.originalname)}`;
    const logoUrl = await this.storage.upload('logos', filename, file.buffer, file.mimetype);
    const updated = await this.prisma.tenant.update({ where: { id }, data: { logoUrl } });
    return this.formatLogoUrl(updated);
  }

  async onboardAdmin(storeId: string, dto: OnboardAdminDto) {
    const store = await this.findOne(storeId);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: storeId, username: dto.username, tombstone: { not: 1 } },
    });
    if (existing) throw new ConflictException('Username already exists in this store');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: storeId,
        brandId: store.brandId,
        companyId: store.companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        password: hashed,
        role: 'STORE_ADMIN',
        isFirstLogin: true,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isFirstLogin: true,
      },
    });

    return {
      user,
      temporaryPassword: password,
      note: 'Share via secure channel. User must change password on first login.',
    };
  }
}
