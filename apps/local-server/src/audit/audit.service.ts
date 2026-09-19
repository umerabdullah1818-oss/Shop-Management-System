import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface AuditQuery {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

// FR-100/SEC-006: read-only by design — there is deliberately no
// create/update/delete method here. The only writer of AuditLog rows is
// each domain service, at the moment of the action being audited.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: AuditQuery) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
}
