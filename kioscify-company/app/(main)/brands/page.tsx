'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { hasPrivilege } from '@/lib/privileges';
import { getErrorMessage } from '@/lib/utils';
import type { Brand, Company } from '@/types';
import { Plus, ArrowRight, Store, X } from 'lucide-react';

export default function BrandsPage() {
  const router = useRouter();
  const canCreate = hasPrivilege('brands', 'write');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPrivilege('brands', 'read')) {
      router.replace('/dashboard');
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [companyData, brandsData] = await Promise.all([
        api.getMyCompany(),
        api.getBrands(),
      ]);
      setCompany(companyData);
      setBrands(brandsData);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const newBrand = await api.createBrand({
        name: formName,
        slug: formSlug,
        description: formDescription || undefined,
      });
      setBrands(prev => [...prev, newBrand]);
      setFormName('');
      setFormSlug('');
      setFormDescription('');
      setShowForm(false);
      toast.success('Brand created');
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to create brand');
      setFormError(message);
      toast.error(message);
    } finally {
      setFormLoading(false);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormName(name);
    if (!formSlug) {
      setFormSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brands</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your brand catalog</p>
        </div>
        {company?.canCreateBrands && canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
          >
            <Plus className="w-4 h-4" />
            New Brand
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Create form modal — portaled to document.body; an in-place fixed
          overlay nested this deep in the layout tree renders short at the
          top edge (see brands/[brandId]/page.tsx Modal for notes). */}
      {showForm && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">Create New Brand</h2>
              <button onClick={() => { setShowForm(false); setFormError(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => handleNameChange(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                  placeholder="e.g. Brand Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value)}
                  required
                  pattern="[a-z0-9-]+"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                  placeholder="e.g. brand-name"
                />
                <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
                  style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError(null); }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
                >
                  {formLoading ? 'Creating...' : 'Create Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Brands list */}
      <div className="bg-white rounded-lg border">
        {brands.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No brands yet</p>
            {company?.canCreateBrands && canCreate && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 hover:underline text-sm" style={{ color: 'var(--company-primary, #ea580c)' }}
              >
                Create your first brand
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {brands.map(brand => (
              <div
                key={brand.id}
                className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">{brand.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{brand.slug}</p>
                  {brand.description && (
                    <p className="text-sm text-gray-500 mt-1">{brand.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 ml-4">
                  <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                    <Store className="w-4 h-4" />
                    <span>{brand.storeCount ?? 0}</span>
                  </div>
                  <a
                    href={`/brands/${brand.id}`}
                    className="flex items-center gap-1 text-sm hover:opacity-70 font-medium" style={{ color: 'var(--company-primary, #ea580c)' }}
                  >
                    Manage <ArrowRight className="w-3 h-3" />
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
