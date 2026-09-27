import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PermissionsService } from "./permissions.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService, PermissionsService],
  exports: [UsersService, PermissionsService],
})
export class UsersModule {}
