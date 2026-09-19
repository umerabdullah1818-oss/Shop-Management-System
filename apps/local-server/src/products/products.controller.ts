import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

// Endpoint shapes per docs/09-api-design.md §4. `low-stock` (FR-027) and
// `:id/batches` (FR-026) read from InventoryService rather than the Product
// row itself, but live here rather than in a second "products" controller —
// two controllers sharing one path prefix makes route-registration order
// (static routes must win over the dynamic `:id`) a fragile cross-module
// concern. IMPORTANT: `low-stock` must stay declared before `:id` below,
// or a request for it will incorrectly match `:id` as productId="low-stock".
@Controller("products")
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Get()
  findAll(
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
    @Query("status") status?: string,
  ) {
    return this.productsService.findAll({
      search,
      categoryId,
      includeDisabled: status === "DISABLED" || status === "ALL",
    });
  }

  @Roles(UserRole.ADMIN)
  @Get("low-stock")
  lowStock() {
    return this.inventoryService.lowStockProducts();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Get(":id/batches")
  batches(@Param("id") id: string) {
    return this.inventoryService.batchesForProduct(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id/disable")
  disable(@Param("id") id: string) {
    return this.productsService.disable(id);
  }
}
