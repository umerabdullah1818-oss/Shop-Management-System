import { Injectable } from "@nestjs/common";
import { PurchasePaymentStatus } from "@shop/database";
import { newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreatePurchaseDto } from "./dto/create-purchase.dto";

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  findAll(params: { supplierId?: string; productId?: string; dateFrom?: string; dateTo?: string }) {
    return this.prisma.purchase.findMany({
      where: {
        ...(params.supplierId ? { supplierId: params.supplierId } : {}),
        ...(params.productId ? { items: { some: { productId: params.productId } } } : {}),
        ...(params.dateFrom || params.dateTo
          ? {
              purchaseDate: {
                ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
                ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
              },
            }
          : {}),
      },
      include: { items: true, supplier: true },
      orderBy: { purchaseDate: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.purchase.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { batch: true } }, supplier: true },
    });
  }

  /**
   * FR-011/FR-012/FR-013: atomic — Purchase header + one PurchaseItem and
   * exactly one new InventoryBatch per line, in a single transaction
   * (NFR-011). Purchase cost/batch cost become immutable the moment this
   * commits — no update endpoint ever exposes them again (BR-003).
   */
  async create(dto: CreatePurchaseDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id: dto.id }, include: { items: true } });
      if (existing) {
        return existing; // idempotent replay
      }

      const totalCost = dto.items.reduce((sum, i) => sum + i.quantity * i.costPerUnit, 0);
      const amountPayable = Math.max(0, totalCost - dto.amountPaid);
      const paymentStatus =
        amountPayable <= 0
          ? PurchasePaymentStatus.PAID
          : dto.amountPaid > 0
            ? PurchasePaymentStatus.PARTIAL
            : PurchasePaymentStatus.UNPAID;

      const purchase = await tx.purchase.create({
        data: {
          id: dto.id,
          supplierId: dto.supplierId,
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          purchaseDate: new Date(dto.purchaseDate),
          paymentStatus,
          amountPaid: dto.amountPaid,
          amountPayable,
          createdById: userId,
        },
      });
      await recordOutbox(tx, "Purchase", purchase.id, purchase);

      for (const item of dto.items) {
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            id: newId(),
            purchaseId: purchase.id,
            productId: item.productId,
            quantity: item.quantity,
            costPerUnit: item.costPerUnit,
            totalCost: item.quantity * item.costPerUnit,
          },
        });
        await recordOutbox(tx, "PurchaseItem", purchaseItem.id, purchaseItem);

        await this.inventoryService.createBatchFromPurchaseItem(tx, {
          productId: item.productId,
          purchaseItemId: purchaseItem.id,
          supplierId: dto.supplierId,
          purchaseDate: new Date(dto.purchaseDate),
          quantity: item.quantity,
          unitCost: item.costPerUnit,
          userId,
          referenceId: purchase.id,
        });
      }

      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: true } });
    });
  }
}
