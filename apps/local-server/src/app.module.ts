import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from "./products/products.module";
import { InventoryModule } from "./inventory/inventory.module";
import { SuppliersModule } from "./suppliers/suppliers.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { CustomersModule } from "./customers/customers.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { SalesModule } from "./sales/sales.module";
import { ReturnsModule } from "./returns/returns.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { SettingsModule } from "./settings/settings.module";
import { ReportsModule } from "./reports/reports.module";
import { AuditModule } from "./audit/audit.module";
import { SyncModule } from "./sync/sync.module";
import { CountersModule } from "./counters/counters.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

// Every domain module from the Phase 8 build order (docs/05-implementation-roadmap.md)
// is now wired in.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    SuppliersModule,
    PurchasesModule,
    CustomersModule,
    ShiftsModule,
    SalesModule,
    ReturnsModule,
    ExpensesModule,
    SettingsModule,
    ReportsModule,
    AuditModule,
    SyncModule,
    CountersModule,
  ],
  providers: [
    // Authenticated by default (SEC-001): every request needs a valid
    // session unless the handler is explicitly @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Role checks run after authentication, only where @Roles() is present.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
