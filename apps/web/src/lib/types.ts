/**
 * Deliberately NOT imported from @shop/database: that package re-exports
 * the generated Prisma Client, which assumes a Node.js runtime (native
 * query-engine binaries, fs access) and has no place in a browser bundle.
 * The frontend only ever talks to the Local API over HTTP — these are its
 * own minimal, browser-safe mirrors of the wire shapes it actually uses.
 */

export type UserRole = "ADMIN" | "CASHIER";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  unit: string;
  officialPrice: string;
  minStockLevel: string;
  status: "ACTIVE" | "DISABLED";
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  isWalkIn: boolean;
}

export interface Counter {
  id: string;
  name: string;
}

export interface CashierProfile {
  id: string;
  userId: string;
  counterId: string | null;
  dashboardModules: import("@shop/shared").DashboardModules;
  dashboardWidgets: import("@shop/shared").DashboardWidgets;
  canEditPrice: boolean;
  canApplyDiscount: boolean;
  canCreateCustomer: boolean;
  canCollectKhataPayment: boolean;
  canProcessReturn: boolean;
  canCancelInvoice: boolean;
  canReprintInvoice: boolean;
  canViewPreviousInvoices: boolean;
  canScanBarcode: boolean;
  canViewStock: boolean;
  canOpenCloseShift: boolean;
  counter?: Counter | null;
}

export interface ManagedUser {
  id: string;
  name: string;
  username: string | null;
  role: UserRole;
  status: "ACTIVE" | "DISABLED";
  createdById: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  cashierProfile: CashierProfile | null;
}

export interface UserActivity {
  auditLogs: { id: string; action: string; entityType: string; entityId: string; createdAt: string; reason: string | null }[];
  shifts: { id: string; status: string; openedAt: string; closedAt: string | null }[];
  totalSales: number;
}

export type PaymentMethod = "CASH" | "CARD" | "BANK" | "KHATA";

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
}

export interface CreateSaleRequest {
  id: string;
  counterId: string;
  shiftId: string;
  customerId: string;
  items: SaleItemInput[];
  paymentMethod: PaymentMethod;
  amountPaid: number;
  overrideToken?: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  grandTotal: string;
  amountPaid: string;
  remainingAmount: string;
  paymentMethod: PaymentMethod;
  status: "COMPLETED" | "CANCELLED";
}

export interface Shift {
  id: string;
  counterId: string;
  userId: string;
  openingCash: string;
  closingCash: string | null;
  expectedCash: string | null;
  difference: string | null;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: "ACTIVE" | "DISABLED";
  totals?: { totalPurchased: number; totalPaid: number; totalPayable: number };
}

export interface Batch {
  id: string;
  productId: string;
  supplierId: string;
  purchaseDate: string;
  originalQty: string;
  remainingQty: string;
  unitCost: string;
  status: "ACTIVE" | "EXHAUSTED";
  supplier?: { name: string };
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  amountPaid: string;
  amountPayable: string;
  items: { productId: string; quantity: string; costPerUnit: string; totalCost: string }[];
  supplier?: Supplier;
}

export type ExpenseCategory = "RENT" | "ELECTRICITY" | "TRANSPORT" | "SALARIES" | "MAINTENANCE" | "OTHER";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  paymentMethod: PaymentMethod;
  date: string;
  shiftId: string | null;
}

export interface KhataTransaction {
  id: string;
  type: "CREDIT_SALE" | "PAYMENT_RECEIVED" | "RETURN_ADJUSTMENT" | "CANCELLATION" | "APPROVED_ADJUSTMENT";
  amount: string;
  saleId: string | null;
  occurredAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: unknown;
  afterJson: unknown;
  reason: string | null;
  createdAt: string;
}

export type SyncState = "LOCAL_ONLY" | "PENDING_SYNC" | "SYNCING" | "SYNCED" | "SYNC_FAILED" | "CONFLICT";

export interface SyncStatus {
  pendingCount: number;
  failedCount: number;
  oldestPendingEventCreatedAt: string | null;
  lastSyncedAt: string | null;
  openConflictCount: number;
}

export interface SyncConflict {
  id: string;
  outboxEventId: string;
  status: "OPEN" | "RESOLVED";
  details: unknown;
  createdAt: string;
}

export interface DashboardSummary {
  todaySalesRevenue: number;
  lowStockCount: number;
  outstandingKhata: number;
  supplierPayable: number;
  grossProfitToday: number;
  netProfitToday: number;
  recentSales: Sale[];
}
