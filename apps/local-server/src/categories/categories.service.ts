import { Injectable } from "@nestjs/common";
import { EntityStatus } from "@shop/database";
import { DomainError, ErrorCode } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

// FR-001: categories are never hard-deleted, only disabled (BR-001).
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeDisabled = false) {
    return this.prisma.category.findMany({
      where: includeDisabled ? {} : { status: EntityStatus.ACTIVE },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Category not found.", { id }, 404);
    }
    return category;
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data: { name: dto.name } });
      await recordOutbox(tx, "Category", category.id, category);
      return category;
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({ where: { id }, data: dto });
      await recordOutbox(tx, "Category", category.id, category);
      return category;
    });
  }

  async disable(id: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({ where: { id }, data: { status: EntityStatus.DISABLED } });
      await recordOutbox(tx, "Category", category.id, category);
      return category;
    });
  }

  // FR-005: view products within a category, including disabled products.
  async products(id: string) {
    await this.findOne(id);
    return this.prisma.product.findMany({ where: { categoryId: id }, orderBy: { name: "asc" } });
  }
}
