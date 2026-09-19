import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SaleStatus } from "@shop/database";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { SalesService } from "./sales.service";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { CancelSaleDto } from "./dto/cancel-sale.dto";

// docs/09-api-design.md §8.
@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("cashierId") cashierId?: string,
    @Query("customerId") customerId?: string,
    @Query("status") status?: SaleStatus,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.salesService.findAll(user, { cashierId, customerId, status, dateFrom, dateTo });
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.create(dto, user);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.cancel(id, dto, user);
  }

  // FR-111: reprints are allowed and logged, but never affect financial totals.
  @Post(":id/print")
  recordPrint(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.recordPrint(id, user);
  }
}
