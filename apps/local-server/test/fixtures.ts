import { PrismaClient } from "@shop/database";
import { newId } from "@shop/shared";

export async function seedBaseline(prisma: PrismaClient) {
  const admin = await prisma.user.create({
    data: { id: newId(), name: "Test Admin", username: `admin-${newId()}`, passwordHash: "x", role: "ADMIN" },
  });
  const cashier = await prisma.user.create({
    data: { id: newId(), name: "Test Cashier", pinHash: "x", role: "CASHIER" },
  });
  const category = await prisma.category.create({ data: { name: "Test Category" } });
  const supplier = await prisma.supplier.create({ data: { id: newId(), name: "Test Supplier" } });
  const customer = await prisma.customer.create({ data: { id: newId(), name: "Walk-in", isWalkIn: true } });
  const realCustomer = await prisma.customer.create({ data: { id: newId(), name: "Real Customer" } });
  const counter = await prisma.counter.create({ data: { id: newId(), name: "T1" } });
  await prisma.setting.create({ data: { key: "cashierDiscountCapPercent", value: 10 } });

  return { admin, cashier, category, supplier, customer, realCustomer, counter };
}

export async function createProduct(
  prisma: PrismaClient,
  params: { categoryId: string; officialPrice: number; name?: string },
) {
  return prisma.product.create({
    data: {
      id: newId(),
      name: params.name ?? "Test Product",
      sku: `SKU-${newId()}`,
      categoryId: params.categoryId,
      unit: "Piece",
      officialPrice: params.officialPrice,
      minStockLevel: 0,
    },
  });
}

/** Creates a purchase + its resulting batch directly (bypassing PurchasesService for test speed/isolation). */
export async function createBatch(
  prisma: PrismaClient,
  params: { productId: string; supplierId: string; quantity: number; unitCost: number; createdById: string },
) {
  const purchase = await prisma.purchase.create({
    data: {
      id: newId(),
      supplierId: params.supplierId,
      purchaseDate: new Date(),
      amountPaid: params.quantity * params.unitCost,
      amountPayable: 0,
      paymentStatus: "PAID",
      createdById: params.createdById,
    },
  });
  const purchaseItem = await prisma.purchaseItem.create({
    data: {
      id: newId(),
      purchaseId: purchase.id,
      productId: params.productId,
      quantity: params.quantity,
      costPerUnit: params.unitCost,
      totalCost: params.quantity * params.unitCost,
    },
  });
  return prisma.inventoryBatch.create({
    data: {
      id: newId(),
      productId: params.productId,
      purchaseItemId: purchaseItem.id,
      supplierId: params.supplierId,
      purchaseDate: new Date(),
      originalQty: params.quantity,
      remainingQty: params.quantity,
      unitCost: params.unitCost,
      status: "ACTIVE",
    },
  });
}

export async function openShift(prisma: PrismaClient, params: { counterId: string; userId: string }) {
  return prisma.shift.create({
    data: { id: newId(), counterId: params.counterId, userId: params.userId, openingCash: 0 },
  });
}
