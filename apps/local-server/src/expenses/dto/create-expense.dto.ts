import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { ExpenseCategory, PaymentMethod } from "@shop/database";

// FR-080. `id` is the client ULID idempotency key.
export class CreateExpenseDto {
  @IsString()
  id!: string;

  @IsIn(["RENT", "ELECTRICITY", "TRANSPORT", "SALARIES", "MAINTENANCE", "OTHER"])
  category!: ExpenseCategory;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(["CASH", "CARD", "BANK"])
  paymentMethod!: PaymentMethod;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  shiftId?: string; // for cash-drawer reconciliation, FR-092

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
