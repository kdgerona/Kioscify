import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  AuthResponse,
  Company,
  Brand,
  Store,
  PlatformStats,
  User,
  OnboardAdminPayload,
  OnboardStorePayload,
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

  async updateCompany(
    id: string,
    payload: Partial<{
      name: string;
      contactEmail: string;
      description: string;
      canCreateBrands: boolean;
      canOnboardStores: boolean;
      isActive: boolean;
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

  async createBrand(payload: {
    name: string;
    slug: string;
    description?: string;
    companyId: string;
  }): Promise<Brand> {
    const { data } = await this.client.post<Brand>('/brands', payload);
    return data;
  }

  // ─── Stores ───────────────────────────────────────────────────────────────

  async getStoresByBrand(brandId: string): Promise<Store[]> {
    const { data } = await this.client.get<Store[]>('/stores', {
      params: { brandId },
    });
    return data;
  }

  async createStore(payload: {
    name: string;
    slug: string;
    brandId: string;
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
    // Create store first, then onboard admin
    const newStore = await this.createStore({
      name: payload.storeName,
      slug: payload.storeSlug,
      brandId: payload.brandId,
    });
    const adminResult = await this.onboardStoreAdmin(newStore.id, payload.admin);
    return { store: newStore, ...adminResult };
  }
}

export const api = new ApiClient();
