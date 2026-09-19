import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateKhataPaymentDto } from "./dto/create-khata-payment.dto";

// docs/09-api-design.md §7. Both Admin and Cashier per the role matrix.
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query("search") search?: string) {
    return this.customersService.findAll(search);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get(":id/khata")
  khata(@Param("id") id: string) {
    return this.customersService.khata(id);
  }

  @Post(":id/khata-payments")
  recordKhataPayment(
    @Param("id") id: string,
    @Body() dto: CreateKhataPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.recordKhataPayment(id, dto, user.id);
  }
}
