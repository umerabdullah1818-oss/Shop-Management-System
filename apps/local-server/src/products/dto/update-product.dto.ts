import { PartialType } from "@nestjs/mapped-types";
import { CreateProductDto } from "./create-product.dto";

// Note: officialPrice can be updated here (BR-015 is about history, not
// about locking the current official price), but this never touches
// historical SaleItem.officialPriceAtSale snapshots.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
