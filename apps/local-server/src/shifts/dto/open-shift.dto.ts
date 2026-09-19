import { IsNumber, IsString, Min } from "class-validator";

// FR-090. `id` is the client ULID idempotency key.
export class OpenShiftDto {
  @IsString()
  id!: string;

  @IsString()
  counterId!: string;

  @IsNumber()
  @Min(0)
  openingCash!: number;
}
