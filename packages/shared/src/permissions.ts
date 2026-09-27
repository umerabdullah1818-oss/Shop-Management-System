/**
 * Admin-configurable per-cashier controls. Action permissions are real
 * backend enforcement points (checked server-side in the relevant service —
 * see apps/local-server/src/users/permissions.service.ts), never just a
 * frontend show/hide. Dashboard modules/widgets are lower-stakes
 * display-only toggles for what a cashier's own screen shows.
 */

export interface DashboardModules {
  pos: boolean;
  sales: boolean;
  products: boolean;
  customers: boolean;
  khata: boolean;
  inventory: boolean;
  purchases: boolean;
  suppliers: boolean;
  returns: boolean;
  expenses: boolean;
  reports: boolean;
  shift: boolean;
  notifications: boolean;
}

export interface DashboardWidgets {
  todaysSales: boolean;
  currentShift: boolean;
  currentCash: boolean;
  lowStock: boolean;
  customerDue: boolean;
  recentSales: boolean;
  quickProducts: boolean;
  pendingSync: boolean;
  notifications: boolean;
}

export interface CashierActionPermissions {
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
}

// A brand-new cashier can run a normal till (POS, sales, customers, Khata,
// shift) but not the higher-risk actions (returns, invoice cancellation) —
// an Admin opts those in explicitly per cashier.
export const DEFAULT_DASHBOARD_MODULES: DashboardModules = {
  pos: true,
  sales: true,
  products: false,
  customers: true,
  khata: true,
  inventory: false,
  purchases: false,
  suppliers: false,
  returns: true,
  expenses: false,
  reports: false,
  shift: true,
  notifications: true,
};

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgets = {
  todaysSales: true,
  currentShift: true,
  currentCash: true,
  lowStock: true,
  customerDue: true,
  recentSales: true,
  quickProducts: true,
  pendingSync: false,
  notifications: true,
};

export const DEFAULT_CASHIER_ACTION_PERMISSIONS: CashierActionPermissions = {
  canEditPrice: true,
  canApplyDiscount: true,
  canCreateCustomer: true,
  canCollectKhataPayment: true,
  canProcessReturn: false,
  canCancelInvoice: false,
  canReprintInvoice: true,
  canViewPreviousInvoices: true,
  canScanBarcode: true,
  canViewStock: true,
  canOpenCloseShift: true,
};

// Admin is never gated by CashierProfile — used as the in-memory "effective
// permissions" for an Admin session so callers don't need an `isAdmin`
// branch at every check site.
export const ADMIN_ACTION_PERMISSIONS: CashierActionPermissions = {
  canEditPrice: true,
  canApplyDiscount: true,
  canCreateCustomer: true,
  canCollectKhataPayment: true,
  canProcessReturn: true,
  canCancelInvoice: true,
  canReprintInvoice: true,
  canViewPreviousInvoices: true,
  canScanBarcode: true,
  canViewStock: true,
  canOpenCloseShift: true,
};

export const ALL_DASHBOARD_MODULES_ENABLED: DashboardModules = {
  pos: true,
  sales: true,
  products: true,
  customers: true,
  khata: true,
  inventory: true,
  purchases: true,
  suppliers: true,
  returns: true,
  expenses: true,
  reports: true,
  shift: true,
  notifications: true,
};

export const ALL_DASHBOARD_WIDGETS_ENABLED: DashboardWidgets = {
  todaysSales: true,
  currentShift: true,
  currentCash: true,
  lowStock: true,
  customerDue: true,
  recentSales: true,
  quickProducts: true,
  pendingSync: true,
  notifications: true,
};
