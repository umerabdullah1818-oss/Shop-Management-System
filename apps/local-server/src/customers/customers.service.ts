import { Injectable } from "@nestjs/common";
import { EntityStatus, KhataTransactionType, SaleStatus } from "@shop/database";
import { DomainError, ErrorCode, newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateKhataPaymentDto } from "./dto/create-khata-payment.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.customer.findMany({
      where: {
        status: EntityStatus.ACTIVE,
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] }
          : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Customer not found.", { id }, 404);
    }
    return customer;
  }

  // FR-030: Cashier and Admin can both create customers.
  async create(dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id: dto.id } });
    if (existing) return existing; // idempotent replay

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { id: dto.id, name: dto.name, phone: dto.phone, email: dto.email, address: dto.address },
      });
      await recordOutbox(tx, "Customer", customer.id, customer);
      return customer;
    });
  }

  /** FR-032: balance is always derived from the ledger, never stored/edited directly. */
  async khata(customerId: string) {
    await this.findOne(customerId);
    const account = await this.prisma.khataAccount.findUnique({
      where: { customerId },
      include: { transactions: { orderBy: { occurredAt: "desc" } } },
    });

    if (!account) {
      return { customerId, balance: 0, transactions: [] };
    }

    const balance = account.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    return { customerId, balance, transactions: account.transactions };
  }

  /**
   * FR-033 / BR-008: allocates the payment to the customer's oldest
   * outstanding invoice first, continuing to the next-oldest until
   * exhausted — no manual invoice selection, per the worked example in
   * docs/06-srs.md §3.4 / the original spec §22.
   */
  async recordKhataPayment(customerId: string, dto: CreateKhataPaymentDto, userId: string) {
    await this.findOne(customerId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.khataPayment.findUnique({
        where: { id: dto.id },
        include: { allocations: true },
      });
      if (existing) {
        // Idempotent replay — reconstructs the same { ...payment, allocations,
        // unallocatedAmount } shape the fresh-create path returns below, so
        // callers never see a union type depending on whether this was a retry.
        const allocated = existing.allocations.reduce((s, a) => s + Number(a.amountAllocated), 0);
        return {
          ...existing,
          allocations: existing.allocations.map((a) => ({ saleId: a.saleId, amountAllocated: Number(a.amountAllocated) })),
          unallocatedAmount: Number(existing.amount) - allocated,
        };
      }

      const account = await tx.khataAccount.upsert({
        where: { customerId },
        update: {},
        create: { id: newId(), customerId },
      });

      const khataPayment = await tx.khataPayment.create({
        data: { id: dto.id, customerId, amount: dto.amount, method: dto.method, userId, shiftId: dto.shiftId },
      });
      await recordOutbox(tx, "KhataPayment", khataPayment.id, khataPayment);

      const outstandingSales = await tx.sale.findMany({
        where: { customerId, status: SaleStatus.COMPLETED, remainingAmount: { gt: 0 } },
        orderBy: { occurredAt: "asc" },
      });

      let remaining = dto.amount;
      const allocations: { saleId: string; amountAllocated: number }[] = [];

      for (const sale of outstandingSales) {
        if (remaining <= 0) break;
        const due = Number(sale.remainingAmount);
        const applied = Math.min(due, remaining);
        if (applied <= 0) continue;

        remaining -= applied;
        allocations.push({ saleId: sale.id, amountAllocated: applied });

        const updatedSale = await tx.sale.update({
          where: { id: sale.id },
          data: { remainingAmount: due - applied, amountPaid: { increment: applied } },
        });
        await recordOutbox(tx, "Sale", updatedSale.id, updatedSale);

        const allocation = await tx.khataPaymentAllocation.create({
          data: { id: newId(), khataPaymentId: khataPayment.id, saleId: sale.id, amountAllocated: applied },
        });
        await recordOutbox(tx, "KhataPaymentAllocation", allocation.id, allocation);

        const khataTx = await tx.khataTransaction.create({
          data: {
            id: newId(),
            khataAccountId: account.id,
            type: KhataTransactionType.PAYMENT_RECEIVED,
            amount: -applied, // negative: reduces what's owed
            saleId: sale.id,
            note: `Payment ${khataPayment.id}`,
          },
        });
        await recordOutbox(tx, "KhataTransaction", khataTx.id, khataTx);
      }

      // Overpayment beyond all outstanding invoices is deliberately left
      // unapplied rather than silently absorbed — surfaced in the response
      // so staff can see it and decide (e.g. hold as credit, hand back).
      return { ...khataPayment, allocations, unallocatedAmount: remaining };
    });
  }
}
