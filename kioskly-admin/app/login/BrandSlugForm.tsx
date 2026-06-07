'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Store } from 'lucide-react';
import { api } from '@/lib/api';

const KIOSCIFY_ORANGE = '#ea580c';

export default function BrandSlugForm() {
  const [companySlug, setCompanySlug] = useState('');
  const [brandSlug, setBrandSlug] = useState('');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (api.getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companySlug.trim() || !brandSlug.trim()) return;
    setLoading(true);
    router.push(`/${companySlug.trim().toLowerCase()}/${brandSlug.trim().toLowerCase()}`);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — Kioscify branding */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: KIOSCIFY_ORANGE }}
      >
        {/* Decorative rings */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full border-[40px] opacity-10 border-white" />
        <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full border-[50px] opacity-10 border-white" />
        <div className="absolute top-1/2 -right-16 w-64 h-64 rounded-full border-[30px] opacity-[0.07] border-white" />
        <div className="absolute bottom-24 left-8 w-32 h-32 rounded-full opacity-10 bg-white" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-28 h-28 rounded-2xl flex items-center justify-center mb-6 shadow-lg bg-white">
            <div className="relative w-20 h-20">
              <Image src="/logo-full.png" alt="Kioscify" fill className="object-contain" priority />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow">Kioscify</h1>
          <p className="text-white/70 text-sm max-w-xs leading-relaxed">
            Smart Store Management &amp; Monitoring Platform for modern businesses.
          </p>

          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Multi-Brand', 'Analytics', 'Inventory', 'Reports'].map((f) => (
              <span
                key={f}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'white' }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        {/* Mobile-only header */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 mb-3">
            <Image src="/logo-full.png" alt="Kioscify" fill className="object-contain" priority />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Kioscify</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <Store className="w-5 h-5" style={{ color: KIOSCIFY_ORANGE }} />
              <h2 className="text-2xl font-bold text-gray-900">Find your store</h2>
            </div>
            <p className="text-gray-500 text-sm">Enter your company and brand to access the portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Slug</label>
              <input
                type="text"
                value={companySlug}
                onChange={e => setCompanySlug(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': KIOSCIFY_ORANGE } as React.CSSProperties}
                placeholder="e.g. your-company"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand Slug</label>
              <input
                type="text"
                value={brandSlug}
                onChange={e => setBrandSlug(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': KIOSCIFY_ORANGE } as React.CSSProperties}
                placeholder="e.g. your-brand"
              />
            </div>

            <p className="text-xs text-gray-400">These are provided by your Kioscify platform administrator.</p>

            <button
              type="submit"
              disabled={loading || !companySlug.trim() || !brandSlug.trim()}
              className="w-full text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90 mt-2"
              style={{ backgroundColor: KIOSCIFY_ORANGE }}
            >
              {loading ? 'Redirecting...' : 'Continue'}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-10 bg-white border border-gray-200 rounded-full px-3 py-1.5 w-fit mx-auto">
            <div className="relative w-5 h-5">
              <Image src="/logo-full.png" alt="Kioscify" fill className="object-contain" />
            </div>
            <p className="text-xs text-gray-400">
              Powered by <span className="font-semibold text-gray-500">Kioscify</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
