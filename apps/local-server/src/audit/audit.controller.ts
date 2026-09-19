import { Controller, Get, Query } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { AuditService } from "./audit.service";

// docs/09-api-design.md §13. Admin-only, read-only.
@Roles(UserRole.ADMIN)
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.auditService.findAll({ entityType, entityId, userId, action, dateFrom, dateTo });
  }
}
