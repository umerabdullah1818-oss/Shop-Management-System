import { IsOptional, IsString } from "class-validator";

// FR-070/BR-012.
export class CancelSaleDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
