import { BillingAuditService } from './billing-audit.service';

describe('BillingAuditService', () => {
  const prisma = {
    billingAuditLog: { create: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new BillingAuditService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('list adds the actor name (null for system rows) with one user lookup', async () => {
    prisma.billingAuditLog.findMany.mockResolvedValue([
      { id: 'a1', actorUserId: 'u1', action: 'settings.update' },
      { id: 'a2', actorUserId: null, action: 'invoice.generate' },
      { id: 'a3', actorUserId: 'u1', action: 'invoice.void' },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', firstName: 'Ana', lastName: 'Cruz', username: 'ana' }]);

    const rows = await service.list('t-1');

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['u1'] } } }));
    expect(rows.map(r => r.actorName)).toEqual(['Ana Cruz', null, 'Ana Cruz']);
  });

  it('falls back to the username when the user has no name', async () => {
    prisma.billingAuditLog.findMany.mockResolvedValue([{ id: 'a1', actorUserId: 'u2', action: 'x' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u2', firstName: '', lastName: '', username: 'platform' }]);
    expect((await service.list('t-1'))[0].actorName).toBe('platform');
  });

  it('skips the user lookup when every row is a system row', async () => {
    prisma.billingAuditLog.findMany.mockResolvedValue([{ id: 'a1', actorUserId: null, action: 'x' }]);
    await service.list('t-1');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
