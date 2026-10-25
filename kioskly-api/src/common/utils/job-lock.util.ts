import { hostname } from 'os';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

type JobLockClient = {
  jobLock: {
    updateMany(args: Prisma.JobLockUpdateManyArgs): Promise<{ count: number }>;
    create(args: Prisma.JobLockCreateArgs): Promise<unknown>;
  };
};

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Run `fn` only if this process holds the named lock — keeps scheduled jobs
 * single-flight when more than one API instance runs. Every job's writes
 * are also idempotent (unique constraints), so a lock lost to a crash only
 * delays the next run until `ttlMs` expires; it never double-applies.
 */
export async function withJobLock(
  prisma: JobLockClient,
  name: string,
  ttlMs: number,
  fn: () => Promise<void>,
): Promise<boolean> {
  const owner = `${hostname()}:${process.pid}:${randomBytes(4).toString('hex')}`;
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  const taken = await prisma.jobLock.updateMany({
    where: { name, lockedUntil: { lt: now } },
    data: { lockedUntil, owner },
  });
  if (taken.count === 0) {
    try {
      await prisma.jobLock.create({ data: { name, lockedUntil, owner } });
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }

  try {
    await fn();
    return true;
  } finally {
    await prisma.jobLock.updateMany({ where: { name, owner }, data: { lockedUntil: new Date() } });
  }
}
