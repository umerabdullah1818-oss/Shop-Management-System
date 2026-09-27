import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { UsersModule } from "../users/users.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [InventoryModule, UsersModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
