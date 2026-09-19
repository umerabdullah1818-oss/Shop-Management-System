import { ErrorCode, newId } from "@shop/shared";
import { InventoryService } from "../src/inventory/inventory.service";
import { SalesService } from "../src/sales/sales.service";
import { CustomersService } from "../src/customers/customers.service";
import { createTestPrisma, cleanDatabase } from "./db";
import { seedBaseline, createProduct, createBatch, openShift } from "./fixtures";

const prisma = createTestPrisma();
const inventoryService = new InventoryService(prisma);
const salesService = new SalesService(prisma, inventoryService);
const customersService = new CustomersService(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanDatabase(prisma);
});

describe("FIFO allocation & COGS (worked example from the original spec, §15)", () => {
  it("allocates 20@1000 then 10@1200 for a 30-unit sale, COGS = 32,000", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 1500 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 20, unitCost: 1000, createdById: admin.id });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 50, unitCost: 1200, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });

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
      { id: admin.id, role: "ADMIN", name: admin.name },
    );

    const allocations = sale.items[0].allocations;
    const cogs = allocations.reduce((s, a) => s + Number(a.quantity) * Number(a.unitCostAtSale), 0);

    expect(allocations).toHaveLength(2);
    expect(Number(allocations[0].quantity)).toBe(20);
    expect(Number(allocations[0].unitCostAtSale)).toBe(1000);
    expect(Number(allocations[1].quantity)).toBe(10);
    expect(Number(allocations[1].unitCostAtSale)).toBe(1200);
    expect(cogs).toBe(32000);

    const batches = await inventoryService.batchesForProduct(product.id);
    expect(batches.find((b) => Number(b.unitCost) === 1000)?.status).toBe("EXHAUSTED");
    expect(Number(batches.find((b) => Number(b.unitCost) === 1200)?.remainingQty)).toBe(40);
  });

  it("exhausts a batch exactly at its remaining quantity with no error", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 10, unitCost: 50, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });

    const sale = await salesService.create(
      {
        id: newId(),
        counterId: counter.id,
        shiftId: shift.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 10, unitPrice: 100 }],
        paymentMethod: "CASH",
        amountPaid: 1000,
      },
      { id: admin.id, role: "ADMIN", name: admin.name },
    );

    expect(Number(sale.items[0].allocations[0].quantity)).toBe(10);
    const batches = await inventoryService.batchesForProduct(product.id);
    expect(batches[0].status).toBe("EXHAUSTED");
    expect(Number(batches[0].remainingQty)).toBe(0);
  });

  it("rejects a sale that exceeds total available stock (FR-024)", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 5, unitCost: 50, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });

    await expect(
      salesService.create(
        {
          id: newId(),
          counterId: counter.id,
          shiftId: shift.id,
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 6, unitPrice: 100 }],
          paymentMethod: "CASH",
          amountPaid: 600,
        },
        { id: admin.id, role: "ADMIN", name: admin.name },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_STOCK });

    // Rolled back entirely — no partial batch consumption left over (NFR-011).
    const batches = await inventoryService.batchesForProduct(product.id);
    expect(Number(batches[0].remainingQty)).toBe(5);
  });
});

describe("Below-cost pricing (BR-009/BR-011)", () => {
  it("blocks a Cashier from selling below the active batch cost without an override", async () => {
    const { cashier, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 10, unitCost: 80, createdById: cashier.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: cashier.id });

    await expect(
      salesService.create(
        {
          id: newId(),
          counterId: counter.id,
          shiftId: shift.id,
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 1, unitPrice: 50 }], // below the 80 cost
          paymentMethod: "CASH",
          amountPaid: 50,
        },
        { id: cashier.id, role: "CASHIER", name: cashier.name },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.BELOW_COST_BLOCKED });
  });

  it("allows an Admin to sell below cost, and audits it", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 10, unitCost: 80, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });

    const sale = await salesService.create(
      {
        id: newId(),
        counterId: counter.id,
        shiftId: shift.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 50 }],
        paymentMethod: "CASH",
        amountPaid: 50,
      },
      { id: admin.id, role: "ADMIN", name: admin.name },
    );

    expect(sale.status).toBe("COMPLETED");
    const audits = await prisma.auditLog.findMany({ where: { action: "BELOW_COST_OVERRIDE", entityId: sale.id } });
    expect(audits).toHaveLength(1);
  });
});

describe("Idempotent sale creation (docs/10-offline-engine.md §3)", () => {
  it("replaying the same client-supplied sale id does not double-consume stock", async () => {
    const { admin, category, supplier, customer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 100 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 10, unitCost: 50, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });

    const dto = {
      id: newId(),
      counterId: counter.id,
      shiftId: shift.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 3, unitPrice: 100 }],
      paymentMethod: "CASH" as const,
      amountPaid: 300,
    };
    const user = { id: admin.id, role: "ADMIN" as const, name: admin.name };

    const first = await salesService.create(dto, user);
    const second = await salesService.create(dto, user);

    expect(second.id).toBe(first.id);
    const batches = await inventoryService.batchesForProduct(product.id);
    expect(Number(batches[0].remainingQty)).toBe(7); // 10 - 3, not 10 - 6
  });
});

describe("Khata oldest-invoice-first payment allocation (worked example from §22)", () => {
  it("allocates a lump payment to the oldest outstanding invoices first", async () => {
    const { admin, category, supplier, realCustomer, counter } = await seedBaseline(prisma);
    const product = await createProduct(prisma, { categoryId: category.id, officialPrice: 1000 });
    await createBatch(prisma, { productId: product.id, supplierId: supplier.id, quantity: 100, unitCost: 500, createdById: admin.id });
    const shift = await openShift(prisma, { counterId: counter.id, userId: admin.id });
    const user = { id: admin.id, role: "ADMIN" as const, name: admin.name };

    // Three Khata sales due 3000, 5000, 2000 — mirroring the spec's example exactly.
    async function creditSale(due: number) {
      return salesService.create(
        {
          id: newId(),
          counterId: counter.id,
          shiftId: shift.id,
          customerId: realCustomer.id,
          items: [{ productId: product.id, quantity: due / 1000, unitPrice: 1000 }],
          paymentMethod: "KHATA",
          amountPaid: 0,
        },
        user,
      );
    }
    const invoice1 = await creditSale(3000);
    await new Promise((r) => setTimeout(r, 5)); // ensure occurredAt ordering
    const invoice2 = await creditSale(5000);
    await new Promise((r) => setTimeout(r, 5));
    const invoice3 = await creditSale(2000);

    const result = await customersService.recordKhataPayment(
      realCustomer.id,
      { id: newId(), amount: 6000, method: "CASH" },
      admin.id,
    );

    expect(result.allocations).toEqual([
      { saleId: invoice1.id, amountAllocated: 3000 },
      { saleId: invoice2.id, amountAllocated: 3000 },
    ]);
    expect(result.unallocatedAmount).toBe(0);

    const sale1 = await prisma.sale.findUniqueOrThrow({ where: { id: invoice1.id } });
    const sale2 = await prisma.sale.findUniqueOrThrow({ where: { id: invoice2.id } });
    const sale3 = await prisma.sale.findUniqueOrThrow({ where: { id: invoice3.id } });
    expect(Number(sale1.remainingAmount)).toBe(0);
    expect(Number(sale2.remainingAmount)).toBe(2000); // 5000 - 3000
    expect(Number(sale3.remainingAmount)).toBe(2000); // untouched
  });
});
