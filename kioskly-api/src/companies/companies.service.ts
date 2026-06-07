import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  OnboardAdminDto,
} from './dto/company.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async validateSubdomain(slug: string) {
    const company = await this.prisma.company.findFirst({
      where: { slug, tombstone: { not: 1 } },
      select: { id: true, slug: true, name: true, logoUrl: true, isActive: true },
    });
    return {
      valid: !!company,
      companyId: company?.id ?? null,
      isActive: company?.isActive ?? false,
      name: company?.name ?? null,
      logoUrl: company?.logoUrl ?? null,
    };
  }

  async findAll() {
    return this.prisma.company.findMany({
      where: { tombstone: { not: 1 } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { brands: true, stores: true, users: true } },
      },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, tombstone: { not: 1 } },
      include: {
        brands: {
          select: { id: true, name: true, slug: true, isActive: true, _count: { select: { stores: true } } },
        },
        _count: { select: { brands: true, stores: true } },
      },
    });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  async findBySlug(slug: string) {
    const company = await this.prisma.company.findFirst({
      where: { slug, tombstone: { not: 1 } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        isActive: true,
        canCreateBrands: true,
        canOnboardStores: true,
      },
    });
    if (!company) throw new NotFoundException(`Company not found`);
    return company;
  }

  async create(dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Company slug already taken');

    return this.prisma.company.create({ data: dto });
  }

  async update(id: string, dto: UpdateCompanyDto, requestingRole: string) {
    await this.assertExists(id);

    // Only PLATFORM_ADMIN can toggle permissions
    if (
      (dto.canCreateBrands !== undefined || dto.canOnboardStores !== undefined) &&
      requestingRole !== 'PLATFORM_ADMIN'
    ) {
      throw new ForbiddenException('Only platform admins can change company permissions');
    }

    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.assertExists(id);
    return this.prisma.company.update({ where: { id }, data: { tombstone: 1 } });
  }

  async onboardAdmin(companyId: string, dto: OnboardAdminDto) {
    await this.assertExists(companyId);

    const existing = await this.prisma.user.findFirst({
      where: { companyId, username: dto.username },
    });
    if (existing) throw new ConflictException('Username already exists in this company');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        password: hashed,
        role: 'COMPANY_ADMIN',
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
      note: 'Share this password via a secure channel. User will be required to change it on first login.',
    };
  }

  async uploadLogo(id: string, logoUrl: string) {
    await this.assertExists(id);
    return this.prisma.company.update({ where: { id }, data: { logoUrl } });
  }

  private async assertExists(id: string) {
    const company = await this.prisma.company.findFirst({ where: { id, tombstone: { not: 1 } } });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }
}
