import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHeldOrderDto } from './dto/create-held-order.dto';
import { getZonedDayBounds } from '../common/utils/timezone';

const HELD_BY_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class HeldOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateHeldOrderDto, userId: string, tenantId: string) {
    if (dto.clientId) {
      const existing = await this.prisma.heldOrder.findFirst({
        where: { tenantId, clientId: dto.clientId },
      });
      if (existing) {
        throw new ConflictException({ message: 'Held order already synced', id: existing.id });
      }
    }

    return this.prisma.heldOrder.create({
      data: {
        tenantId,
        heldByUserId: userId,
        clientId: dto.clientId,
        customerLabel: dto.customerLabel,
        orderType: dto.orderType,
        subtotal: dto.subtotal,
        total: dto.total,
        itemCount: dto.itemCount,
        items: dto.items as any,
      },
      include: { heldBy: { select: HELD_BY_SELECT } },
    });
  }

  // Saved carts reset daily, same business-day boundary used for daily sales reports
  // (see reports.service.ts). Anything left over from a previous day is treated as
  // abandoned and purged — called on every read path so it applies regardless of
  // when the list was last fetched, not just once at midnight.
  private async purgeStaleHeldOrders(tenantId: string): Promise<void> {
    const { start: todayStart } = getZonedDayBounds(new Date());
    await this.prisma.heldOrder.deleteMany({
      where: { tenantId, createdAt: { lt: todayStart } },
    });
  }

  async findAll(tenantId: string) {
    await this.purgeStaleHeldOrders(tenantId);
    return this.prisma.heldOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { heldBy: { select: HELD_BY_SELECT } },
    });
  }

  async findOne(id: string, tenantId: string) {
    await this.purgeStaleHeldOrders(tenantId);
    const heldOrder = await this.prisma.heldOrder.findFirst({
      where: { id, tenantId },
      include: { heldBy: { select: HELD_BY_SELECT } },
    });
    if (!heldOrder) throw new NotFoundException('Held order not found');
    return heldOrder;
  }

  // Fetch + delete: if two terminals race to resume the same held order, both
  // may pass findOne, but only one delete succeeds — the other's delete throws
  // (row already gone) and is converted to a 404 instead of resuming twice.
  async resume(id: string, tenantId: string) {
    const heldOrder = await this.findOne(id, tenantId);
    try {
      await this.prisma.heldOrder.delete({ where: { id: heldOrder.id } });
    } catch {
      throw new NotFoundException('Held order not found');
    }
    return heldOrder;
  }

  async discard(id: string, tenantId: string) {
    const heldOrder = await this.findOne(id, tenantId);
    try {
      await this.prisma.heldOrder.delete({ where: { id: heldOrder.id } });
    } catch {
      throw new NotFoundException('Held order not found');
    }
    return { success: true };
  }
}
