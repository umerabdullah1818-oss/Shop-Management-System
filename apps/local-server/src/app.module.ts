import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
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
import { UsersModule } from "./users/users.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

// Every domain module from the Phase 8 build order (docs/05-implementation-roadmap.md)
// is now wired in.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default: 30 requests/minute per IP. auth.controller.ts tightens
    // this further on the login endpoints specifically (audit requirement:
    // "rate limiting/lockout protection" on PIN/password auth).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
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
    UsersModule,
  ],
  providers: [
    // Authenticated by default (SEC-001): every request needs a valid
    // session unless the handler is explicitly @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Role checks run after authentication, only where @Roles() is present.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
