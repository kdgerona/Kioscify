'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { resolveLogoUrl } from '@/lib/utils';
import { CompanyProvider, useCompany } from '@/contexts/CompanyContext';
import {
  LayoutDashboard,
  BookOpen,
  BarChart2,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brands', label: 'Brands', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </CompanyProvider>
  );
}

function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  const primaryColor = company?.themeColors?.primary ?? '#ea580c';

  useEffect(() => {
    document.documentElement.style.setProperty('--company-primary', primaryColor);
    document.documentElement.style.setProperty('--company-primary-light', `${primaryColor}18`);
  }, [primaryColor]);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (!userStr) {
      router.push('/login');
      return;
    }

    const user = JSON.parse(userStr);

    if (user.role !== 'COMPANY_ADMIN') {
      api.logout();
      return;
    }

    if (user.isFirstLogin || user.mustChangePassword) {
      router.push('/change-password');
      return;
    }

    setCompanyName(user.companyName || 'Company Portal');
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (company) {
      setCompanyLogoUrl(resolveLogoUrl(company.logoUrl));
      if (company.name) setCompanyName(company.name);
    }
  }, [company]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderBottomColor: primaryColor }} />
          <p className="mt-4 text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white shadow-sm flex flex-col transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={companyLogoUrl} alt={companyName} className="w-8 h-8 object-contain rounded-lg flex-shrink-0 border border-gray-100" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${primaryColor}18`, border: `1px solid ${primaryColor}30` }}
              >
                <Building2 className="w-4 h-4" style={{ color: primaryColor }} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 text-sm truncate">{companyName}</h2>
              <p className="text-xs text-gray-400">Company Portal</p>
            </div>
          </div>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? 'font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
                style={isActive ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="p-4 border-t space-y-3">
          <button
            onClick={() => api.logout()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <div className="flex justify-center pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-full.png" alt="Kioscify" className="w-8 h-8 object-contain" />
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                Powered by <span className="font-semibold text-gray-600">Kioscify</span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          {companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companyLogoUrl} alt={companyName} className="w-6 h-6 object-contain rounded" />
          ) : (
            <div
              className="w-6 h-6 rounded flex items-center justify-center"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Building2 className="w-3.5 h-3.5" style={{ color: primaryColor }} />
            </div>
          )}
          <span className="font-semibold text-gray-900 text-sm truncate">{companyName}</span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
