import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  LoginDto,
  CompanyLoginDto,
  PlatformLoginDto,
  ChangePasswordDto,
} from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

// Password strength: min 10 chars, 1 upper, 1 lower, 1 number, 1 special
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%!^&*()_+\-=])[A-Za-z\d@#$%!^&*()_+\-=]{10,}$/;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ─── Utility ──────────────────────────────────────────────────────────────

  generateSecurePassword(length = 14): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '@#$%!';
    const all = upper + lower + digits + symbols;

    const required = [
      upper[crypto.randomInt(upper.length)],
      lower[crypto.randomInt(lower.length)],
      digits[crypto.randomInt(digits.length)],
      symbols[crypto.randomInt(symbols.length)],
    ];

    const rest = Array.from(
      { length: length - required.length },
      () => all[crypto.randomInt(all.length)],
    );

    return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('');
  }

  private buildJwt(payload: object): string {
    return this.jwtService.sign(payload);
  }

  // ─── Store Login ──────────────────────────────────────────────────────────

  async loginStore(dto: LoginDto) {
    // Resolve store by slug (optionally scoped to company for uniqueness)
    const storeWhere = dto.companySlug
      ? {
          slug: dto.storeSlug,
          company: { slug: dto.companySlug },
          isActive: true,
        }
      : { slug: dto.storeSlug, isActive: true };

    const store = await this.prisma.tenant.findFirst({ where: storeWhere });
    if (!store) throw new UnauthorizedException('Invalid credentials');

    // Simple lookup — no complex nested includes (Prisma MongoDB can silently return
    // null when include chains are too deep). Tenant data is fetched separately.
    let user: any = await this.prisma.user.findFirst({
      where: { username: dto.username, isActive: true, tenantId: store.id },
    });

    // Fall back to UserStoreAccess for multi-store users
    if (!user) {
      const access = await this.prisma.userStoreAccess.findFirst({
        where: { tenantId: store.id, isActive: true },
        include: { user: true },
      });
      if (access?.user?.username === dto.username && access.user.isActive) {
        user = access.user;
      }
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    // Fetch related data needed to build the stores list (kept separate from auth query)
    const storeSelect = {
      id: true, name: true, slug: true, brandId: true, companyId: true,
      brand: { select: { id: true, name: true, slug: true, logoUrl: true, themeColors: true } },
      company: { select: { id: true, name: true, slug: true, logoUrl: true } },
    };
    const userWithRelations = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        tenant: { select: storeSelect },
        storeAccess: {
          where: { isActive: true },
          include: { tenant: { select: storeSelect } },
        },
      },
    });
    const enrichedUser = { ...user, ...userWithRelations };

    // Build full list of accessible stores
    const accessibleStores = this.buildAccessibleStoresList(enrichedUser, store.id);

    const activeStore =
      accessibleStores.find((s) => s.id === store.id) ?? accessibleStores[0];

    const role = user.role === 'ADMIN' ? 'STORE_ADMIN' : user.role;
    const payload = {
      sub: user.id,
      username: user.username,
      role,
      tenantId: activeStore.id,
      brandId: activeStore.brandId,
      companyId: activeStore.companyId,
      mustChangePassword: user.isFirstLogin,
    };

    return {
      accessToken: this.buildJwt(payload),
      mustChangePassword: user.isFirstLogin,
      stores: accessibleStores,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role,
        tenantId: activeStore.id,
        brandId: activeStore.brandId,
        companyId: activeStore.companyId,
      },
    };
  }

  // ─── Switch Store (multi-store STORE_ADMIN) ───────────────────────────────

  async switchStore(userId: string, targetStoreId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        storeAccess: { where: { isActive: true }, include: { tenant: true } },
      },
    });
    if (!user) throw new UnauthorizedException();

    // Verify the user has access to the target store
    const hasAccess =
      user.tenantId === targetStoreId ||
      user.storeAccess.some((a) => a.tenantId === targetStoreId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this store');
    }

    const targetStore = await this.prisma.tenant.findUnique({
      where: { id: targetStoreId },
      select: {
        id: true,
        name: true,
        slug: true,
        brandId: true,
        companyId: true,
      },
    });
    if (!targetStore || !targetStore) throw new UnauthorizedException();

    const role = user.role === 'ADMIN' ? 'STORE_ADMIN' : user.role;
    const payload = {
      sub: user.id,
      username: user.username,
      role,
      tenantId: targetStore.id,
      brandId: targetStore.brandId,
      companyId: targetStore.companyId,
      mustChangePassword: user.isFirstLogin,
    };

    return {
      accessToken: this.buildJwt(payload),
      activeStore: targetStore,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildAccessibleStoresList(
    user: any,
    preferredStoreId?: string,
  ): Array<{
    id: string;
    name: string;
    slug: string;
    brandId: string | null;
    companyId: string | null;
    brand: any;
    company: any;
  }> {
    const stores = new Map<string, any>();

    // Primary store from tenantId
    if (user.tenantId && user.tenant) {
      stores.set(user.tenantId, {
        id: user.tenantId,
        name: user.tenant.name,
        slug: user.tenant.slug,
        brandId: user.tenant.brandId,
        companyId: user.tenant.companyId,
        brand: user.tenant.brand ?? null,
        company: user.tenant.company ?? null,
      });
    }

    // Additional stores from UserStoreAccess
    for (const access of user.storeAccess ?? []) {
      if (access.tenant && !stores.has(access.tenantId)) {
        stores.set(access.tenantId, {
          id: access.tenantId,
          name: access.tenant.name,
          slug: access.tenant.slug,
          brandId: access.tenant.brandId,
          companyId: access.tenant.companyId,
          brand: access.tenant.brand ?? null,
          company: access.tenant.company ?? null,
        });
      }
    }

    const list = Array.from(stores.values());

    // Preferred store first
    if (preferredStoreId) {
      list.sort((a, b) =>
        a.id === preferredStoreId ? -1 : b.id === preferredStoreId ? 1 : 0,
      );
    }

    return list;
  }

  // ─── Company Login ────────────────────────────────────────────────────────

  async loginCompany(dto: CompanyLoginDto) {
    const company = await this.prisma.company.findFirst({
      where: { slug: dto.companySlug, isActive: true },
    });

    if (!company) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        companyId: company.id,
        username: dto.username,
        role: 'COMPANY_ADMIN',
        isActive: true,
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      companyId: user.companyId,
      mustChangePassword: user.isFirstLogin,
    };

    return {
      accessToken: this.buildJwt(payload),
      mustChangePassword: user.isFirstLogin,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
    };
  }

  // ─── Platform Login ───────────────────────────────────────────────────────

  async loginPlatform(dto: PlatformLoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, role: 'PLATFORM_ADMIN', isActive: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.isFirstLogin,
    };

    return {
      accessToken: this.buildJwt(payload),
      mustChangePassword: user.isFirstLogin,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ─── Change Password ──────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'New password must differ from current password',
      );
    }

    if (!PASSWORD_REGEX.test(dto.newPassword)) {
      throw new BadRequestException(
        'Password must be at least 10 characters with uppercase, lowercase, number, and special character',
      );
    }

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, isFirstLogin: false },
    });

    return { message: 'Password changed successfully' };
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        brandId: true,
        companyId: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isFirstLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    return {
      ...user,
      mustChangePassword: user.isFirstLogin,
    };
  }

  // ─── Legacy Register (store users) — kept for backward compat ─────────────

  async register(
    data: {
      username: string;
      password: string;
      email: string;
      firstName?: string;
      lastName?: string;
      role: string;
    },
    tenantId: string,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        OR: [{ username: data.username }, { email: data.email }],
      },
    });
    if (existing)
      throw new ConflictException('Username or email already exists');

    const hashed = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        tenantId,
        username: data.username,
        password: hashed,
        email: data.email,
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        role: data.role as any,
        isFirstLogin: false,
      },
      select: {
        id: true,
        tenantId: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }
}
