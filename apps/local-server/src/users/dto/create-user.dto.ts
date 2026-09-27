import { IsIn, IsOptional, IsString, Length, MinLength } from "class-validator";
import { UserRole } from "@shop/database";

// Admin-only. `id` is the client ULID idempotency key. Admin accounts need
// username+password; Cashier accounts need a PIN — validated in the
// service (cross-field rule, not expressible cleanly with decorators alone).
export class CreateUserDto {
  @IsString()
  id!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(["ADMIN", "CASHIER"])
  role!: UserRole;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @Length(4, 8)
  pin?: string;

  @IsOptional()
  @IsString()
  counterId?: string;
}
