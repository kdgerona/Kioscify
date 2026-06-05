export function formatUserName(
  user: { firstName?: string; lastName?: string; username?: string; email?: string } | null | undefined
): string {
  if (!user) return 'Unknown';
  const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return full || user.username || user.email || 'Unknown';
}
