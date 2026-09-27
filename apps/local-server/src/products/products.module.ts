import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { UsersModule } from "../users/users.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [InventoryModule, UsersModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
