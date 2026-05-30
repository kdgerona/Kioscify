export function formatUserName(user: { firstName?: string; lastName?: string; username?: string; email?: string } | null | undefined): string {
  if (!user) return 'N/A';
  const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return full || user.username || user.email || 'N/A';
}

export function formatRole(role: string | undefined | null): string {
  switch (role) {
    case 'PLATFORM_ADMIN': return 'Platform Admin';
    case 'COMPANY_ADMIN':  return 'Company Admin';
    case 'STORE_ADMIN':    return 'Store Admin';
    case 'ADMIN':          return 'Store Admin';
    case 'CASHIER':        return 'Cashier';
    default:               return role ?? '—';
  }
}
