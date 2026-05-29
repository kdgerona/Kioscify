'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Company, Brand } from '@/types';
import { Building2, Store, BookOpen, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [companyData, brandsData] = await Promise.all([
          api.getMyCompany(),
          api.getBrands(),
        ]);
        setCompany(companyData);
        setBrands(brandsData);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setError(axiosErr?.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalStores = brands.reduce(
    (sum, b) => sum + (b.storeCount ?? 0),
    0
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{company ? `, ${company.name}` : ''}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here is an overview of your company</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Total Brands</span>
            <div className="p-2 bg-indigo-50 rounded-lg">
              <BookOpen className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{brands.length}</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Total Stores</span>
            <div className="p-2 bg-green-50 rounded-lg">
              <Store className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalStores}</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Company</span>
            <div className="p-2 bg-purple-50 rounded-lg">
              <Building2 className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900 truncate">
            {company?.name || '—'}
          </p>
          <p className="text-xs text-gray-400 truncate">{company?.slug}</p>
        </div>
      </div>

      {/* Brands List */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Your Brands</h2>
          <a
            href="/brands"
            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </a>
        </div>
        {brands.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            No brands yet.{' '}
            {company?.canCreateBrands && (
              <a href="/brands" className="text-indigo-600 hover:underline">
                Create your first brand
              </a>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {brands.map(brand => (
              <div
                key={brand.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{brand.name}</p>
                  <p className="text-xs text-gray-400">{brand.slug}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {brand.storeCount ?? 0} store{(brand.storeCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <a
                    href={`/brands/${brand.id}`}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Manage
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
