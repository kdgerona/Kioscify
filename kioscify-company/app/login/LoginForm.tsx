'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getContrastColor, resolveLogoUrl } from '@/lib/utils';

const PRIMARY = '#ea580c';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  slug: string;
}

export default function LoginForm({
  companySlug,
  company,
}: {
  companySlug: string | null;
  company: CompanyInfo | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (api.getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resolvedSlug = companySlug || slugInput;
      const data = await api.login({ username, password, companySlug: resolvedSlug });
      if (data.mustChangePassword || data.user?.isFirstLogin || data.user?.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const logoSrc = resolveLogoUrl(company?.logoUrl);
  const panelText  = getContrastColor(PRIMARY);
  const panelMuted = panelText === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
  const panelPillBg = panelText === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
  const ringColor  = panelText === '#ffffff' ? 'white' : '#111827';

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand identity */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: PRIMARY }}
      >
        {/* Decorative rings */}
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full border-[40px] opacity-10"
          style={{ borderColor: ringColor }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full border-[50px] opacity-10"
          style={{ borderColor: ringColor }}
        />
        <div
          className="absolute top-1/2 -right-16 w-64 h-64 rounded-full border-[30px] opacity-[0.07]"
          style={{ borderColor: ringColor }}
        />
        <div
          className="absolute bottom-24 left-8 w-32 h-32 rounded-full opacity-10"
          style={{ backgroundColor: ringColor }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={company?.name ?? 'Company Logo'}
              className="w-28 h-28 object-contain rounded-2xl mb-6 shadow-lg bg-white p-3"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl flex items-center justify-center mb-6 shadow-lg bg-white">
              <Building2 className="w-14 h-14" style={{ color: PRIMARY }} />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-2 drop-shadow" style={{ color: panelText }}>
            {company?.name ?? 'Company Portal'}
          </h1>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: panelMuted }}>
            Manage your brands, stores, and company — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Brands', 'Stores', 'Analytics', 'Users'].map(f => (
              <span
                key={f}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ background: panelPillBg, color: panelText }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        {/* Mobile-only brand header */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={company?.name ?? 'Company Logo'}
              className="w-16 h-16 object-contain rounded-xl mb-3"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: PRIMARY }}
            >
              <Building2 className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {company?.name ?? 'Company Portal'}
          </h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your company account</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {!companySlug && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Company Slug
                </label>
                <input
                  type="text"
                  value={slugInput}
                  onChange={e => setSlugInput(e.target.value)}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
                  placeholder="e.g. your-company"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90 mt-2"
              style={{ backgroundColor: PRIMARY, color: getContrastColor(PRIMARY) }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-10 bg-white border border-gray-200 rounded-full px-3 py-1.5 w-fit mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="Kioscify" className="w-5 h-5 object-contain" />
            <p className="text-xs text-gray-400">
              Powered by <span className="font-semibold text-gray-500">Kioscify</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
