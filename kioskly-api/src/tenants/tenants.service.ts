import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { app as appConstants } from '../constants/env.constants';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantsService {
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(appConstants.base_url) || '';
  }

  private transformTenantLogoUrl(tenant: Tenant): Tenant {
    if (tenant && tenant.logoUrl && !tenant.logoUrl.startsWith('http')) {
      return {
        ...tenant,
        logoUrl: `${this.baseUrl}${tenant.logoUrl}`,
      };
    }

    return tenant;
  }

  async create(createTenantDto: CreateTenantDto) {
    // Check if slug already exists
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: createTenantDto.slug },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant with this slug already exists');
    }

    return this.prisma.tenant.create({
      data: createTenantDto,
    });
  }

  async findAll() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return tenants.map((tenant) => this.transformTenantLogoUrl(tenant));
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            products: true,
            categories: true,
            transactions: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return this.transformTenantLogoUrl(tenant);
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug ${slug} not found`);
    }

    const transformedTenant = this.transformTenantLogoUrl(tenant);

    return transformedTenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto) {
    // Check if tenant exists
    await this.findOne(id);

    // If updating slug, check if new slug is available
    if (updateTenantDto.slug) {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { slug: updateTenantDto.slug },
      });

      if (existingTenant && existingTenant.id !== id) {
        throw new ConflictException('Tenant with this slug already exists');
      }
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto,
    });

    return this.transformTenantLogoUrl(updatedTenant);
  }

  async updateLogo(id: string, logoUrl: string) {
    await this.findOne(id);

    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: { logoUrl: logoUrl },
    });

    return this.transformTenantLogoUrl(updatedTenant);
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.tenant.delete({
      where: { id },
    });
  }
}
