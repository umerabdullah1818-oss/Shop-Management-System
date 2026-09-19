import { IsOptional, IsString, MinLength } from "class-validator";

// FR-030. `id` is the client ULID idempotency key (Cashier can create — §9 role matrix).
export class CreateCustomerDto {
  @IsString()
  id!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
