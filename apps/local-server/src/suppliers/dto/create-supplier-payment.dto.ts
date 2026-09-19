import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { PaymentMethod } from "@shop/database";

// FR-015. `id` is the client-generated ULID used as the idempotency key
// (docs/10-offline-engine.md §3).
export class CreateSupplierPaymentDto {
  @IsString()
  id!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(["CASH", "CARD", "BANK", "KHATA"])
  method!: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string; // defaults to now if omitted

  @IsOptional()
  @IsString()
  purchaseId?: string; // if omitted, allocated oldest-purchase-first (Decision #8)

  @IsOptional()
  @IsString()
  notes?: string;
}
