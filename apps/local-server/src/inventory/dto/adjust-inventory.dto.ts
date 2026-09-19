import { IsIn, IsInt, IsNotEmpty, IsString } from "class-validator";
import { MovementType } from "@shop/database";

// FR-025. `quantity` is signed (+/-); `id` is the client ULID idempotency key.
export class AdjustInventoryDto {
  @IsString()
  id!: string;

  @IsString()
  batchId!: string;

  @IsInt()
  quantity!: number;

  @IsIn(["ADJUSTMENT", "DAMAGED", "EXPIRED", "OTHER"])
  type!: MovementType;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
