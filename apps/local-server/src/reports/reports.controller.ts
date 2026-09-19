import { Controller, Get, Query } from "@nestjs/common";
import { PaymentMethod, UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { ReportsService } from "./reports.service";

// docs/09-api-design.md §12. Admin-only.
@Roles(UserRole.ADMIN)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("sales")
  sales(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cashierId") cashierId?: string,
    @Query("productId") productId?: string,
    @Query("paymentMethod") paymentMethod?: PaymentMethod,
  ) {
    return this.reportsService.sales({ from, to, cashierId, productId, paymentMethod });
  }

  @Get("purchases")
  purchases(@Query("supplierId") supplierId?: string, @Query("productId") productId?: string) {
    return this.reportsService.purchases({ supplierId, productId });
  }

  @Get("inventory")
  inventory(@Query("lowStockOnly") lowStockOnly?: string) {
    return this.reportsService.inventory({ lowStockOnly: lowStockOnly === "true" });
  }

  @Get("khata")
  khata(@Query("customerId") customerId?: string) {
    return this.reportsService.khata({ customerId });
  }

  @Get("suppliers")
  suppliers(@Query("supplierId") supplierId?: string) {
    return this.reportsService.suppliers({ supplierId });
  }

  @Get("profit")
  profit(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.profit({ from, to });
  }

  @Get("expenses")
  expenses(@Query("category") category?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.expenses({ category, from, to });
  }

  @Get("dashboard")
  dashboard() {
    return this.reportsService.dashboard();
  }
}
