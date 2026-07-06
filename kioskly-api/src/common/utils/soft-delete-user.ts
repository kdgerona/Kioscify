import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

// Soft-deletes a User: never calls prisma.user.delete, so it can never trip the
// onDelete: Restrict relations (Transaction, Expense, reports, etc). The account
// must already be disabled — this is a deliberate second step after "Disable",
// not a substitute for it. Username/email are mangled so the tenant/company-scoped
// unique constraints free up for reuse by a new account.
export async function tombstoneUser(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.tombstone === 1) throw new NotFoundException('User not found');
  if (user.isActive) throw new BadRequestException('Disable the account before deleting it');

  const suffix = `deleted_${user.id}`;
  const unusablePassword = await bcrypt.hash(randomUUID(), 12);

  await prisma.user.update({
    where: { id: userId },
    data: {
      tombstone: 1,
      username: `${suffix}_${user.username}`,
      email: `${suffix}_${user.email}`,
      password: unusablePassword,
    },
  });
  await prisma.userStoreAccess.updateMany({ where: { userId }, data: { isActive: false } });
}
