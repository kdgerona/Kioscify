import axios, { AxiosInstance, AxiosError } from "axios";
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
  User,
  StoreUserCreatePayload,
  TimeOfDayData,
  SubmittedReport,
  UserShiftReport,
  UserShiftInventoryReport,
  Expense,
  AssignableUser,
  StoreAccess,
  StorePrivileges,
  UserSession,
  SessionStatus,
  StaffTimeLog,
  TimeLogEventType,
} from "@/types";

// API base URL - includes the /api/v1 prefix
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      // Always read from localStorage to ensure we have the latest token
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth_token")
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
        const isAuthEndpoint = error.config?.url?.includes('/auth/');
        if (error.response?.status === 401 && !isAuthEndpoint) {
          this.clearToken();
          if (typeof window !== "undefined") {
            const companySlug = localStorage.getItem("kioscify_portal_company_slug");
            const brandSlug = localStorage.getItem("kioscify_portal_brand_slug");
            window.location.href =
              companySlug && brandSlug ? `/${companySlug}/${brandSlug}` : "/login";
          }
        }
        return Promise.reject(error);
      }
    );

    // Load token from localStorage on initialization
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
  }

  getToken() {
    // Always read from localStorage to ensure we have the latest token
    // This prevents stale cached values in Next.js SSR/hydration scenarios
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");
      if (token && token !== this.token) {
        this.token = token; // Sync the cache
      }
      return token;
    }
    return this.token;
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>("/auth/login", credentials);
    this.setToken(data.accessToken);
    if (typeof window !== "undefined" && data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
      // Persist accessible stores list for sidebar switcher
      const stores = (data as any).stores;
      if (stores) localStorage.setItem("kioscify_accessible_stores", JSON.stringify(stores));
    }
    return data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const { data } = await this.client.post("/auth/change-password", { currentPassword, newPassword });
    return data;
  }

  async switchStore(targetStoreId: string): Promise<{ accessToken: string; activeStore: { id: string; name: string; slug: string } }> {
    const { data } = await this.client.post("/auth/switch-store", { targetStoreId });
    return data;
  }

  logout() {
    this.clearToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("user");
      localStorage.removeItem("kioscify_accessible_stores");
      const companySlug = localStorage.getItem("kioscify_portal_company_slug");
      const brandSlug = localStorage.getItem("kioscify_portal_brand_slug");
      window.location.href =
        companySlug && brandSlug ? `/${companySlug}/${brandSlug}` : "/login";
    }
  }

  // Transactions endpoints
  async getTransactions(params?: {
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    search?: string;
  }): Promise<Transaction[]> {
    const { data } = await this.client.get<Transaction[]>("/transactions", {
      params,
    });
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
    topProducts: Array<{
      product: Product;
      totalSold: number;
      revenue: number;
    }>;
  }> {
    const { data } = await this.client.get("/transactions/stats");
    return data;
  }

  // Void request endpoints
  async getVoidRequests(params?: {
    status?: "PENDING" | "APPROVED" | "REJECTED" | "ALL";
    startDate?: string;
    endDate?: string;
  }): Promise<Transaction[]> {
    const { data } = await this.client.get<Transaction[]>(
      "/transactions/void-requests",
      { params }
    );
    return data;
  }

  async approveVoidRequest(id: string): Promise<Transaction> {
    const { data } = await this.client.patch<Transaction>(
      `/transactions/void-requests/${id}/approve`
    );
    return data;
  }

  async rejectVoidRequest(
    id: string,
    rejectionReason?: string
  ): Promise<Transaction> {
    const { data } = await this.client.patch<Transaction>(
      `/transactions/void-requests/${id}/reject`,
      { rejectionReason }
    );
    return data;
  }

  async requestVoidTransaction(id: string, reason: string): Promise<Transaction> {
    const { data } = await this.client.post<Transaction>(
      `/transactions/${id}/void-request`,
      { reason }
    );
    return data;
  }

  // Expenses endpoints
  async getExpenses(params?: {
    startDate?: string;
    endDate?: string;
    category?: string;
  }): Promise<Expense[]> {
    const { data } = await this.client.get<Expense[]>("/expenses", { params });
    return data;
  }

  async getExpenseById(id: string): Promise<Expense> {
    const { data } = await this.client.get<Expense>(`/expenses/${id}`);
    return data;
  }

  // Expense Void request endpoints
  async getExpenseVoidRequests(params?: {
    status?: "PENDING" | "APPROVED" | "REJECTED" | "ALL";
    startDate?: string;
    endDate?: string;
  }): Promise<Expense[]> {
    const { data } = await this.client.get<Expense[]>(
      "/expenses/void-requests",
      { params }
    );
    return data;
  }

  async approveExpenseVoidRequest(id: string): Promise<Expense> {
    const { data } = await this.client.patch<Expense>(
      `/expenses/void-requests/${id}/approve`
    );
    return data;
  }

  async rejectExpenseVoidRequest(
    id: string,
    rejectionReason?: string
  ): Promise<Expense> {
    const { data } = await this.client.patch<Expense>(
      `/expenses/void-requests/${id}/reject`,
      { rejectionReason }
    );
    return data;
  }

  async requestVoidExpense(id: string, reason: string): Promise<Expense> {
    const { data } = await this.client.post<Expense>(
      `/expenses/${id}/void-request`,
      { reason }
    );
    return data;
  }

  // Products endpoints
  async getProducts(): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>("/products");
    return data;
  }

  async getProductById(id: string): Promise<Product> {
    const { data } = await this.client.get<Product>(`/products/${id}`);
    return data;
  }

  async createProduct(product: {
    name: string;
    categoryId: string;
    price: number;
    id?: string;
    sizeIds?: string[];
    addonIds?: string[];
  }): Promise<Product> {
    const { data } = await this.client.post<Product>("/products", product);
    return data;
  }

  async updateProduct(
    id: string,
    product: {
      name?: string;
      categoryId?: string;
      price?: number;
      sizeIds?: string[];
      addonIds?: string[];
    }
  ): Promise<Product> {
    const { data } = await this.client.patch<Product>(
      `/products/${id}`,
      product
    );
    return data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.client.delete(`/products/${id}`);
  }

  async uploadProductImage(id: string, file: File): Promise<Product> {
    const formData = new FormData();
    formData.append("image", file);

    const { data } = await this.client.post<Product>(
      `/products/${id}/image`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return data;
  }

  // Categories endpoints
  async getCategories(): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>("/categories");
    return data;
  }

  async getCategoryById(id: string): Promise<Category> {
    const { data } = await this.client.get<Category>(`/categories/${id}`);
    return data;
  }

  async createCategory(
    category: Omit<Category, "id" | "tenantId" | "createdAt" | "updatedAt">
  ): Promise<Category> {
    const { data } = await this.client.post<Category>("/categories", category);
    return data;
  }

  async updateCategory(
    id: string,
    category: Partial<
      Omit<Category, "id" | "tenantId" | "createdAt" | "updatedAt">
    >
  ): Promise<Category> {
    const { data } = await this.client.patch<Category>(
      `/categories/${id}`,
      category
    );
    return data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.client.delete(`/categories/${id}`);
  }

  // Sizes endpoints
  async getSizes(): Promise<Size[]> {
    const { data } = await this.client.get<Size[]>("/sizes");
    return data;
  }

  async createSize(
    size: Omit<Size, "id" | "tenantId" | "createdAt" | "updatedAt">
  ): Promise<Size> {
    const { data } = await this.client.post<Size>("/sizes", size);
    return data;
  }

  async updateSize(
    id: string,
    size: Partial<Omit<Size, "id" | "tenantId" | "createdAt" | "updatedAt">>
  ): Promise<Size> {
    const { data } = await this.client.patch<Size>(`/sizes/${id}`, size);
    return data;
  }

  async deleteSize(id: string): Promise<void> {
    await this.client.delete(`/sizes/${id}`);
  }

  // Addons endpoints
  async getAddons(): Promise<Addon[]> {
    const { data } = await this.client.get<Addon[]>("/addons");
    return data;
  }

  async createAddon(
    addon: Omit<Addon, "id" | "tenantId" | "createdAt" | "updatedAt">
  ): Promise<Addon> {
    const { data } = await this.client.post<Addon>("/addons", addon);
    return data;
  }

  async updateAddon(
    id: string,
    addon: Partial<Omit<Addon, "id" | "tenantId" | "createdAt" | "updatedAt">>
  ): Promise<Addon> {
    const { data } = await this.client.patch<Addon>(`/addons/${id}`, addon);
    return data;
  }

  async deleteAddon(id: string): Promise<void> {
    await this.client.delete(`/addons/${id}`);
  }

  // Tenant endpoints
  async getCurrentTenant(): Promise<Tenant> {
    const { data } = await this.client.get<Tenant>("/tenants/me");
    return data;
  }

  // Reports endpoints
  async getAnalytics(params?: {
    period?: "daily" | "yesterday" | "weekly" | "monthly" | "yearly" | "overall" | "custom";
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
    const { data } = await this.client.get("/reports/analytics", { params });
    return data;
  }

  // Inventory Items endpoints
  async getInventoryItems(category?: string): Promise<InventoryItem[]> {
    const { data } = await this.client.get<InventoryItem[]>(
      "/inventory/items",
      {
        params: category ? { category } : undefined,
      }
    );
    return data;
  }

  async getInventoryItemById(id: string): Promise<InventoryItem> {
    const { data } = await this.client.get<InventoryItem>(
      `/inventory/items/${id}`
    );
    return data;
  }

  async createInventoryItem(
    item: Omit<InventoryItem, "id" | "tenantId" | "createdAt" | "updatedAt">
  ): Promise<InventoryItem> {
    const { data } = await this.client.post<InventoryItem>(
      "/inventory/items",
      item
    );
    return data;
  }

  async updateInventoryItem(
    id: string,
    item: Partial<
      Omit<InventoryItem, "id" | "tenantId" | "createdAt" | "updatedAt">
    >
  ): Promise<InventoryItem> {
    const { data } = await this.client.patch<InventoryItem>(
      `/inventory/items/${id}`,
      item
    );
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
    const { data } = await this.client.get<InventoryRecord[]>(
      "/inventory/records",
      { params }
    );
    return data;
  }

  async getLatestInventory(date?: string): Promise<LatestInventoryItem[]> {
    const { data } = await this.client.get<LatestInventoryItem[]>(
      "/inventory/latest",
      {
        params: date ? { date } : undefined,
      }
    );
    return data;
  }

  async createInventoryRecord(record: {
    inventoryItemId: string;
    quantity: number;
    date?: string;
    notes?: string;
  }): Promise<InventoryRecord> {
    const { data } = await this.client.post<InventoryRecord>(
      "/inventory/records",
      record
    );
    return data;
  }

  async bulkCreateInventoryRecords(
    records: Array<{
      inventoryItemId: string;
      quantity: number;
      date?: string;
      notes?: string;
    }>
  ): Promise<InventoryRecord[]> {
    const { data } = await this.client.post<InventoryRecord[]>(
      "/inventory/records/bulk",
      { records }
    );
    return data;
  }

  async getInventoryStats(): Promise<InventoryStats> {
    const { data } = await this.client.get<InventoryStats>("/inventory/stats");
    return data;
  }

  // Submitted Reports endpoints
  async getSubmittedReports(params?: {
    reportDate?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
  }): Promise<SubmittedReport[]> {
    const { data } = await this.client.get<SubmittedReport[]>(
      "/submitted-reports",
      { params }
    );
    return data;
  }

  async getSubmittedReportById(id: string): Promise<SubmittedReport> {
    const { data } = await this.client.get<SubmittedReport>(
      `/submitted-reports/${id}`
    );
    return data;
  }

  async getSubmittedReportsStats(): Promise<{
    totalReports: number;
    reportsThisMonth: number;
  }> {
    const { data } = await this.client.get("/submitted-reports/stats");
    return data;
  }

  // Submitted Inventory Reports endpoints
  async getSubmittedInventoryReports(params?: {
    reportDate?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
  }): Promise<any[]> {
    const { data } = await this.client.get("/submitted-inventory-reports", {
      params,
    });
    return data;
  }

  async getSubmittedInventoryReportById(id: string): Promise<any> {
    const { data } = await this.client.get(
      `/submitted-inventory-reports/${id}`
    );
    return data;
  }

  async getInventoryProgression(params: {
    viewMode: "day_over_day" | "weekly_trend";
    startDate?: string;
    endDate?: string;
    categoryFilter?: string;
  }): Promise<any> {
    const { data } = await this.client.get(
      "/submitted-inventory-reports/progression",
      { params }
    );
    return data;
  }

  async getInventoryAlerts(): Promise<any> {
    const { data } = await this.client.get(
      "/submitted-inventory-reports/alerts"
    );
    return data;
  }

  async getInventoryReportStats(): Promise<{
    totalReports: number;
    reportsThisMonth: number;
    lastSubmission: {
      date: string;
      submittedAt: string;
    } | null;
  }> {
    const { data } = await this.client.get(
      "/submitted-inventory-reports/stats"
    );
    return data;
  }
  // User Shift Reports endpoints
  async getUserShiftReports(params?: {
    reportDate?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<UserShiftReport[]> {
    const { data } = await this.client.get<UserShiftReport[]>("/user-shift-reports", { params });
    return data;
  }

  async getUserShiftReportById(id: string): Promise<UserShiftReport> {
    const { data } = await this.client.get<UserShiftReport>(`/user-shift-reports/${id}`);
    return data;
  }

  async getUserShiftReportsStats(): Promise<{
    totalReports: number;
    reportsThisMonth: number;
    lastSubmission: { date: string; submittedAt: string } | null;
  }> {
    const { data } = await this.client.get("/user-shift-reports/stats");
    return data;
  }

  // User Shift Inventory Reports endpoints
  async getUserShiftInventoryReports(params?: {
    reportDate?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<UserShiftInventoryReport[]> {
    const { data } = await this.client.get<UserShiftInventoryReport[]>("/user-shift-inventory-reports", { params });
    return data;
  }

  async getUserShiftInventoryReportById(id: string): Promise<UserShiftInventoryReport> {
    const { data } = await this.client.get<UserShiftInventoryReport>(`/user-shift-inventory-reports/${id}`);
    return data;
  }

  // ─── Store assignment (multi-store) ───────────────────────────────────────

  async getMyStoreAccess(userId: string): Promise<StoreAccess[]> {
    const { data } = await this.client.get<StoreAccess[]>(`/users/${userId}/stores`);
    return data;
  }

  async getAssignablePool(storeId: string, q?: string): Promise<AssignableUser[]> {
    const { data } = await this.client.get<AssignableUser[]>(`/users/stores/${storeId}/assignable-pool`, {
      params: q ? { q } : undefined,
    });
    return data;
  }

  async assignUserToStore(storeId: string, payload: { username: string; role: 'STORE_ADMIN' | 'CASHIER' }): Promise<void> {
    await this.client.post(`/users/stores/${storeId}/assign`, payload);
  }

  async revokeStoreAccess(storeId: string, userId: string): Promise<void> {
    await this.client.delete(`/users/stores/${storeId}/${userId}/access`);
  }

  async searchUsersInCompany(query: string): Promise<User[]> {
    const { data } = await this.client.get<User[]>('/users/search', { params: { q: query } });
    return data;
  }

  // ─── User management (store-level) ────────────────────────────────────────

  async getStoreUsers(storeId: string): Promise<User[]> {
    const { data } = await this.client.get<User[]>(`/users/stores/${storeId}`);
    return data;
  }

  async createStoreUser(storeId: string, payload: StoreUserCreatePayload): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/users/stores/${storeId}`, payload);
    return data;
  }

  async updateStoreUser(storeId: string, userId: string, payload: Partial<StoreUserCreatePayload & { isActive: boolean }>): Promise<User> {
    const { data } = await this.client.patch<User>(`/users/stores/${storeId}/${userId}`, payload);
    return data;
  }

  async deactivateStoreUser(storeId: string, userId: string): Promise<User> {
    const { data } = await this.client.delete<User>(`/users/stores/${storeId}/${userId}`);
    return data;
  }

  async resetStoreUserPassword(storeId: string, userId: string): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/users/stores/${storeId}/${userId}/reset-password`);
    return data;
  }

  async updateStoreUserPrivileges(storeId: string, userId: string, storePrivileges: StorePrivileges | null): Promise<User> {
    const { data } = await this.client.patch<User>(`/users/stores/${storeId}/${userId}`, { storePrivileges });
    return data;
  }

  async getStoreSessions(storeId: string, filters: {
    search?: string;
    status?: SessionStatus;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: UserSession[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await this.client.get(`/users/stores/${storeId}/sessions`, { params: filters });
    return data;
  }

  // ─── Staff time logs (attendance) ──────────────────────────────────────────

  async getStaffTimeLogs(filters: {
    userId?: string;
    eventType?: TimeLogEventType | "TIME_IN" | "TIME_OUT";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: StaffTimeLog[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { data } = await this.client.get(`/staff-time-logs`, { params: filters });
    return data;
  }

  // ─── Reports — time of day ─────────────────────────────────────────────────

  async getTimeOfDayTrends(startDate: string, endDate: string): Promise<{ period: { start: string; end: string }; hourlyBreakdown: TimeOfDayData[] }> {
    const { data } = await this.client.get("/reports/time-of-day", {
      params: { startDate, endDate },
    });
    return data;
  }

  // ─── Store inventory items (brand copies) ─────────────────────────────────

  async getStoreInventoryItems(category?: string): Promise<InventoryItem[]> {
    const { data } = await this.client.get<InventoryItem[]>("/inventory/items", {
      params: category ? { category } : undefined,
    });
    return data;
  }

  async updateStoreInventoryItem(id: string, payload: Partial<{ minStockLevel: number; expirationWarningDays: number }>): Promise<InventoryItem> {
    const { data } = await this.client.patch<InventoryItem>(`/inventory/items/${id}/store-config`, payload);
    return data;
  }
}

export const api = new ApiClient();
