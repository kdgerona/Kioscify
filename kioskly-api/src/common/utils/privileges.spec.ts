import { hasPrivilege } from './privileges';

describe('hasPrivilege', () => {
  it('returns true for null (owner) regardless of required level', () => {
    expect(hasPrivilege(null, 'brands', 'all')).toBe(true);
    expect(hasPrivilege(null, 'analytics', 'read')).toBe(true);
  });

  it('returns true when actual level meets or exceeds required', () => {
    const privs = { brands: 'write', analytics: 'read', users: 'all', settings: 'no_access' };
    expect(hasPrivilege(privs, 'brands', 'read')).toBe(true);
    expect(hasPrivilege(privs, 'brands', 'write')).toBe(true);
    expect(hasPrivilege(privs, 'users', 'all')).toBe(true);
  });

  it('returns false when actual level is below required', () => {
    const privs = { brands: 'read', analytics: 'no_access', users: 'write', settings: 'read' };
    expect(hasPrivilege(privs, 'brands', 'write')).toBe(false);
    expect(hasPrivilege(privs, 'analytics', 'read')).toBe(false);
    expect(hasPrivilege(privs, 'users', 'all')).toBe(false);
  });

  it('defaults missing section to no_access', () => {
    expect(hasPrivilege({}, 'brands', 'read')).toBe(false);
  });
});
