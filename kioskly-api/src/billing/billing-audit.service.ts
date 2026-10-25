import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface BillingAuditEntry {
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class BillingAuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: BillingAuditEntry): Promise<void> {
    await this.prisma.billingAuditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Newest first, with each actor's display name (null = system). */
  async list(tenantId: string | null, limit = 50) {
    const rows = await this.prisma.billingAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const actorIds = [...new Set(rows.map(r => r.actorUserId).filter((id): id is string => !!id))];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const names = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.username]));
    return rows.map(r => ({ ...r, actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null }));
  }
}
