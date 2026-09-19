import { newId } from "@shop/shared";
import { InventoryService } from "../src/inventory/inventory.service";
import { SalesService } from "../src/sales/sales.service";
import { ReturnsService } from "../src/returns/returns.service";
import { createTestPrisma, cleanDatabase } from "./db";
import { seedBaseline, createProduct, createBatch, openShift } from "./fixtures";

const prisma = createTestPrisma();
const inventoryService = new InventoryService(prisma);
const salesService = new SalesService(prisma, inventoryService);
const returnsService = new ReturnsService(prisma, inventoryService);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await cleanDatabase(prisma);
});

describe("Returns restock the original batch, most-recently-consumed first (Decision #3)", () => {
  it("a partial return restocks the newer batch before the older one", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    const oldBatch = await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 20, unitCost: 1000, createdById: admin.id });
    const newBatch = await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 50, unitCost: 1200, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });
    const user = { id: admin.id, role: "ADMIN" as const, name: admin.name };

    // Sell 30: consumes all 20 of the old batch + 10 of the new batch (spec's own worked example).
    const sale = await salesService.create(
      {
        id: newId(),
        counterId: counter.id,
        shiftId: shift.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 30, unitPrice: 1500 }],
        paymentMethod: "CASH",
        amountPaid: 45000,
      },
      user,
    );

    // Return only 5 units — should come back into the NEW batch first (most
    // recently consumed), not the old one, per the documented policy.
    await returnsService.create(
      { id: newId(), saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: 5 }] },
      user,
    );

    const refreshedOld = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: oldBatch.id } });
    const refreshedNew = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: newBatch.id } });

    expect(Number(refreshedOld.remainingQty)).toBe(0); // untouched — still exhausted
    expect(Number(refreshedNew.remainingQty)).toBe(45); // 40 + 5 returned
  });

  it("rejects returning more than was sold", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 10, unitCost: 50, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });
    const user = { id: admin.id, role: "ADMIN" as const, name: admin.name };

    const sale = await salesService.create(
      {
        id: newId(),
        counterId: counter.id,
        shiftId: shift.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 3, unitPrice: 100 }],
        paymentMethod: "CASH",
        amountPaid: 300,
      },
      user,
    );

    await expect(
      returnsService.create(
        { id: newId(), saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: 4 }] },
        user,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
