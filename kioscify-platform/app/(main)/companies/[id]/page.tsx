'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Company, Brand, Store, OnboardAdminPayload } from '@/types';
import {
  ChevronLeft,
  Plus,
  X,
  Copy,
  Check,
  Save,
  UserPlus,
  Store as StoreIcon,
  Upload,
} from 'lucide-react';

type Tab = 'settings' | 'brands' | 'stores';

// ─── Modal wrapper ────────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Admin form fields ────────────────────────────────────────────────────

function AdminFields({
  firstName,
  lastName,
  email,
  username,
  setFirstName,
  setLastName,
  setEmail,
  setUsername,
}: {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setEmail: (v: string) => void;
  setUsername: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>
    </>
  );
}

// ─── Password result banner ───────────────────────────────────────────────

function PasswordBanner({
  title,
  password,
  onClose,
}: {
  title: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-green-800 font-medium text-sm">{title}</p>
        <button onClick={onClose} className="text-green-600 hover:text-green-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-green-700 text-sm mb-2">Temporary password:</p>
      <div className="flex items-center gap-2 bg-white rounded border border-green-200 px-3 py-2">
        <code className="text-sm font-mono flex-1">{password}</code>
        <button
          onClick={copy}
          className="text-green-600 hover:text-green-800 flex items-center gap-1 text-xs"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function CompanyDetailPage() {
  const params = useParams();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password banners
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [storePassword, setStorePassword] = useState<{ storeName: string; password: string } | null>(null);

  // Modals
  const [showOnboardAdmin, setShowOnboardAdmin] = useState(false);
  const [showCreateBrand, setShowCreateBrand] = useState(false);
  const [showOnboardStore, setShowOnboardStore] = useState<{ brandId: string; brandName: string } | 'pick' | null>(null);

  // Settings form
  const [canCreateBrands, setCanCreateBrands] = useState(false);
  const [canOnboardStores, setCanOnboardStores] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Logo upload
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoSuccess, setLogoSuccess] = useState(false);

  // Onboard admin form
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Create brand form
  const [brandName, setBrandName] = useState('');
  const [brandSlug, setBrandSlug] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  // Onboard store form
  const [storeNameField, setStoreNameField] = useState('');
  const [storeSlugField, setStoreSlugField] = useState('');
  const [storeAdminFirst, setStoreAdminFirst] = useState('');
  const [storeAdminLast, setStoreAdminLast] = useState('');
  const [storeAdminEmail, setStoreAdminEmail] = useState('');
  const [storeAdminUsername, setStoreAdminUsername] = useState('');
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [companyData, brandsData, storesData] = await Promise.all([
        api.getCompanyById(companyId),
        api.getBrandsByCompany(companyId),
        api.getStoresByCompany(companyId),
      ]);
      setCompany(companyData);
      setBrands(brandsData);
      setStores(storesData);
      setCanCreateBrands(companyData.canCreateBrands);
      setCanOnboardStores(companyData.canOnboardStores);
      setCompanyName(companyData.name);
      setContactEmail(companyData.contactEmail || '');
      setIsActive(companyData.isActive);
    } catch {
      setError('Failed to load company data');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const updated = await api.updateCompany(companyId, {
        name: companyName,
        contactEmail,
        canCreateBrands,
        canOnboardStores,
        isActive,
      });
      setCompany(updated);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch {
      // no-op
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const updated = await api.uploadCompanyLogo(companyId, file);
      setCompany(updated);
      setLogoSuccess(true);
      setTimeout(() => setLogoSuccess(false), 3000);
    } catch {
      // no-op
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleOnboardAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    try {
      const payload: OnboardAdminPayload = {
        firstName: adminFirstName,
        lastName: adminLastName,
        email: adminEmail,
        username: adminUsername,
      };
      const result = await api.onboardCompanyAdmin(companyId, payload);
      setAdminPassword(result.temporaryPassword);
      setAdminFirstName('');
      setAdminLastName('');
      setAdminEmail('');
      setAdminUsername('');
      setShowOnboardAdmin(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setAdminError(axiosErr?.response?.data?.message || 'Failed to onboard admin');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setBrandError(null);
    setBrandLoading(true);
    try {
      const newBrand = await api.createBrand({
        name: brandName,
        slug: brandSlug,
        description: brandDescription || undefined,
        companyId,
      });
      setBrands(prev => [...prev, newBrand]);
      setBrandName('');
      setBrandSlug('');
      setBrandDescription('');
      setShowCreateBrand(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setBrandError(axiosErr?.response?.data?.message || 'Failed to create brand');
    } finally {
      setBrandLoading(false);
    }
  };

  const handleOnboardStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showOnboardStore || showOnboardStore === 'pick') return;
    setStoreError(null);
    setStoreLoading(true);
    try {
      const result = await api.onboardStore({
        storeName: storeNameField,
        storeSlug: storeSlugField,
        brandId: showOnboardStore.brandId,
        companyId,
        admin: {
          firstName: storeAdminFirst,
          lastName: storeAdminLast,
          email: storeAdminEmail,
          username: storeAdminUsername,
        },
      });
      setStorePassword({ storeName: result.store.name, password: result.temporaryPassword });
      setStores(prev => [...prev, result.store]);
      setStoreNameField('');
      setStoreSlugField('');
      setStoreAdminFirst('');
      setStoreAdminLast('');
      setStoreAdminEmail('');
      setStoreAdminUsername('');
      setShowOnboardStore(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setStoreError(axiosErr?.response?.data?.message || 'Failed to onboard store');
    } finally {
      setStoreLoading(false);
    }
  };

  const handleToggleStoreActive = async (store: Store) => {
    try {
      const updated = await api.updateStore(store.id, { isActive: !store.isActive });
      setStores(prev => prev.map(s => s.id === store.id ? updated : s));
    } catch {
      // no-op — toggle reverts visually on next render
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error || 'Company not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/companies" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </a>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-sm text-gray-500">{company.slug}.kioscify.com</p>
        </div>
      </div>

      {/* Password banners */}
      {adminPassword && (
        <PasswordBanner
          title="Company admin created successfully"
          password={adminPassword}
          onClose={() => setAdminPassword(null)}
        />
      )}
      {storePassword && (
        <PasswordBanner
          title={`Store "${storePassword.storeName}" onboarded successfully`}
          password={storePassword.password}
          onClose={() => setStorePassword(null)}
        />
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1">
          {(['settings', 'brands', 'stores'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab === 'stores' && stores.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                  {stores.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-xl">
          {/* Company info */}
          <div className="bg-white rounded-lg border">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Company Settings</h2>
            </div>
            <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
              {settingsSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                  Settings saved
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                <ToggleRow
                  label="Can Create Brands"
                  description="Company can create and manage their own brands"
                  enabled={canCreateBrands}
                  onToggle={() => setCanCreateBrands(v => !v)}
                />
                <ToggleRow
                  label="Can Onboard Stores"
                  description="Company can onboard new store locations"
                  enabled={canOnboardStores}
                  onToggle={() => setCanOnboardStores(v => !v)}
                />
                <ToggleRow
                  label="Active"
                  description="Company is active and accessible on the platform"
                  enabled={isActive}
                  onToggle={() => setIsActive(v => !v)}
                />
              </div>

              <button
                type="submit"
                disabled={settingsSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Logo upload */}
          <div className="bg-white rounded-lg border">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Company Logo</h2>
              <p className="text-xs text-gray-400 mt-0.5">Displayed on the company portal login page</p>
            </div>
            <div className="p-6 flex items-center gap-6">
              <div className="w-20 h-20 rounded-xl border border-gray-200 flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt="Company logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-3xl font-bold text-gray-300">{company.name[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1">
                {logoSuccess && (
                  <p className="text-green-600 text-sm mb-2">Logo updated</p>
                )}
                <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                  logoUploading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}>
                  <Upload className="w-4 h-4" />
                  {logoUploading ? 'Uploading...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    disabled={logoUploading}
                    onChange={handleLogoUpload}
                  />
                </label>
                <p className="text-xs text-gray-400 mt-2">JPEG, PNG, WebP or GIF · Max 5 MB</p>
              </div>
            </div>
          </div>

          {/* Onboard admin */}
          <div className="bg-white rounded-lg border">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Company Admin</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create an admin user for this company</p>
              </div>
              <button
                onClick={() => setShowOnboardAdmin(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-medium"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Onboard Admin
              </button>
            </div>
            <div className="px-6 py-4 text-sm text-gray-500">
              Use the button above to create a COMPANY_ADMIN user for this company. A temporary
              password will be generated.
            </div>
          </div>
        </div>
      )}

      {/* Brands tab */}
      {activeTab === 'brands' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateBrand(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              New Brand
            </button>
          </div>

          {brands.length === 0 ? (
            <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
              No brands yet
            </div>
          ) : (
            <div className="space-y-4">
              {brands.map(brand => (
                <div key={brand.id} className="bg-white rounded-lg border">
                  <div className="px-5 py-4 border-b flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{brand.name}</p>
                      <p className="text-xs text-gray-400">{brand.slug}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {brand.storeCount ?? 0} store{(brand.storeCount ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() =>
                          setShowOnboardStore({ brandId: brand.id, brandName: brand.name })
                        }
                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded px-2.5 py-1.5"
                      >
                        <StoreIcon className="w-3.5 h-3.5" />
                        Onboard Store
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stores tab */}
      {activeTab === 'stores' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowOnboardStore('pick')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Onboard Store
            </button>
          </div>

          {stores.length === 0 ? (
            <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
              No stores yet
            </div>
          ) : (
            <div className="bg-white rounded-lg border divide-y">
              {stores.map(store => (
                <div key={store.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{store.name}</p>
                    <p className="text-xs text-gray-400">
                      {store.slug}
                      {store.brand && (
                        <span className="ml-2 text-gray-300">·</span>
                      )}
                      {store.brand && (
                        <span className="ml-2 text-indigo-500">{store.brand.name}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      store.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {store.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleToggleStoreActive(store)}
                      title={store.isActive ? 'Deactivate store' : 'Activate store'}
                      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${
                        store.isActive ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        store.isActive ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Onboard admin modal */}
      {showOnboardAdmin && (
        <Modal title="Onboard Company Admin" onClose={() => { setShowOnboardAdmin(false); setAdminError(null); }}>
          <form onSubmit={handleOnboardAdmin} className="space-y-4">
            {adminError && <p className="text-red-600 text-sm">{adminError}</p>}
            <AdminFields
              firstName={adminFirstName}
              lastName={adminLastName}
              email={adminEmail}
              username={adminUsername}
              setFirstName={setAdminFirstName}
              setLastName={setAdminLastName}
              setEmail={setAdminEmail}
              setUsername={setAdminUsername}
            />
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowOnboardAdmin(false); setAdminError(null); }}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adminLoading}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {adminLoading ? 'Creating...' : 'Create Admin'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create brand modal */}
      {showCreateBrand && (
        <Modal title="New Brand" onClose={() => { setShowCreateBrand(false); setBrandError(null); }}>
          <form onSubmit={handleCreateBrand} className="space-y-4">
            {brandError && <p className="text-red-600 text-sm">{brandError}</p>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
              <input
                type="text"
                value={brandName}
                onChange={e => {
                  setBrandName(e.target.value);
                  if (!brandSlug) {
                    setBrandSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                    );
                  }
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={brandSlug}
                onChange={e => setBrandSlug(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={brandDescription}
                onChange={e => setBrandDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowCreateBrand(false); setBrandError(null); }}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={brandLoading}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {brandLoading ? 'Creating...' : 'Create Brand'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Brand picker (shown when Onboard Store is triggered from Stores tab) */}
      {showOnboardStore === 'pick' && (
        <Modal title="Select Brand" onClose={() => setShowOnboardStore(null)}>
          <div className="space-y-2">
            <p className="text-sm text-gray-500 mb-3">Choose which brand this store belongs to:</p>
            {brands.length === 0 ? (
              <p className="text-sm text-gray-400">No brands found. Create a brand first.</p>
            ) : (
              brands.map(brand => (
                <button
                  key={brand.id}
                  onClick={() => setShowOnboardStore({ brandId: brand.id, brandName: brand.name })}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                >
                  <p className="font-medium text-gray-900 text-sm">{brand.name}</p>
                  <p className="text-xs text-gray-400">{brand.slug}</p>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* Onboard store modal */}
      {showOnboardStore && showOnboardStore !== 'pick' && (
        <Modal
          title={`Onboard Store — ${showOnboardStore.brandName}`}
          onClose={() => { setShowOnboardStore(null); setStoreError(null); }}
        >
          <form onSubmit={handleOnboardStore} className="space-y-4">
            {storeError && <p className="text-red-600 text-sm">{storeError}</p>}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Store Details</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
              <input
                type="text"
                value={storeNameField}
                onChange={e => {
                  setStoreNameField(e.target.value);
                  if (!storeSlugField) {
                    setStoreSlugField(
                      e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                    );
                  }
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Slug</label>
              <input
                type="text"
                value={storeSlugField}
                onChange={e => setStoreSlugField(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4">
              Store Admin Account
            </p>
            <AdminFields
              firstName={storeAdminFirst}
              lastName={storeAdminLast}
              email={storeAdminEmail}
              username={storeAdminUsername}
              setFirstName={setStoreAdminFirst}
              setLastName={setStoreAdminLast}
              setEmail={setStoreAdminEmail}
              setUsername={setStoreAdminUsername}
            />
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowOnboardStore(null); setStoreError(null); }}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={storeLoading}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {storeLoading ? 'Onboarding...' : 'Onboard Store'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${
          enabled ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
