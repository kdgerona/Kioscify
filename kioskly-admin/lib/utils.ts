import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const dateObj = new Date(date);
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  const dateObj = new Date(date);
  return dateObj.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    GCASH: 'GCash',
    PAYMAYA: 'Maya',
    ONLINE: 'Online',
    FOODPANDA: 'FoodPanda',
    GRAB: 'Grab',
  };
  return labels[method] || method;
}

export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  };
  return labels[status] || status;
}

export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'text-yellow-600 bg-yellow-100',
    COMPLETED: 'text-green-600 bg-green-100',
    FAILED: 'text-red-600 bg-red-100',
  };
  return colors[status] || 'text-gray-600 bg-gray-100';
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
