import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";

@Module({
  imports: [UsersModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
