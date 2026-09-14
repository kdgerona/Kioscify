import { JwtStrategy, JwtPayload } from './jwt.strategy';

const mockConfig = { get: jest.fn().mockReturnValue('test-secret') };
const mockPrisma = {
  user: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
  company: { findUnique: jest.fn() },
};
const mockTokenBlacklist = { isBlacklisted: jest.fn() };

function makeStrategy(): JwtStrategy {
  return new JwtStrategy(
    mockConfig as any,
    mockPrisma as any,
    mockTokenBlacklist as any,
  );
}

const baseUser = {
  id: 'user-1',
  tenantId: null as string | null,
  brandId: null as string | null,
  companyId: null as string | null,
  username: 'john',
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'STORE_ADMIN',
  isFirstLogin: false,
  isActive: true,
  tombstone: 0,
  storeAccess: [] as { tenantId: string }[],
};

describe('JwtStrategy.validate — accountStatus computation', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.resetAllMocks();
    mockConfig.get.mockReturnValue('test-secret');
    strategy = makeStrategy();
  });

  it('store-login payload (tenantId present): fetches the Tenant and attaches accountStatus computed from its isActive/gracePeriodEndsAt', async () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      username: 'john',
      role: 'STORE_ADMIN',
      tenantId: 'store-1',
    };
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'store-1',
      companyId: 'company-1',
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({
      isActive: false,
      gracePeriodEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days out
    });

    const result = await strategy.validate(payload);

    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      select: { isActive: true, gracePeriodEndsAt: true },
    });
    expect(mockPrisma.company.findUnique).not.toHaveBeenCalled();
    expect(result.accountStatus).toBe('GRACE_PERIOD');
  });

  it('company-login payload (companyId present, no tenantId): fetches the Company and attaches accountStatus computed from its isActive/gracePeriodEndsAt', async () => {
    const payload: JwtPayload = {
      sub: 'user-2',
      username: 'admin',
      role: 'COMPANY_ADMIN',
      companyId: 'company-1',
    };
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 'user-2',
      tenantId: null,
      companyId: 'company-1',
      role: 'COMPANY_ADMIN',
    });
    mockPrisma.company.findUnique.mockResolvedValue({
      isActive: true,
      gracePeriodEndsAt: null,
    });

    const result = await strategy.validate(payload);

    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      select: { isActive: true, gracePeriodEndsAt: true },
    });
    expect(result.accountStatus).toBe('ACTIVE');
  });

  it('platform-admin payload (neither tenantId nor companyId): accountStatus stays undefined and neither Tenant nor Company is fetched', async () => {
    const payload: JwtPayload = {
      sub: 'user-3',
      username: 'kevin',
      role: 'PLATFORM_ADMIN',
    };
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: 'user-3',
      tenantId: null,
      companyId: null,
      role: 'PLATFORM_ADMIN',
    });

    const result = await strategy.validate(payload);

    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.company.findUnique).not.toHaveBeenCalled();
    expect(result.accountStatus).toBeUndefined();
  });

  it('prioritizes Tenant over Company when both tenantId and companyId are present (store-login payloads carry both)', async () => {
    const payload: JwtPayload = {
      sub: 'user-1',
      username: 'john',
      role: 'STORE_ADMIN',
      tenantId: 'store-1',
      companyId: 'company-1',
    };
    mockPrisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'store-1',
      companyId: 'company-1',
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({
      isActive: true,
      gracePeriodEndsAt: null,
    });

    const result = await strategy.validate(payload);

    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      select: { isActive: true, gracePeriodEndsAt: true },
    });
    expect(mockPrisma.company.findUnique).not.toHaveBeenCalled();
    expect(result.accountStatus).toBe('ACTIVE');
    expect(result.tenantId).toBe('store-1');
    expect(result.companyId).toBe('company-1');
  });
});
