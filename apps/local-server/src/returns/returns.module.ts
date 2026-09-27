import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { UsersModule } from "../users/users.module";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({
  imports: [InventoryModule, UsersModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
