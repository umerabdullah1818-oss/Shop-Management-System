import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "@shop/database";

class SaleItemInput {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number; // cashier's current-invoice price (BR-016) — may differ from the product's official price

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number; // total discount for this line, not per-unit
}

// FR-041/FR-043. `id` is the client ULID idempotency key (docs/09-api-design.md §8).
export class CreateSaleDto {
  @IsString()
  id!: string;

  @IsString()
  counterId!: string;

  @IsString()
  shiftId!: string;

  @IsString()
  customerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInput)
  items!: SaleItemInput[];

  @IsIn(["CASH", "CARD", "BANK", "KHATA"])
  paymentMethod!: PaymentMethod;

  @IsNumber()
  @Min(0)
  amountPaid!: number;

  @IsOptional()
  @IsString()
  overrideToken?: string; // present only if a below-cost/over-cap override was authorized (BR-011)
}
