import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#ffffff';
}

export function resolveLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('http')) return logoUrl;
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';
  return `${apiBase}${logoUrl}`;
}
