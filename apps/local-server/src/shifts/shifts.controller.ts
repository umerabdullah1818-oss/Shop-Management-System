import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ShiftStatus } from "@shop/database";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { ShiftsService } from "./shifts.service";
import { OpenShiftDto } from "./dto/open-shift.dto";
import { CloseShiftDto } from "./dto/close-shift.dto";

// docs/09-api-design.md §11.
@Controller("shifts")
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("counterId") counterId?: string,
    @Query("status") status?: ShiftStatus,
  ) {
    return this.shiftsService.findAll(user, { counterId, status });
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.findOne(id, user);
  }

  @Post("open")
  open(@Body() dto: OpenShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.open(dto, user.id);
  }

  @Post(":id/close")
  close(@Param("id") id: string, @Body() dto: CloseShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.close(id, dto, user);
  }
}
