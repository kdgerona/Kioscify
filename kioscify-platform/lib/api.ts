import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  AuthResponse,
  Company,
  Brand,
  ThemeColors,
  Store,
  PlatformStats,
  MaintenanceStatus,
  User,
  OnboardAdminPayload,
  OnboardStorePayload,
  AppRelease,
  Category,
  Product,
  Size,
  Addon,
  Preference,
  InventoryBrandTemplate,
  PriceTier,
  ProductPriceTier,
  SizePriceTier,
  AddonPriceTier,
  CompanyPrivileges,
  SubscriptionListItem,
  SubscriptionDetail,
  SubscriptionStats,
  SessionListItem,
  SessionStatus,
} from '@/types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const UPLOAD_BASE_URL =
  process.env.NEXT_PUBLIC_UPLOAD_URL || API_BASE_URL;

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(config => {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('auth_token')
          : this.token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        if (token !== this.token) this.token = token;
      }
      return config;
    });

    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        const isAuthEndpoint = error.config?.url?.includes('/auth/');
        if (error.response?.status === 401 && !isAuthEndpoint) {
          this.clearToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );

    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  // ─── Token helpers ────────────────────────────────────────────────────────

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token && token !== this.token) this.token = token;
      return token;
    }
    return this.token;
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') localStorage.removeItem('auth_token');
  }

  async logout() {
    try {
      // Revoke the token server-side (blacklist + end session record) before
      // clearing local state. Ignore failures — the token may already be
      // expired/invalid, but the user must still be logged out locally.
      await this.client.post('/auth/logout');
    } catch {
      // no-op
    } finally {
      this.clearToken();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async login(credentials: { username: string; password: string }): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>(
      '/auth/platform-login',
      credentials
    );
    this.setToken(data.accessToken);
    if (typeof window !== 'undefined' && data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const { data } = await this.client.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return data;
  }

  // ─── Platform stats ───────────────────────────────────────────────────────

  async getPlatformStats(): Promise<PlatformStats> {
    const { data } = await this.client.get<PlatformStats>('/platform/stats');
    return data;
  }

  async getMaintenanceStatus(): Promise<MaintenanceStatus> {
    const { data } = await this.client.get<MaintenanceStatus>('/platform/maintenance-status');
    return data;
  }

  async updateMaintenanceStatus(
    dto: Partial<MaintenanceStatus>
  ): Promise<MaintenanceStatus> {
    const { data } = await this.client.patch<MaintenanceStatus>('/platform/maintenance-status', dto);
    return data;
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  async getSubscriptionStats(): Promise<SubscriptionStats> {
    const { data } = await this.client.get<SubscriptionStats>('/platform/subscriptions/stats');
    return data;
  }

  async getSubscriptions(filters: {
    companyId?: string;
    brandId?: string;
    status?: 'activated' | 'pending';
    paid?: 'paid' | 'overdue';
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: SubscriptionListItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await this.client.get('/platform/subscriptions', { params: filters });
    return data;
  }

  async getSubscriptionDetail(tenantId: string): Promise<SubscriptionDetail> {
    const { data } = await this.client.get<SubscriptionDetail>(`/platform/subscriptions/${tenantId}`);
    return data;
  }

  async setStoreActivation(tenantId: string, activatedAt: string | null): Promise<void> {
    await this.client.patch(`/platform/subscriptions/${tenantId}/activation`, { activatedAt });
  }

  async upsertSubscriptionPayment(
    tenantId: string,
    month: string,
    payload: { paid: boolean; note?: string },
  ): Promise<void> {
    await this.client.put(`/platform/subscriptions/${tenantId}/payments/${month}`, payload);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async getSessions(filters: {
    companyId?: string;
    search?: string;
    status?: SessionStatus;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: SessionListItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await this.client.get('/users/sessions', { params: filters });
    return data;
  }

  // ─── Companies ────────────────────────────────────────────────────────────

  async getCompanies(): Promise<Company[]> {
    const { data } = await this.client.get<Company[]>('/companies');
    return data;
  }

  async getCompanyById(id: string): Promise<Company> {
    const { data } = await this.client.get<Company>(`/companies/${id}`);
    return data;
  }

  async createCompany(payload: {
    name: string;
    slug: string;
    contactEmail?: string;
    description?: string;
  }): Promise<Company> {
    const { data } = await this.client.post<Company>('/companies', payload);
    return data;
  }

  async uploadCompanyLogo(id: string, file: File): Promise<Company> {
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await this.client.post<Company>(`/companies/${id}/upload-logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  async updateCompany(
    id: string,
    payload: Partial<{
      name: string;
      contactEmail: string;
      description: string;
      canCreateBrands: boolean;
      canOnboardStores: boolean;
      isActive: boolean;
      themeColors: ThemeColors;
    }>
  ): Promise<Company> {
    const { data } = await this.client.patch<Company>(`/companies/${id}`, payload);
    return data;
  }

  async onboardCompanyAdmin(
    companyId: string,
    payload: OnboardAdminPayload
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(
      `/companies/${companyId}/onboard-admin`,
      payload
    );
    return data;
  }

  // ─── Brands ───────────────────────────────────────────────────────────────

  async getBrandsByCompany(companyId: string): Promise<Brand[]> {
    const { data } = await this.client.get<Brand[]>('/brands', {
      params: { companyId },
    });
    return data;
  }

  async getBrandById(id: string, companyId: string): Promise<Brand> {
    const { data } = await this.client.get<Brand>(`/brands/${id}`, {
      params: { companyId },
    });
    return data;
  }

  async createBrand(payload: {
    name: string;
    slug: string;
    description?: string;
    companyId: string;
  }): Promise<Brand> {
    const { data } = await this.client.post<Brand>('/brands', payload);
    return data;
  }

  async updateBrand(
    id: string,
    payload: Partial<{ name: string; description: string; themeColors: ThemeColors; isActive: boolean; enabledDeliveryPlatforms: string[]; preferenceLabel: string }>
  ): Promise<Brand> {
    const { data } = await this.client.patch<Brand>(`/brands/${id}`, payload);
    return data;
  }

  async uploadBrandLogo(id: string, file: File): Promise<Brand> {
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await this.client.post<Brand>(`/brands/${id}/upload-logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async getCategories(brandId: string, type?: 'PRODUCT' | 'INVENTORY'): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>('/categories', {
      params: { brandId, ...(type ? { type } : {}) },
    });
    return data;
  }

  async createCategory(payload: { name: string; description?: string; brandId: string; type?: 'PRODUCT' | 'INVENTORY' }): Promise<Category> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Category>('/categories', body, { params: { brandId } });
    return data;
  }

  async updateCategory(id: string, payload: { name?: string; description?: string; sequenceNo?: number }): Promise<Category> {
    const { data } = await this.client.patch<Category>(`/categories/${id}`, payload);
    return data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.client.delete(`/categories/${id}`);
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  async getProducts(brandId: string): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products', { params: { brandId } });
    return data;
  }

  async createProduct(payload: {
    name: string;
    price: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    categoryId?: string;
    brandId: string;
    sizeIds?: string[];
    addonIds?: string[];
    preferenceIds?: string[];
    priceTiers?: ProductPriceTier[];
  }): Promise<Product> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Product>('/products', body, { params: { brandId } });
    return data;
  }

  async updateProduct(
    id: string,
    payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; categoryId: string; sizeIds: string[]; addonIds: string[]; preferenceIds: string[]; priceTiers: ProductPriceTier[] }>
  ): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}`, payload);
    return data;
  }

  async uploadProductImage(id: string, brandId: string, file: File): Promise<Product> {
    const formData = new FormData();
    formData.append('image', file);
    const { data } = await this.client.post<Product>(`/products/${id}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { brandId },
    });
    return data;
  }

  async removeProductImage(id: string, brandId: string): Promise<Product> {
    const { data } = await this.client.delete<Product>(`/products/${id}/image`, { params: { brandId } });
    return data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.client.delete(`/products/${id}`);
  }

  // ─── Sizes ────────────────────────────────────────────────────────────────

  async getSizes(brandId: string): Promise<Size[]> {
    const { data } = await this.client.get<Size[]>('/sizes', { params: { brandId } });
    return data;
  }

  async createSize(payload: {
    name: string;
    priceModifier: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId: string;
    priceTiers?: SizePriceTier[];
  }): Promise<Size> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Size>('/sizes', body, { params: { brandId } });
    return data;
  }

  async updateSize(id: string, payload: Partial<{ name: string; priceModifier: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number; priceTiers: SizePriceTier[] }>): Promise<Size> {
    const { data } = await this.client.patch<Size>(`/sizes/${id}`, payload);
    return data;
  }

  async deleteSize(id: string): Promise<void> {
    await this.client.delete(`/sizes/${id}`);
  }

  // ─── Addons ───────────────────────────────────────────────────────────────

  async getAddons(brandId: string): Promise<Addon[]> {
    const { data } = await this.client.get<Addon[]>('/addons', { params: { brandId } });
    return data;
  }

  async createAddon(payload: {
    name: string;
    price: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId: string;
    priceTiers?: AddonPriceTier[];
  }): Promise<Addon> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Addon>('/addons', body, { params: { brandId } });
    return data;
  }

  async updateAddon(id: string, payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number; priceTiers: AddonPriceTier[] }>): Promise<Addon> {
    const { data } = await this.client.patch<Addon>(`/addons/${id}`, payload);
    return data;
  }

  async deleteAddon(id: string): Promise<void> {
    await this.client.delete(`/addons/${id}`);
  }

  // ─── Preferences ──────────────────────────────────────────────────────────

  async getPreferences(brandId: string): Promise<Preference[]> {
    const { data } = await this.client.get<Preference[]>('/preferences', { params: { brandId } });
    return data;
  }

  async createPreference(payload: { name: string; brandId: string }): Promise<Preference> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Preference>('/preferences', body, { params: { brandId } });
    return data;
  }

  async updatePreference(id: string, payload: Partial<{ name: string; sequenceNo: number; isDefault: boolean }>): Promise<Preference> {
    const { data } = await this.client.patch<Preference>(`/preferences/${id}`, payload);
    return data;
  }

  async deletePreference(id: string): Promise<void> {
    await this.client.delete(`/preferences/${id}`);
  }

  // ─── Inventory brand templates ────────────────────────────────────────────

  async getInventoryBrandTemplates(brandId: string): Promise<InventoryBrandTemplate[]> {
    const { data } = await this.client.get<InventoryBrandTemplate[]>('/inventory/brand-templates', { params: { brandId } });
    return data;
  }

  async createInventoryBrandTemplate(payload: {
    name: string;
    unit: string;
    category?: string;
    minStockLevel?: number;
    expirationWarningDays?: number;
    brandId: string;
  }): Promise<InventoryBrandTemplate> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<InventoryBrandTemplate>('/inventory/brand-templates', body, { params: { brandId } });
    return data;
  }

  async updateInventoryBrandTemplate(
    id: string,
    payload: Partial<{ name: string; unit: string; category: string; minStockLevel: number; expirationWarningDays: number }>
  ): Promise<InventoryBrandTemplate> {
    const { data } = await this.client.patch<InventoryBrandTemplate>(`/inventory/brand-templates/${id}`, payload);
    return data;
  }

  async deleteInventoryBrandTemplate(id: string): Promise<void> {
    await this.client.delete(`/inventory/brand-templates/${id}`);
  }

  // ─── Price Tiers ──────────────────────────────────────────────────────────

  async getPriceTiers(brandId: string): Promise<PriceTier[]> {
    const { data } = await this.client.get<PriceTier[]>(`/brands/${brandId}/price-tiers`);
    return data;
  }

  async createPriceTier(brandId: string, payload: { name: string; isDefault?: boolean }): Promise<PriceTier> {
    const { data } = await this.client.post<PriceTier>(`/brands/${brandId}/price-tiers`, payload);
    return data;
  }

  async updatePriceTier(brandId: string, tierId: string, payload: { name?: string; isDefault?: boolean }): Promise<PriceTier> {
    const { data } = await this.client.patch<PriceTier>(`/brands/${brandId}/price-tiers/${tierId}`, payload);
    return data;
  }

  async deletePriceTier(brandId: string, tierId: string): Promise<void> {
    await this.client.delete(`/brands/${brandId}/price-tiers/${tierId}`);
  }

  // ─── Stores ───────────────────────────────────────────────────────────────

  async getStoresByCompany(companyId: string): Promise<Store[]> {
    const { data } = await this.client.get<Store[]>('/stores', {
      params: { companyId },
    });
    return data;
  }

  async getStoresByBrand(brandId: string): Promise<Store[]> {
    const { data } = await this.client.get<Store[]>('/stores', {
      params: { brandId },
    });
    return data;
  }

  async updateStore(
    id: string,
    payload: Partial<{ name: string; isActive: boolean; enabledDeliveryPlatforms: string[]; priceTierId: string | null }>
  ): Promise<Store> {
    const { data } = await this.client.patch<Store>(`/stores/${id}`, payload);
    return data;
  }

  async createStore(payload: {
    name: string;
    slug: string;
    brandId: string;
    companyId: string;
  }): Promise<Store> {
    const { data } = await this.client.post<Store>('/stores', payload);
    return data;
  }

  async onboardStoreAdmin(
    storeId: string,
    payload: OnboardAdminPayload
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(
      `/stores/${storeId}/onboard-admin`,
      payload
    );
    return data;
  }

  async onboardStore(payload: OnboardStorePayload): Promise<{
    store: Store;
    user: User;
    temporaryPassword: string;
  }> {
    const newStore = await this.createStore({
      name: payload.storeName,
      slug: payload.storeSlug,
      brandId: payload.brandId,
      companyId: payload.companyId,
    });
    const adminResult = await this.onboardStoreAdmin(newStore.id, payload.admin);
    return { store: newStore, ...adminResult };
  }

  async onboardStoreWithExistingUser(payload: {
    storeName: string;
    storeSlug: string;
    brandId: string;
    companyId: string;
    username: string;
  }): Promise<{ store: Store }> {
    const newStore = await this.createStore({
      name: payload.storeName,
      slug: payload.storeSlug,
      brandId: payload.brandId,
      companyId: payload.companyId,
    });
    await this.assignUserToStore(newStore.id, { username: payload.username, role: 'STORE_ADMIN' });
    return { store: newStore };
  }

  async searchCompanyUsers(companyId: string, query: string): Promise<User[]> {
    const { data } = await this.client.get<User[]>('/users/search', {
      params: { q: query, companyId },
    });
    return data;
  }

  async assignUserToStore(storeId: string, payload: { username: string; role: 'STORE_ADMIN' | 'CASHIER' }): Promise<void> {
    await this.client.post(`/users/stores/${storeId}/assign`, payload);
  }

  async revokeStoreAccess(storeId: string, userId: string): Promise<void> {
    await this.client.delete(`/users/stores/${storeId}/${userId}/access`);
  }

  // ─── Platform user management ─────────────────────────────────────────────

  async getCompanyAllUsers(companyId: string): Promise<{
    companyAdmins: User[];
    storeUsers: (User & { tenant: { id: string; name: string; slug: string } | null })[];
  }> {
    const { data } = await this.client.get(`/users/company/${companyId}/all`);
    return data;
  }

  async resetUserPassword(userId: string): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/users/${userId}/reset-password`);
    return data;
  }

  async createStoreUser(
    storeId: string,
    payload: { firstName: string; lastName: string; email: string; username: string; role: 'STORE_ADMIN' | 'CASHIER' }
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/users/stores/${storeId}`, payload);
    return data;
  }

  async updateCompanyUser(companyId: string, userId: string, payload: { isActive: boolean }): Promise<User> {
    const { data } = await this.client.patch(`/users/companies/${companyId}/${userId}`, payload);
    return data;
  }

  async createCompanyUser(
    companyId: string,
    payload: { firstName: string; lastName: string; email: string; username: string; companyPrivileges?: CompanyPrivileges | null }
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/users/companies/${companyId}`, payload);
    return data;
  }

  async updateCompanyUserPrivileges(
    companyId: string,
    userId: string,
    companyPrivileges: CompanyPrivileges | null,
  ): Promise<User> {
    const { data } = await this.client.patch<User>(
      `/users/companies/${companyId}/${userId}`,
      { companyPrivileges },
    );
    return data;
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    const { data } = await this.client.delete(`/users/${userId}`);
    return data;
  }

  async deleteUserPermanently(userId: string): Promise<{ message: string }> {
    const { data } = await this.client.delete(`/users/${userId}/permanent`);
    return data;
  }

  // ─── Platform admin management ────────────────────────────────────────────

  async getPlatformAdmins(): Promise<User[]> {
    const { data } = await this.client.get<User[]>('/platform/admins');
    return data;
  }

  async createPlatformAdmin(payload: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
  }): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post('/platform/admins', payload);
    return data;
  }

  async updatePlatformAdmin(
    id: string,
    payload: { isActive: boolean }
  ): Promise<User> {
    const { data } = await this.client.patch<User>(`/platform/admins/${id}`, payload);
    return data;
  }

  async resetPlatformAdminPassword(
    id: string
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/platform/admins/${id}/reset-password`);
    return data;
  }

  async deletePlatformAdmin(id: string): Promise<{ message: string }> {
    const { data } = await this.client.delete(`/platform/admins/${id}`);
    return data;
  }

  // ─── App Releases ─────────────────────────────────────────────────────────

  async getAppReleases(): Promise<AppRelease[]> {
    const { data } = await this.client.get<AppRelease[]>('/app-releases');
    return data;
  }

  async uploadAppRelease(formData: FormData): Promise<AppRelease> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('auth_token') : this.token;
    const { data } = await axios.post<AppRelease>(
      `${UPLOAD_BASE_URL}/app-releases`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    return data;
  }

  async updateAppRelease(
    id: string,
    payload: { releaseNotes?: string[]; forceUpdate?: boolean; status?: string },
  ): Promise<AppRelease> {
    const { data } = await this.client.patch<AppRelease>(`/app-releases/${id}`, payload);
    return data;
  }

  async deleteAppRelease(id: string): Promise<void> {
    await this.client.delete(`/app-releases/${id}`);
  }

}

export const api = new ApiClient();
