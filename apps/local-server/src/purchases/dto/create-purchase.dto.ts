import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

class PurchaseItemInput {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  costPerUnit!: number;
}

// FR-011. `id` is the client ULID idempotency key.
export class CreatePurchaseDto {
  @IsString()
  id!: string;

  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsString()
  supplierInvoiceNumber?: string;

  @IsDateString()
  purchaseDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemInput)
  items!: PurchaseItemInput[];

  @IsNumber()
  @Min(0)
  amountPaid!: number;
}
