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

    // Handle 401 globally
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
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
    payload: Partial<{ name: string; description: string }>
  ): Promise<Brand> {
    const { data } = await this.client.patch<Brand>(`/brands/${id}`, payload);
    return data;
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async getCategories(brandId: string): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>('/categories', {
      params: { brandId },
    });
    return data;
  }

  async createCategory(payload: { name: string; brandId: string }): Promise<Category> {
    const { data } = await this.client.post<Category>('/categories', payload);
    return data;
  }

  async updateCategory(id: string, payload: { name: string }): Promise<Category> {
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
    categoryId: string;
    brandId: string;
    sizeIds?: string[];
    addonIds?: string[];
  }): Promise<Product> {
    const { data } = await this.client.post<Product>('/products', payload);
    return data;
  }

  async updateProduct(
    id: string,
    payload: Partial<{ name: string; price: number; categoryId: string; sizeIds: string[]; addonIds: string[] }>
  ): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}`, payload);
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
    brandId: string;
  }): Promise<Size> {
    const { data } = await this.client.post<Size>('/sizes', payload);
    return data;
  }

  async updateSize(id: string, payload: Partial<{ name: string; priceModifier: number }>): Promise<Size> {
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
    brandId: string;
  }): Promise<Addon> {
    const { data } = await this.client.post<Addon>('/addons', payload);
    return data;
  }

  async updateAddon(id: string, payload: Partial<{ name: string; price: number }>): Promise<Addon> {
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
    const { data } = await this.client.post<InventoryBrandTemplate>(
      '/inventory/brand-templates',
      payload
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
}

export const api = new ApiClient();
