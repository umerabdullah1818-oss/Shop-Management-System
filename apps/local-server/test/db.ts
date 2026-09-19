import { PrismaClient } from "@shop/database";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Integration tests run against a real Postgres database (docker-compose's
 * local `postgres` service, a separate `shop_test` logical database) rather
 * than mocks — FIFO row-locking (SELECT ... FOR UPDATE), the partial unique
 * index for shifts, and transaction rollback behavior can't be faithfully
 * exercised any other way. See docs/06-srs.md's testing requirements (§53
 * of the original spec) — this covers the highest-risk subset (FIFO/COGS,
 * idempotency, Khata allocation), not the full exhaustive matrix.
 *
 * Returns the real PrismaService (not a bare PrismaClient) since that's
 * what every domain service's constructor actually expects.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/shop_test?schema=public";

export function createTestPrisma(): PrismaService {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  return new PrismaService();
}

// Deletes all rows in FK-safe order, keeping the schema itself intact
// (migrations already applied once via `prisma migrate deploy` against
// shop_test — see package.json's "test:setup" script).
export async function cleanDatabase(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.syncConflict.deleteMany(),
    prisma.outboxEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.overrideAuthorization.deleteMany(),
    prisma.returnItemBatchRestock.deleteMany(),
    prisma.returnItem.deleteMany(),
    prisma.return.deleteMany(),
    prisma.khataPaymentAllocation.deleteMany(),
    prisma.khataPayment.deleteMany(),
    prisma.khataTransaction.deleteMany(),
    prisma.khataAccount.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.saleItemBatchAllocation.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventoryBatch.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.supplierPayment.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.invoiceSequence.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.counter.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
}
