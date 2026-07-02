import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SessionStatus = 'ACTIVE' | 'ENDED' | 'EXPIRED';

export interface RecordSessionInput {
  userId: string;
  jti: string;
  role: Role;
  tenantId?: string | null;
  companyId?: string | null;
  brandId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}

export interface SessionListFilters {
  companyId?: string;
  search?: string;
  status?: SessionStatus;
  page?: number;
  limit?: number;
}

export interface SessionListRow {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: Role;
  };
  company: { id: string; name: string } | null;
  tenantId: string | null;
  loginAt: Date;
  loggedOutAt: Date | null;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  status: SessionStatus;
}

interface SessionWithUser {
  id: string;
  companyId: string | null;
  tenantId: string | null;
  loginAt: Date;
  loggedOutAt: Date | null;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: Role;
  };
}

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  email: true,
  role: true,
} as const;

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  deriveStatus(session: { loggedOutAt: Date | null; expiresAt: Date }): SessionStatus {
    if (session.loggedOutAt) return 'ENDED';
    if (session.expiresAt < new Date()) return 'EXPIRED';
    return 'ACTIVE';
  }

  async recordSession(input: RecordSessionInput): Promise<void> {
    await this.prisma.session.create({
      data: {
        userId: input.userId,
        jti: input.jti,
        role: input.role,
        tenantId: input.tenantId ?? null,
        companyId: input.companyId ?? null,
        brandId: input.brandId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  async endSession(jti: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { jti } });
    if (!session || session.loggedOutAt) return;
    await this.prisma.session.update({ where: { jti }, data: { loggedOutAt: new Date() } });
  }

  private buildSearchFilter(search?: string) {
    if (!search) return {};
    return {
      user: {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
        ],
      },
    };
  }

  private toRows(
    sessions: SessionWithUser[],
    companyMap: Map<string, { id: string; name: string }>,
  ): SessionListRow[] {
    return sessions.map((s) => ({
      id: s.id,
      user: s.user,
      company: s.companyId ? companyMap.get(s.companyId) ?? null : null,
      tenantId: s.tenantId,
      loginAt: s.loginAt,
      loggedOutAt: s.loggedOutAt,
      expiresAt: s.expiresAt,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      status: this.deriveStatus(s),
    }));
  }

  private paginate(filtered: SessionWithUser[], page: number, limit: number) {
    const total = filtered.length;
    const start = (page - 1) * limit;
    return {
      pageRows: filtered.slice(start, start + limit),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async listForCompany(filters: SessionListFilters): Promise<{
    data: SessionListRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const sessions = await this.prisma.session.findMany({
      where: {
        role: { in: ['COMPANY_ADMIN', 'STORE_ADMIN', 'CASHIER'] },
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        ...this.buildSearchFilter(filters.search),
      },
      orderBy: { loginAt: 'desc' },
      include: { user: { select: USER_SELECT } },
    });

    const filtered = sessions.filter((s) => !filters.status || this.deriveStatus(s) === filters.status);

    const companyIds = Array.from(
      new Set(filtered.map((s) => s.companyId).filter((id): id is string => !!id)),
    );
    const companies = companyIds.length
      ? await this.prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : [];
    const companyMap = new Map(companies.map((c) => [c.id, c]));

    const { pageRows, pagination } = this.paginate(filtered, page, limit);
    return { data: this.toRows(pageRows, companyMap), pagination };
  }

  async listForStore(
    storeId: string,
    filters: Omit<SessionListFilters, 'companyId'>,
  ): Promise<{
    data: SessionListRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const sessions = await this.prisma.session.findMany({
      where: {
        tenantId: storeId,
        ...this.buildSearchFilter(filters.search),
      },
      orderBy: { loginAt: 'desc' },
      include: { user: { select: USER_SELECT } },
    });

    const filtered = sessions.filter((s) => !filters.status || this.deriveStatus(s) === filters.status);
    const { pageRows, pagination } = this.paginate(filtered, page, limit);
    return { data: this.toRows(pageRows, new Map()), pagination };
  }
}
