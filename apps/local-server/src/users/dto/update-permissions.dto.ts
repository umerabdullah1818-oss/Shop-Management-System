import { IsBoolean, IsObject, IsOptional } from "class-validator";
import type { DashboardModules, DashboardWidgets } from "@shop/shared";

// Every field optional — a partial update, so the Admin UI can toggle one
// switch at a time without resending the whole permission set.
export class UpdatePermissionsDto {
  @IsOptional()
  @IsObject()
  dashboardModules?: Partial<DashboardModules>;

  @IsOptional()
  @IsObject()
  dashboardWidgets?: Partial<DashboardWidgets>;

  @IsOptional() @IsBoolean() canEditPrice?: boolean;
  @IsOptional() @IsBoolean() canApplyDiscount?: boolean;
  @IsOptional() @IsBoolean() canCreateCustomer?: boolean;
  @IsOptional() @IsBoolean() canCollectKhataPayment?: boolean;
  @IsOptional() @IsBoolean() canProcessReturn?: boolean;
  @IsOptional() @IsBoolean() canCancelInvoice?: boolean;
  @IsOptional() @IsBoolean() canReprintInvoice?: boolean;
  @IsOptional() @IsBoolean() canViewPreviousInvoices?: boolean;
  @IsOptional() @IsBoolean() canScanBarcode?: boolean;
  @IsOptional() @IsBoolean() canViewStock?: boolean;
  @IsOptional() @IsBoolean() canOpenCloseShift?: boolean;
}
