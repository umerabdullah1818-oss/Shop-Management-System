import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { PurchasesService } from "./purchases.service";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";

// docs/09-api-design.md §5. Admin-only.
@Roles(UserRole.ADMIN)
@Controller("purchases")
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  findAll(
    @Query("supplierId") supplierId?: string,
    @Query("productId") productId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.purchasesService.findAll({ supplierId, productId, dateFrom, dateTo });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.purchasesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasesService.create(dto, user.id);
  }
}
