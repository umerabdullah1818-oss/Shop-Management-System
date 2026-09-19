import { IsOptional, IsString, Length } from "class-validator";

// Cashier quick-login (Decision #17). See docs/09-api-design.md §1.
export class LoginPinDto {
  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsString()
  @Length(4, 8)
  pin!: string;
}
