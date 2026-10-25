import { Prisma } from '@prisma/client';
import { withJobLock } from './job-lock.util';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

const makePrisma = () => ({
  jobLock: { updateMany: jest.fn(), create: jest.fn() },
});

describe('withJobLock', () => {
  it('acquires when no lock exists', async () => {
    const prisma = makePrisma();
    prisma.jobLock.updateMany.mockResolvedValue({ count: 0 });
    prisma.jobLock.create.mockResolvedValue({});
    const fn = jest.fn(async () => {});
    await expect(withJobLock(prisma as any, 'job', 60_000, fn)).resolves.toBe(true);
    expect(prisma.jobLock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'job', owner: expect.any(String), lockedUntil: expect.any(Date) }),
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('skips while another owner holds an unexpired lock', async () => {
    const prisma = makePrisma();
    prisma.jobLock.updateMany.mockResolvedValue({ count: 0 });
    prisma.jobLock.create.mockRejectedValue(p2002());
    const fn = jest.fn(async () => {});
    await expect(withJobLock(prisma as any, 'job', 60_000, fn)).resolves.toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('takes over an expired lock', async () => {
    const prisma = makePrisma();
    prisma.jobLock.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 1 });
    const fn = jest.fn(async () => {});
    await expect(withJobLock(prisma as any, 'job', 60_000, fn)).resolves.toBe(true);
    expect(prisma.jobLock.create).not.toHaveBeenCalled();
    expect(prisma.jobLock.updateMany.mock.calls[0][0].where).toEqual({ name: 'job', lockedUntil: { lt: expect.any(Date) } });
  });

  it('releases in finally even when fn throws', async () => {
    const prisma = makePrisma();
    prisma.jobLock.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      withJobLock(prisma as any, 'job', 60_000, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const release = prisma.jobLock.updateMany.mock.calls[1][0];
    expect(release.where).toEqual({ name: 'job', owner: expect.any(String) });
  });

  it('rethrows non-P2002 errors from create', async () => {
    const prisma = makePrisma();
    prisma.jobLock.updateMany.mockResolvedValue({ count: 0 });
    prisma.jobLock.create.mockRejectedValue(new Error('db down'));
    await expect(withJobLock(prisma as any, 'job', 60_000, async () => {})).rejects.toThrow('db down');
  });
});
