import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { ReturnsService } from "./returns.service";
import { CreateReturnDto } from "./dto/create-return.dto";

// docs/09-api-design.md §9. Both Admin and Cashier per the role matrix.
@Controller("returns")
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findBySale(@Query("saleId") saleId: string) {
    return this.returnsService.findBySale(saleId);
  }

  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.create(dto, user);
  }
}
