import { Injectable } from "@nestjs/common";
import {
  ADMIN_ACTION_PERMISSIONS,
  DEFAULT_CASHIER_ACTION_PERMISSIONS,
  DEFAULT_DASHBOARD_MODULES,
  DEFAULT_DASHBOARD_WIDGETS,
  DomainError,
  ErrorCode,
  type CashierActionPermissions,
  type DashboardModules,
  type DashboardWidgets,
} from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";

/**
 * The real backend enforcement point for every "can this cashier do X"
 * question the audit requires — a hidden button is never sufficient on its
 * own (SEC-001). Every sensitive action in SalesService/ReturnsService/
 * CustomersService/ShiftsService calls `assert()` here; a direct API call
 * that bypasses the UI hits the exact same check.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActionPermissions(user: AuthenticatedUser): Promise<CashierActionPermissions> {
    if (user.role === "ADMIN") return ADMIN_ACTION_PERMISSIONS;

    const profile = await this.prisma.cashierProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return DEFAULT_CASHIER_ACTION_PERMISSIONS;

    return {
      canEditPrice: profile.canEditPrice,
      canApplyDiscount: profile.canApplyDiscount,
      canCreateCustomer: profile.canCreateCustomer,
      canCollectKhataPayment: profile.canCollectKhataPayment,
      canProcessReturn: profile.canProcessReturn,
      canCancelInvoice: profile.canCancelInvoice,
      canReprintInvoice: profile.canReprintInvoice,
      canViewPreviousInvoices: profile.canViewPreviousInvoices,
      canScanBarcode: profile.canScanBarcode,
      canViewStock: profile.canViewStock,
      canOpenCloseShift: profile.canOpenCloseShift,
    };
  }

  async getDashboardConfig(
    user: AuthenticatedUser,
  ): Promise<{ modules: DashboardModules; widgets: DashboardWidgets; counterId: string | null }> {
    if (user.role === "ADMIN") {
      return { modules: DEFAULT_DASHBOARD_MODULES, widgets: DEFAULT_DASHBOARD_WIDGETS, counterId: null };
    }
    const profile = await this.prisma.cashierProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      return { modules: DEFAULT_DASHBOARD_MODULES, widgets: DEFAULT_DASHBOARD_WIDGETS, counterId: null };
    }
    return {
      modules: profile.dashboardModules as unknown as DashboardModules,
      widgets: profile.dashboardWidgets as unknown as DashboardWidgets,
      counterId: profile.counterId,
    };
  }

  /** Throws FORBIDDEN with a clear, specific message if the action isn't allowed. */
  async assert(user: AuthenticatedUser, permission: keyof CashierActionPermissions, message?: string) {
    const permissions = await this.getActionPermissions(user);
    if (!permissions[permission]) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        message ?? "You don't have permission to perform this action. Ask an admin.",
        { permission },
        403,
      );
    }
  }
}
