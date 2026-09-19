import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

// Endpoint shapes per docs/09-api-design.md §3.
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@Query("includeDisabled") includeDisabled?: string) {
    return this.categoriesService.findAll(includeDisabled === "true");
  }

  @Get(":id/products")
  products(@Param("id") id: string) {
    return this.categoriesService.products(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id/disable")
  disable(@Param("id") id: string) {
    return this.categoriesService.disable(id);
  }
}
