import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { MovementType, UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { InventoryService } from "./inventory.service";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";

// docs/09-api-design.md §6. Admin-only.
@Roles(UserRole.ADMIN)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("batches")
  batches(@Query("productId") productId: string) {
    return this.inventoryService.batchesForProduct(productId);
  }

  @Get("movements")
  movements(
    @Query("productId") productId?: string,
    @Query("batchId") batchId?: string,
    @Query("type") type?: MovementType,
  ) {
    return this.inventoryService.movements({ productId, batchId, type });
  }

  @Post("adjustments")
  adjust(@Body() dto: AdjustInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.adjustStock(dto, user.id);
  }
}
