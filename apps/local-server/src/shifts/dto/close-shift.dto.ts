import { IsNumber, Min } from "class-validator";

// FR-092. Client submits only the counted actual cash — expectedCash and
// difference are always computed server-side (never trust a client figure).
export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  closingCash!: number;
}
