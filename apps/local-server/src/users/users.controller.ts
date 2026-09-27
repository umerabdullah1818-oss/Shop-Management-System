import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { EntityStatus, UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdatePermissionsDto } from "./dto/update-permissions.dto";
import { ResetCredentialDto } from "./dto/reset-credential.dto";

// §3 of the audit: "Admin must have a proper Settings → Users / Cashiers
// section." Every route here is Admin-only.
@Roles(UserRole.ADMIN)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Get(":id/activity")
  activity(@Param("id") id: string) {
    return this.usersService.activity(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.usersService.create(dto, admin.id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.usersService.update(id, dto, admin.id);
  }

  @Patch(":id/disable")
  disable(@Param("id") id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.usersService.setStatus(id, EntityStatus.DISABLED, admin.id);
  }

  @Patch(":id/enable")
  enable(@Param("id") id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.usersService.setStatus(id, EntityStatus.ACTIVE, admin.id);
  }

  @Post(":id/reset-credential")
  resetCredential(
    @Param("id") id: string,
    @Body() dto: ResetCredentialDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.resetCredential(id, dto, admin.id);
  }

  @Patch(":id/permissions")
  updatePermissions(
    @Param("id") id: string,
    @Body() dto: UpdatePermissionsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.updatePermissions(id, dto, admin.id);
  }
}
