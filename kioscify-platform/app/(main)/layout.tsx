'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

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

    if (user.role !== 'PLATFORM_ADMIN') {
      api.logout();
      return;
    }

    if (user.isFirstLogin || user.mustChangePassword) {
      router.push('/change-password');
      return;
    }

    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mx-auto" />
          <p className="mt-4 text-gray-400 text-sm">Loading...</p>
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
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-900 flex flex-col transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Kioscify" className="w-7 h-7 object-contain rounded-lg" />
            <div>
              <h2 className="font-bold text-white text-sm">Kioscify</h2>
              <p className="text-xs text-gray-400">Platform Admin</p>
            </div>
          </div>
          <button
            className="lg:hidden text-gray-400 hover:text-white"
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
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-700 space-y-3">
          <button
            onClick={() => api.logout()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-gray-400 hover:bg-red-900 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <div className="flex justify-center pt-2 border-t border-gray-700">
            <div className="flex items-center gap-2 bg-gray-800 rounded-full px-3 py-1.5 border border-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-full.png" alt="Kioscify" className="w-8 h-8 object-contain" />
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                Powered by <span className="font-semibold text-gray-300">Kioscify</span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kioscify" className="w-5 h-5 object-contain" />
          <span className="font-semibold text-white text-sm">Kioscify Platform</span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
