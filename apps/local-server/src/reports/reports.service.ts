import { Injectable } from "@nestjs/common";
import { PaymentMethod, SaleStatus } from "@shop/database";
import { PrismaService } from "../prisma/prisma.service";

interface DateRange {
  from?: string;
  to?: string;
}

function dateFilter(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: new Date(range.from) } : {}),
    ...(range.to ? { lte: new Date(range.to) } : {}),
  };
}

// docs/09-api-design.md §12. Admin-only. Read-only aggregation across
// domains — deliberately queries Prisma directly rather than through each
// domain's own service, since reporting has different shape needs than the
// write-path business rules those services enforce.
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // REP-001
  async sales(params: DateRange & { cashierId?: string; productId?: string; paymentMethod?: PaymentMethod }) {
    const occurredAt = dateFilter(params);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.COMPLETED,
        ...(occurredAt ? { occurredAt } : {}),
        ...(params.cashierId ? { cashierId: params.cashierId } : {}),
        ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
        ...(params.productId ? { items: { some: { productId: params.productId } } } : {}),
      },
      include: { items: true },
      orderBy: { occurredAt: "desc" },
    });

    const totalRevenue = sales.reduce((s, sale) => s + Number(sale.grandTotal), 0);
    return { sales, summary: { count: sales.length, totalRevenue } };
  }

  // REP-002
  purchases(params: { supplierId?: string; productId?: string }) {
    return this.prisma.purchase.findMany({
      where: {
        ...(params.supplierId ? { supplierId: params.supplierId } : {}),
        ...(params.productId ? { items: { some: { productId: params.productId } } } : {}),
      },
      include: { items: true, supplier: true },
      orderBy: { purchaseDate: "desc" },
    });
  }

  // REP-003
  async inventory(params: { lowStockOnly?: boolean }) {
    const products = await this.prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: { inventoryBatches: true },
    });

    const rows = products.map((p) => {
      const totalStock = p.inventoryBatches.reduce((s, b) => s + Number(b.remainingQty), 0);
      const valuation = p.inventoryBatches.reduce(
        (s, b) => s + Number(b.remainingQty) * Number(b.unitCost),
        0,
      );
      return {
        productId: p.id,
        name: p.name,
        totalStock,
        valuation,
        minStockLevel: Number(p.minStockLevel),
        lowStock: totalStock < Number(p.minStockLevel),
        batches: p.inventoryBatches,
      };
    });

    const filtered = params.lowStockOnly ? rows.filter((r) => r.lowStock) : rows;
    return { rows: filtered, totalValuation: rows.reduce((s, r) => s + r.valuation, 0) };
  }

  // REP-004
  async khata(params: { customerId?: string }) {
    const accounts = await this.prisma.khataAccount.findMany({
      where: params.customerId ? { customerId: params.customerId } : {},
      include: { customer: true, transactions: true },
    });

    const rows = accounts.map((a) => ({
      customerId: a.customerId,
      customerName: a.customer.name,
      balance: a.transactions.reduce((s, t) => s + Number(t.amount), 0),
    }));

    return { balances: rows, totalOutstanding: rows.reduce((s, r) => s + r.balance, 0) };
  }

  // REP-005
  async suppliers(params: { supplierId?: string }) {
    const suppliers = await this.prisma.supplier.findMany({
      where: params.supplierId ? { id: params.supplierId } : {},
      include: { purchases: true, supplierPayments: true },
    });

    return suppliers.map((s) => ({
      supplierId: s.id,
      name: s.name,
      totalPurchased: s.purchases.reduce((sum, p) => sum + Number(p.amountPaid) + Number(p.amountPayable), 0),
      totalPaid: s.purchases.reduce((sum, p) => sum + Number(p.amountPaid), 0),
      totalPayable: s.purchases.reduce((sum, p) => sum + Number(p.amountPayable), 0),
    }));
  }

  // REP-006 — strict FIFO COGS, never an average (BR-022).
  async profit(params: DateRange) {
    const occurredAt = dateFilter(params);
    const sales = await this.prisma.sale.findMany({
      where: { status: SaleStatus.COMPLETED, ...(occurredAt ? { occurredAt } : {}) },
      include: { items: { include: { allocations: true } } },
    });

    const revenue = sales.reduce((s, sale) => s + Number(sale.grandTotal), 0);
    const cogs = sales.reduce(
      (s, sale) =>
        s +
        sale.items.reduce(
          (itemSum, item) =>
            itemSum +
            item.allocations.reduce((a, alloc) => a + Number(alloc.quantity) * Number(alloc.unitCostAtSale), 0),
          0,
        ),
      0,
    );
    const grossProfit = revenue - cogs;

    const expenseFilter = dateFilter(params);
    const expenses = await this.prisma.expense.aggregate({
      where: expenseFilter ? { date: expenseFilter } : {},
      _sum: { amount: true },
    });
    const totalExpenses = Number(expenses._sum.amount ?? 0);

    return { revenue, cogs, grossProfit, expenses: totalExpenses, netProfit: grossProfit - totalExpenses };
  }

  // REP-007
  async expenses(params: DateRange & { category?: string }) {
    const date = dateFilter(params);
    const expenses = await this.prisma.expense.findMany({
      where: { ...(date ? { date } : {}), ...(params.category ? { category: params.category as never } : {}) },
      orderBy: { date: "desc" },
    });

    const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
      return acc;
    }, {});

    return { expenses, byCategory, total: expenses.reduce((s, e) => s + Number(e.amount), 0) };
  }

  // REP-008 — Admin dashboard summary.
  async dashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRange = { from: today.toISOString() };

    const [todaySales, lowStock, khata, suppliers, profit, recentSales] = await Promise.all([
      this.sales(todayRange),
      this.inventory({ lowStockOnly: true }),
      this.khata({}),
      this.suppliers({}),
      this.profit(todayRange),
      this.prisma.sale.findMany({ orderBy: { occurredAt: "desc" }, take: 10 }),
    ]);

    return {
      todaySalesRevenue: todaySales.summary.totalRevenue,
      lowStockCount: lowStock.rows.length,
      outstandingKhata: khata.totalOutstanding,
      supplierPayable: suppliers.reduce((s, sup) => s + sup.totalPayable, 0),
      grossProfitToday: profit.grossProfit,
      netProfitToday: profit.netProfit,
      recentSales,
    };
  }
}
