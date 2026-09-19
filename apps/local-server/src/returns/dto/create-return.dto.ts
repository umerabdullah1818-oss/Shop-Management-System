import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class ReturnItemInput {
  @IsString()
  saleItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

// FR-060. `id` is the client ULID idempotency key.
export class CreateReturnDto {
  @IsString()
  id!: string;

  @IsString()
  saleId!: string;

  @IsOptional()
  @IsString()
  shiftId?: string; // the shift processing this return, for cash-drawer reconciliation (FR-092)

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemInput)
  items!: ReturnItemInput[];
}
