import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BrandsService } from '../brands/brands.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { OnboardAdminDto } from '../companies/dto/company.dto';
import { app as appConstants } from '../constants/env.constants';
import { Tenant } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StoresService {
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private authService: AuthService,
    private brandsService: BrandsService,
  ) {
    this.baseUrl = this.configService.get<string>(appConstants.base_url) || '';
  }

  private formatLogoUrl(store: Tenant): Tenant {
    if (store.logoUrl && !store.logoUrl.startsWith('http')) {
      return { ...store, logoUrl: `${this.baseUrl}${store.logoUrl}` };
    }
    return store;
  }

  async findAll(companyId?: string) {
    const stores = await this.prisma.tenant.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        brand: { select: { id: true, name: true, slug: true } },
        _count: { select: { users: true, transactions: true } },
      },
    });
    return stores.map((s) => this.formatLogoUrl(s));
  }

  async findOne(id: string) {
    const store = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true, themeColors: true } },
        company: { select: { id: true, name: true, slug: true, logoUrl: true } },
        _count: { select: { users: true, transactions: true } },
      },
    });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return this.formatLogoUrl(store);
  }

  async findBySlug(slug: string, companySlug?: string) {
    const where = companySlug
      ? { slug, company: { slug: companySlug } }
      : { slug };

    const store = await this.prisma.tenant.findFirst({
      where,
      include: {
        brand: { select: { id: true, name: true, slug: true, logoUrl: true, themeColors: true } },
        company: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });
    if (!store) throw new NotFoundException(`Store not found`);
    return this.formatLogoUrl(store);
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

    // Enforce slug uniqueness per company
    if (dto.companyId) {
      const existing = await this.prisma.tenant.findFirst({
        where: { slug: dto.slug, companyId: dto.companyId },
      });
      if (existing) throw new ConflictException('Store slug already exists in this company');
    }

    const store = await this.prisma.tenant.create({ data: dto });

    // Fan out brand inventory templates to this new store
    if (store.brandId) {
      await this.brandsService.fanOutInventoryToStore(store.brandId, store.id);
    }

    return store;
  }

  async update(id: string, dto: UpdateStoreDto) {
    await this.findOne(id);
    const updated = await this.prisma.tenant.update({ where: { id }, data: dto });
    return this.formatLogoUrl(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tenant.delete({ where: { id } });
  }

  async uploadLogo(id: string, logoUrl: string) {
    await this.findOne(id);
    const updated = await this.prisma.tenant.update({ where: { id }, data: { logoUrl } });
    return this.formatLogoUrl(updated);
  }

  async onboardAdmin(storeId: string, dto: OnboardAdminDto) {
    const store = await this.findOne(storeId);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: storeId, username: dto.username },
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
