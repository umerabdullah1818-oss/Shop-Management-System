import { Injectable } from "@nestjs/common";
import { ExpenseCategory } from "@shop/database";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { CreateExpenseDto } from "./dto/create-expense.dto";

// FR-080/BR-020. Admin-only (enforced at the controller).
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(params: { category?: ExpenseCategory; dateFrom?: string; dateTo?: string }) {
    return this.prisma.expense.findMany({
      where: {
        ...(params.category ? { category: params.category } : {}),
        ...(params.dateFrom || params.dateTo
          ? {
              date: {
                ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
                ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
    });
  }

  async create(dto: CreateExpenseDto, userId: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id: dto.id } });
    if (existing) return existing; // idempotent replay

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          id: dto.id,
          category: dto.category,
          description: dto.description,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          date: new Date(dto.date),
          addedById: userId,
          shiftId: dto.shiftId,
          receiptUrl: dto.receiptUrl,
        },
      });
      await recordOutbox(tx, "Expense", expense.id, expense);
      return expense;
    });
  }
}
