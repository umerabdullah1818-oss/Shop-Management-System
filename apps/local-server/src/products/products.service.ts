import { Injectable } from "@nestjs/common";
import { BatchStatus, EntityStatus, Prisma } from "@shop/database";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { AuthenticatedUser } from "../auth/auth.types";
import { PermissionsService } from "../users/permissions.service";

interface FindAllParams {
  search?: string;
  categoryId?: string;
  includeDisabled?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // FR-004: search by name/SKU/barcode; POS search excludes disabled products
  // by default (includeDisabled is only ever passed by the Admin UI).
  async findAll(params: FindAllParams, user: AuthenticatedUser) {
    const { search, categoryId, includeDisabled } = params;
    const where: Prisma.ProductWhereInput = {
      ...(includeDisabled ? {} : { status: EntityStatus.ACTIVE }),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const products = await this.prisma.product.findMany({ where, orderBy: { name: "asc" } });
    return this.withStock(products, user);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Product not found.", { id }, 404);
    }
    const [withStock] = await this.withStock([product], user);
    return withStock;
  }

  // Cashier action "view stock" (audit §4) — enforced here, not just hidden
  // in the POS UI: a cashier without the permission gets every product's
  // currentStock omitted from the API response entirely, not merely masked
  // client-side.
  private async withStock<T extends { id: string }>(products: T[], user: AuthenticatedUser) {
    if (user.role === "CASHIER") {
      const permissions = await this.permissionsService.getActionPermissions(user);
      if (!permissions.canViewStock) {
        return products;
      }
    }
    if (products.length === 0) return products;

    const sums = await this.prisma.inventoryBatch.groupBy({
      by: ["productId"],
      where: { productId: { in: products.map((p) => p.id) }, status: BatchStatus.ACTIVE },
      _sum: { remainingQty: true },
    });
    const stockByProduct = new Map(sums.map((s) => [s.productId, Number(s._sum.remainingQty ?? 0)]));
    return products.map((p) => ({ ...p, currentStock: stockByProduct.get(p.id) ?? 0 }));
  }

  // FR-003: duplicate SKU/barcode is a clear validation error, not a raw
  // database constraint failure surfaced to the user.
  async create(dto: CreateProductDto) {
    await this.assertNoDuplicate({ sku: dto.sku, barcode: dto.barcode });

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          id: newId(),
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode,
          categoryId: dto.categoryId,
          unit: dto.unit,
          officialPrice: dto.officialPrice,
          minStockLevel: dto.minStockLevel ?? 0,
        },
      });
      await recordOutbox(tx, "Product", product.id, product);
      return product;
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.assertExists(id);
    if (dto.sku || dto.barcode) {
      await this.assertNoDuplicate({ sku: dto.sku, barcode: dto.barcode, excludeId: id });
    }
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id }, data: dto });
      await recordOutbox(tx, "Product", product.id, product);
      return product;
    });
  }

  // BR-001: soft-delete only, never hard-deleted.
  async disable(id: string) {
    await this.assertExists(id);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({ where: { id }, data: { status: EntityStatus.DISABLED } });
      await recordOutbox(tx, "Product", product.id, product);
      return product;
    });
  }

  private async assertExists(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Product not found.", { id }, 404);
    }
  }

  private async assertNoDuplicate(opts: { sku?: string; barcode?: string; excludeId?: string }) {
    if (opts.sku) {
      const existing = await this.prisma.product.findFirst({
        where: { sku: opts.sku, ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) },
      });
      if (existing) {
        throw new DomainError(ErrorCode.DUPLICATE_SKU, "A product with this SKU already exists.", {
          sku: opts.sku,
        });
      }
    }
    if (opts.barcode) {
      const existing = await this.prisma.product.findFirst({
        where: { barcode: opts.barcode, ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) },
      });
      if (existing) {
        throw new DomainError(
          ErrorCode.DUPLICATE_BARCODE,
          "A product with this barcode already exists.",
          { barcode: opts.barcode },
        );
      }
    }
  }
}
