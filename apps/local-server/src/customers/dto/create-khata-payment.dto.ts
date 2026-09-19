import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { PaymentMethod } from "@shop/database";

// FR-033 / BR-008. `id` is the client ULID idempotency key.
export class CreateKhataPaymentDto {
  @IsString()
  id!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(["CASH", "CARD", "BANK"])
  method!: PaymentMethod; // Khata payments are settled in cash/card/bank, not "Khata" itself

  @IsOptional()
  @IsString()
  shiftId?: string; // for cash-drawer reconciliation, FR-092
}
