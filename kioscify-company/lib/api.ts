import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  AuthResponse,
  Company,
  Brand,
  Category,
  Product,
  Size,
  Addon,
  InventoryBrandTemplate,
  User,
  CompanyUserCreatePayload,
} from '@/types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    // Always read latest token from localStorage on each request
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

    // Handle 401 globally — but not on auth endpoints (wrong password should show inline error)
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

  logout() {
    this.clearToken();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async login(credentials: {
    username: string;
    password: string;
    companySlug: string;
  }): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>(
      '/auth/company-login',
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

  getCurrentUser(): import('@/types').User | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ─── Company ──────────────────────────────────────────────────────────────

  async getMyCompany(): Promise<Company> {
    const { data } = await this.client.get<Company>('/companies/me');
    return data;
  }

  async updateCompany(
    id: string,
    payload: Partial<Pick<Company, 'name' | 'contactEmail' | 'description'>>
  ): Promise<Company> {
    const { data } = await this.client.patch<Company>(`/companies/${id}`, payload);
    return data;
  }

  // ─── Brands ───────────────────────────────────────────────────────────────

  async getBrands(): Promise<Brand[]> {
    const { data } = await this.client.get<Brand[]>('/brands');
    return data;
  }

  async getBrandById(id: string): Promise<Brand> {
    const { data } = await this.client.get<Brand>(`/brands/${id}`);
    return data;
  }

  async createBrand(payload: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<Brand> {
    const { data } = await this.client.post<Brand>('/brands', payload);
    return data;
  }

  async updateBrand(
    id: string,
    payload: Partial<{
      name: string;
      description: string;
      themeColors: Brand['themeColors'];
      isActive: boolean;
      enabledDeliveryPlatforms: string[];
    }>
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
    const { data } = await this.client.get<Product[]>('/products', {
      params: { brandId },
    });
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
  }): Promise<Product> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Product>('/products', body, { params: { brandId } });
    return data;
  }

  async updateProduct(
    id: string,
    payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; categoryId: string; sizeIds: string[]; addonIds: string[] }>
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

  async deleteProduct(id: string): Promise<void> {
    await this.client.delete(`/products/${id}`);
  }

  // ─── Sizes ────────────────────────────────────────────────────────────────

  async getSizes(brandId: string): Promise<Size[]> {
    const { data } = await this.client.get<Size[]>('/sizes', {
      params: { brandId },
    });
    return data;
  }

  async createSize(payload: {
    name: string;
    priceModifier: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId: string;
  }): Promise<Size> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Size>('/sizes', body, { params: { brandId } });
    return data;
  }

  async updateSize(id: string, payload: Partial<{ name: string; priceModifier: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number }>): Promise<Size> {
    const { data } = await this.client.patch<Size>(`/sizes/${id}`, payload);
    return data;
  }

  async deleteSize(id: string): Promise<void> {
    await this.client.delete(`/sizes/${id}`);
  }

  // ─── Addons ───────────────────────────────────────────────────────────────

  async getAddons(brandId: string): Promise<Addon[]> {
    const { data } = await this.client.get<Addon[]>('/addons', {
      params: { brandId },
    });
    return data;
  }

  async createAddon(payload: {
    name: string;
    price: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId: string;
  }): Promise<Addon> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Addon>('/addons', body, { params: { brandId } });
    return data;
  }

  async updateAddon(id: string, payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number }>): Promise<Addon> {
    const { data } = await this.client.patch<Addon>(`/addons/${id}`, payload);
    return data;
  }

  async deleteAddon(id: string): Promise<void> {
    await this.client.delete(`/addons/${id}`);
  }

  // ─── Inventory brand templates ────────────────────────────────────────────

  async getInventoryBrandTemplates(brandId: string): Promise<InventoryBrandTemplate[]> {
    const { data } = await this.client.get<InventoryBrandTemplate[]>(
      '/inventory/brand-templates',
      { params: { brandId } }
    );
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
    const { data } = await this.client.post<InventoryBrandTemplate>(
      '/inventory/brand-templates',
      body,
      { params: { brandId } }
    );
    return data;
  }

  async updateInventoryBrandTemplate(
    id: string,
    payload: Partial<{ name: string; unit: string; category: string; minStockLevel: number; expirationWarningDays: number }>
  ): Promise<InventoryBrandTemplate> {
    const { data } = await this.client.patch<InventoryBrandTemplate>(
      `/inventory/brand-templates/${id}`,
      payload
    );
    return data;
  }

  async deleteInventoryBrandTemplate(id: string): Promise<void> {
    await this.client.delete(`/inventory/brand-templates/${id}`);
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  async getCompanyUsers(companyId: string): Promise<User[]> {
    const { data } = await this.client.get<User[]>(
      `/users/companies/${companyId}`
    );
    return data;
  }

  async createCompanyUser(
    companyId: string,
    payload: CompanyUserCreatePayload
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(
      `/users/companies/${companyId}`,
      payload
    );
    return data;
  }

  async updateCompanyUser(
    companyId: string,
    userId: string,
    payload: Partial<CompanyUserCreatePayload & { isActive: boolean }>
  ): Promise<User> {
    const { data } = await this.client.patch<User>(
      `/users/companies/${companyId}/${userId}`,
      payload
    );
    return data;
  }

  async deactivateCompanyUser(companyId: string, userId: string): Promise<User> {
    const { data } = await this.client.delete<User>(
      `/users/companies/${companyId}/${userId}`
    );
    return data;
  }

  // ─── Store user assignment (multi-store) ──────────────────────────────────

  async getStores(brandId: string): Promise<any[]> {
    const { data } = await this.client.get('/stores', { params: { brandId } });
    return data;
  }

  async updateStore(storeId: string, payload: { name: string }): Promise<any> {
    const { data } = await this.client.patch(`/stores/${storeId}`, payload);
    return data;
  }

  async getStoreUsers(storeId: string): Promise<User[]> {
    const { data } = await this.client.get<User[]>(`/users/stores/${storeId}`);
    return data;
  }

  async searchUsersInCompany(query: string): Promise<User[]> {
    const { data } = await this.client.get<User[]>('/users/search', { params: { q: query } });
    return data;
  }

  async assignUserToStore(storeId: string, payload: { username: string; role: 'STORE_ADMIN' | 'CASHIER' }): Promise<void> {
    await this.client.post(`/users/stores/${storeId}/assign`, payload);
  }

  async revokeStoreAccess(storeId: string, userId: string): Promise<void> {
    await this.client.delete(`/users/stores/${storeId}/${userId}/access`);
  }
}

export const api = new ApiClient();
