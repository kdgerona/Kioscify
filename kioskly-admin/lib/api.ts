import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  AuthResponse,
  LoginCredentials,
  Transaction,
  Product,
  Category,
  Size,
  Addon,
  Tenant,
  ApiError,
  InventoryItem,
  InventoryRecord,
  LatestInventoryItem,
  InventoryStats,
  SubmittedReport,
} from '@/types';

// API base URL - includes the /api/v1 prefix
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      // Always read from localStorage to ensure we have the latest token
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('auth_token')
        : this.token;

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        // Sync the cache if token exists in localStorage but not in memory
        if (token && token !== this.token) {
          this.token = token;
        }
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401) {
          // Unauthorized - clear token and redirect to login
          this.clearToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );

    // Load token from localStorage on initialization
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    // Always read from localStorage to ensure we have the latest token
    // This prevents stale cached values in Next.js SSR/hydration scenarios
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token && token !== this.token) {
        this.token = token; // Sync the cache
      }
      return token;
    }
    return this.token;
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>('/auth/login', credentials);
    this.setToken(data.accessToken);
    return data;
  }

  logout() {
    this.clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  // Transactions endpoints
  async getTransactions(params?: {
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    transactionId?: string;
  }): Promise<Transaction[]> {
    const { data } = await this.client.get<Transaction[]>('/transactions', { params });
    return data;
  }

  async getTransactionById(id: string): Promise<Transaction> {
    const { data } = await this.client.get<Transaction>(`/transactions/${id}`);
    return data;
  }

  async getTransactionStats(): Promise<{
    totalSales: number;
    totalTransactions: number;
    averageOrderValue: number;
    topProducts: Array<{ product: Product; totalSold: number; revenue: number }>;
  }> {
    const { data } = await this.client.get('/transactions/stats');
    return data;
  }

  // Products endpoints
  async getProducts(): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products');
    return data;
  }

  async getProductById(id: string): Promise<Product> {
    const { data } = await this.client.get<Product>(`/products/${id}`);
    return data;
  }

  async createProduct(product: { name: string; categoryId: string; price: number; id?: string }): Promise<Product> {
    const { data } = await this.client.post<Product>('/products', product);
    return data;
  }

  async updateProduct(id: string, product: { name?: string; categoryId?: string; price?: number }): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}`, product);
    return data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.client.delete(`/products/${id}`);
  }

  // Categories endpoints
  async getCategories(): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>('/categories');
    return data;
  }

  async getCategoryById(id: string): Promise<Category> {
    const { data } = await this.client.get<Category>(`/categories/${id}`);
    return data;
  }

  async createCategory(category: Omit<Category, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    const { data } = await this.client.post<Category>('/categories', category);
    return data;
  }

  async updateCategory(id: string, category: Partial<Omit<Category, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<Category> {
    const { data } = await this.client.patch<Category>(`/categories/${id}`, category);
    return data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.client.delete(`/categories/${id}`);
  }

  // Sizes endpoints
  async getSizes(): Promise<Size[]> {
    const { data } = await this.client.get<Size[]>('/sizes');
    return data;
  }

  async createSize(size: Omit<Size, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Size> {
    const { data } = await this.client.post<Size>('/sizes', size);
    return data;
  }

  async updateSize(id: string, size: Partial<Omit<Size, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<Size> {
    const { data } = await this.client.patch<Size>(`/sizes/${id}`, size);
    return data;
  }

  async deleteSize(id: string): Promise<void> {
    await this.client.delete(`/sizes/${id}`);
  }

  // Addons endpoints
  async getAddons(): Promise<Addon[]> {
    const { data } = await this.client.get<Addon[]>('/addons');
    return data;
  }

  async createAddon(addon: Omit<Addon, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<Addon> {
    const { data } = await this.client.post<Addon>('/addons', addon);
    return data;
  }

  async updateAddon(id: string, addon: Partial<Omit<Addon, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<Addon> {
    const { data } = await this.client.patch<Addon>(`/addons/${id}`, addon);
    return data;
  }

  async deleteAddon(id: string): Promise<void> {
    await this.client.delete(`/addons/${id}`);
  }

  // Tenant endpoints
  async getCurrentTenant(): Promise<Tenant> {
    const { data } = await this.client.get<Tenant>('/tenants/me');
    return data;
  }

  // Reports endpoints
  async getAnalytics(params?: {
    period?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'overall' | 'custom';
    startDate?: string;
    endDate?: string;
  }): Promise<{
    period: {
      type: string;
      start: string;
      end: string;
    };
    sales: {
      totalAmount: number;
      transactionCount: number;
      averageTransaction: number;
      totalItemsSold: number;
      paymentMethodBreakdown: Record<string, { total: number; count: number }>;
      growth: number;
    };
    expenses: {
      totalAmount: number;
      expenseCount: number;
      averageExpense: number;
      categoryBreakdown: Record<string, { total: number; count: number }>;
    };
    summary: {
      grossProfit: number;
      profitMargin: number;
      netRevenue: number;
    };
    topProducts: Array<{
      productId: string;
      productName: string;
      quantity: number;
      revenue: number;
    }>;
    salesByDay: Array<{
      date: string;
      total: number;
      count: number;
    }>;
  }> {
    const { data } = await this.client.get('/reports/analytics', { params });
    return data;
  }

  // Inventory Items endpoints
  async getInventoryItems(category?: string): Promise<InventoryItem[]> {
    const { data } = await this.client.get<InventoryItem[]>('/inventory/items', {
      params: category ? { category } : undefined,
    });
    return data;
  }

  async getInventoryItemById(id: string): Promise<InventoryItem> {
    const { data } = await this.client.get<InventoryItem>(`/inventory/items/${id}`);
    return data;
  }

  async createInventoryItem(item: Omit<InventoryItem, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> {
    const { data } = await this.client.post<InventoryItem>('/inventory/items', item);
    return data;
  }

  async updateInventoryItem(id: string, item: Partial<Omit<InventoryItem, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<InventoryItem> {
    const { data } = await this.client.patch<InventoryItem>(`/inventory/items/${id}`, item);
    return data;
  }

  async deleteInventoryItem(id: string): Promise<void> {
    await this.client.delete(`/inventory/items/${id}`);
  }

  // Inventory Records endpoints
  async getInventoryRecords(params?: {
    startDate?: string;
    endDate?: string;
    inventoryItemId?: string;
  }): Promise<InventoryRecord[]> {
    const { data } = await this.client.get<InventoryRecord[]>('/inventory/records', { params });
    return data;
  }

  async getLatestInventory(date?: string): Promise<LatestInventoryItem[]> {
    const { data } = await this.client.get<LatestInventoryItem[]>('/inventory/latest', {
      params: date ? { date } : undefined,
    });
    return data;
  }

  async createInventoryRecord(record: {
    inventoryItemId: string;
    quantity: number;
    date?: string;
    notes?: string;
  }): Promise<InventoryRecord> {
    const { data } = await this.client.post<InventoryRecord>('/inventory/records', record);
    return data;
  }

  async bulkCreateInventoryRecords(records: Array<{
    inventoryItemId: string;
    quantity: number;
    date?: string;
    notes?: string;
  }>): Promise<InventoryRecord[]> {
    const { data } = await this.client.post<InventoryRecord[]>('/inventory/records/bulk', { records });
    return data;
  }

  async getInventoryStats(): Promise<InventoryStats> {
    const { data } = await this.client.get<InventoryStats>('/inventory/stats');
    return data;
  }

  // Submitted Reports endpoints
  async getSubmittedReports(params?: {
    reportDate?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
  }): Promise<SubmittedReport[]> {
    const { data } = await this.client.get<SubmittedReport[]>('/submitted-reports', { params });
    return data;
  }

  async getSubmittedReportById(id: string): Promise<SubmittedReport> {
    const { data } = await this.client.get<SubmittedReport>(`/submitted-reports/${id}`);
    return data;
  }

  async getSubmittedReportsStats(): Promise<{
    totalReports: number;
    reportsThisMonth: number;
  }> {
    const { data } = await this.client.get('/submitted-reports/stats');
    return data;
  }
}

export const api = new ApiClient();
