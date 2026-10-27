export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings';

export interface CompanyPrivileges {
  brands: PrivilegeLevel;
  analytics: PrivilegeLevel;
  users: PrivilegeLevel;
  settings: PrivilegeLevel;
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isFirstLogin: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
  companyPrivileges?: CompanyPrivileges | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  contactEmail?: string;
  themeColors?: ThemeColors;
  canCreateBrands: boolean;
  canOnboardStores: boolean;
  isActive: boolean;
  deactivatedAt?: string | null;
  gracePeriodEndsAt?: string | null;
  brandCount?: number;
  storeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  themeColors?: ThemeColors;
  companyId: string;
  company?: {
    slug: string;
    canOnboardStores: boolean;
  };
  enabledDeliveryPlatforms?: string[];
  preferenceLabel?: string;
  isActive: boolean;
  storeCount?: number;
  productCount?: number;
  inventoryItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  companyId: string;
  isActive: boolean;
  deactivatedAt?: string | null;
  gracePeriodEndsAt?: string | null;
  enabledDeliveryPlatforms?: string[];
  priceTier?: PriceTier;
  menu?: { id: string; name: string } | null;
  inventorySetup?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  brand?: { id: string; name: string; slug: string };
}

export interface PlatformStats {
  totalCompanies: number;
  totalBrands: number;
  totalStores: number;
  monthlyActiveStores: number;
}

export interface SubscriptionMonthEntry {
  month: string; // 'YYYY-MM'
  paid: boolean;
  paidAt: string | null;
  note: string | null;
}

export interface SubscriptionListItem {
  tenantId: string;
  storeName: string;
  storeSlug: string;
  company: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  activatedAt: string | null;
  paidThisMonth: boolean | null;
}

export interface SubscriptionDetail {
  tenantId: string;
  storeName: string;
  storeSlug: string;
  company: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  activatedAt: string | null;
  months: SubscriptionMonthEntry[];
}

export interface SubscriptionStats {
  totalStores: number;
  activated: number;
  pendingActivation: number;
  paidThisMonth: number;
  overdue: number;
}

// ─── Automated billing ─────────────────────────────────────────────────────

export type BillingStatus = 'EXEMPT' | 'NOT_ACTIVATED' | 'TRIAL' | 'ACTIVE' | 'DUE' | 'LOCKED';
export type BillingListStatus = BillingStatus | 'NOT_SET_UP';
export type PaymongoMode = 'test' | 'live' | 'unconfigured';

export interface BillingConfig {
  billingEnabled: boolean;
  enforcementEnabled: boolean;
  defaultTrialDays: number;
  defaultGraceDays: number;
  reminderOffsets: number[];
  invoiceLeadDays: number;
  paymongoMonthlyLimitCentavos: number;
  limitWarnPercent: number;
  overduePollSeconds: number;
  claimLockHoldDays: number;
  minKioskVersionCode: number | null;
  fallbackQrImageUrl: string | null;
  fallbackQrAccountName: string | null;
  fallbackQrInstructions: string | null;
  updatedAt: string;
  paymongoMode: PaymongoMode;
  webhookConfigured: boolean;
}

export type UpdateBillingConfigPayload = Partial<
  Omit<BillingConfig, 'updatedAt' | 'paymongoMode' | 'webhookConfigured' | 'fallbackQrImageUrl'>
> & { confirmEnforcement?: boolean };

export interface BillingStatusResult {
  status: BillingStatus;
  enforcement: boolean;
  amountCentavos: number | null;
  dueAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  daysOverdue: number | null;
  trialEndsAt: string | null;
  paidThroughAt: string | null;
  nextBillingAt: string | null;
  openInvoiceId: string | null;
  verificationPending: boolean;
  lastClaimRejectedReason: string | null;
}

export interface StoreView {
  variant: 'none' | 'banner' | 'lock';
  title: string;
  body: string;
  showPayAction: boolean;
}

export interface StoreBillingSettings {
  billingEnabled: boolean | null;
  exemptReason: string | null;
  priceCentavos: number | null;
  activatedAt: string | null;
  trialStartAt: string | null;
  trialDays: number | null;
  trialEndsAt: string | null;
  anchorDay: number | null;
  nextBillingAt: string | null;
  nextBillingOverridden: boolean;
  paidThroughAt: string | null;
  graceDaysOverride: number | null;
}

export interface BillingAuditEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  /** Display name of the actor; null for system rows (or a user that no longer exists). */
  actorName: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export type BillingInvoiceStatus = 'OPEN' | 'PAID' | 'VOID' | 'WAIVED';
export type BillingPaymentMethod = 'QRPH' | 'MANUAL' | 'PREPAID';
export type BillingPaymentSource = 'WEBHOOK' | 'RECONCILE' | 'MANUAL' | 'PREPAYMENT';
export type ManualPaymentMethod = 'cash' | 'bank_transfer' | 'bank_qr' | 'gcash_direct' | 'other';
export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BillingInvoice {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  revision: number;
  issuedAt: string;
  dueAt: string;
  amountCentavos: number;
  status: BillingInvoiceStatus;
  graceExtendedUntil: string | null;
  paidAt: string | null;
  paymentMethod: BillingPaymentMethod | null;
  voidReason: string | null;
}

export interface BillingPaymentRow {
  id: string;
  invoiceId: string | null;
  source: BillingPaymentSource;
  method: BillingPaymentMethod;
  manualMethod: string | null;
  amountCentavos: number;
  monthsCovered: number;
  paidAt: string;
  reference: string | null;
  providerIntentId: string | null;
  note: string | null;
  flagged: boolean;
  /** Applied, but the amount differed from the invoice. */
  amountMismatch: boolean;
}

export interface BillingAttemptRow {
  id: string;
  invoiceId: string;
  providerIntentId: string;
  status: string;
  expiresAt: string;
  livemode: boolean;
  createdAt: string;
}

export interface BillingClaim {
  id: string;
  invoiceId: string;
  tenantId: string;
  amountCentavos: number;
  reference: string;
  paidAt: string;
  receiptImageUrl: string | null;
  note: string | null;
  status: ClaimStatus;
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  storeName?: string | null;
  invoiceNumber?: string | null;
  invoiceAmountCentavos?: number | null;
  invoiceStatus?: BillingInvoiceStatus | null;
}

export interface PaymentsLogRow {
  id: string;
  paidAt: string;
  storeName: string | null;
  companyName: string | null;
  brandName: string | null;
  invoiceNumber: string | null;
  amountCentavos: number;
  method: BillingPaymentMethod;
  source: BillingPaymentSource;
  manualMethod: string | null;
  reference: string | null;
  flagged: boolean;
  /** Applied, but the amount differed from the invoice. */
  amountMismatch: boolean;
  note: string | null;
}

export interface StoreBillingDetail {
  tenantId: string;
  storeName: string;
  company: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  globalBillingEnabled: boolean;
  settings: StoreBillingSettings;
  status: BillingStatusResult;
  previewStatus: BillingStatusResult;
  storeView: { admin: StoreView; cashier: StoreView };
  audit: BillingAuditEntry[];
  invoices: BillingInvoice[];
  payments: BillingPaymentRow[];
  attempts: BillingAttemptRow[];
  claims: BillingClaim[];
}

export interface UpdateStoreBillingPayload {
  billingEnabled?: boolean;
  exemptReason?: string | null;
  priceCentavos?: number;
  activatedAt?: string | null;
  trialStartAt?: string | null;
  trialDays?: number | null;
  anchorDay?: number | null;
  nextBillingAt?: string | null;
  graceDaysOverride?: number | null;
}

export interface EnableDatesPreview {
  trialEndsAt: string;
  anchorDay: number;
  paidThroughAt: string | null;
  nextBillingAt: string;
  honoredMonths: string[];
  nextBillingOverridden: boolean;
}

export interface BillingStoreRow {
  tenantId: string;
  storeName: string;
  isActive: boolean;
  deactivatedAt: string | null;
  company: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  priceCentavos: number | null;
  billingEnabled: boolean | null;
  exemptReason: string | null;
  status: BillingListStatus;
  dueAt: string | null;
  paidThroughAt: string | null;
  nextBillingAt: string | null;
  daysOverdue: number | null;
  lastPaymentAt: string | null;
}

export interface BillingMoney {
  expectedThisMonthCentavos: number;
  collectedThisMonthCentavos: number;
  outstandingCentavos: number;
  qrphCollectedThisMonthCentavos: number;
  limitCentavos: number;
  limitPercent: number;
  limitWarn: boolean;
  fallbackQrConfigured: boolean;
  pendingClaims: number;
}

export interface BillingOverview {
  globalBillingEnabled: boolean;
  /** Status counts cover active stores only; inactive ones are counted here */
  counts: Record<BillingListStatus, number>;
  inactive: number;
  upcomingNext7Days: number;
  money: BillingMoney;
}

export interface BulkBillingResult {
  tenantId: string;
  ok: boolean;
  error?: string;
}

export interface CreateStoreBillingPayload {
  priceCentavos: number;
  trialDays: number;
  firstBillingDate: string;
  activatedAt?: string;
}

export type SessionStatus = 'ACTIVE' | 'ENDED' | 'EXPIRED';

export interface SessionListItem {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: string;
  };
  company: { id: string; name: string } | null;
  tenantId: string | null;
  loginAt: string;
  loggedOutAt: string | null;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: SessionStatus;
}

export interface MaintenanceStatus {
  storePortalMaintenance: boolean;
  companyPortalMaintenance: boolean;
  mobileAppMaintenance: boolean;
}

export interface AuthResponse {
  accessToken: string;
  mustChangePassword?: boolean;
  user: User;
}

export interface OnboardAdminPayload {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
}

export interface OnboardStorePayload {
  storeName: string;
  storeSlug: string;
  brandId: string;
  companyId: string;
  admin: OnboardAdminPayload;
  billing: CreateStoreBillingPayload;
}

export interface AppRelease {
  id: string;
  versionCode: number;
  versionName: string;
  apkPath: string;
  apkUrl: string;
  fileSize: number;
  checksumSha256: string;
  releaseNotes: string[];
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  uploadedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTier {
  id: string;
  name: string;
  isDefault: boolean;
  menuId: string;
}

export interface Menu {
  id: string;
  brandId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySetup {
  id: string;
  brandId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPriceTier {
  tierId: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface SizePriceTier {
  tierId: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface AddonPriceTier {
  tierId: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface Category {
  id: string;
  name: string;
  type: 'PRODUCT' | 'INVENTORY';
  description?: string;
  sequenceNo?: number;
  menuId?: string;
  inventorySetupId?: string;
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  categoryId: string;
  category?: Category;
  menuId: string;
  image?: string;
  sizes?: Size[];
  addons?: Addon[];
  preferences?: Preference[];
  priceTiers?: ProductPriceTier[];
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Size {
  id: string;
  name: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  priceTiers?: SizePriceTier[];
  menuId?: string;
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  priceTiers?: AddonPriceTier[];
  menuId?: string;
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Preference {
  id: string;
  name: string;
  isDefault?: boolean;
  menuId?: string;
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

// Directly owned by one InventorySetup (mirrors Product's direct Menu ownership).
export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  description?: string;
  categoryId: string;
  category?: Category;
  inventorySetupId: string;
  brandId?: string;
  minStockLevel?: number | null;
  requiresExpirationDate: boolean;
  expirationWarningDays?: number | null;
  tombstone?: number;
  createdAt: string;
  updatedAt: string;
}

