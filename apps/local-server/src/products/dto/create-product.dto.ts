import { IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

// FR-002.
export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  categoryId!: string;

  @IsString()
  @MinLength(1)
  unit!: string; // "Piece" | "Box" | "Set" | ... — descriptive only (Decision #9)

  @IsNumber()
  @Min(0)
  officialPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;
}
