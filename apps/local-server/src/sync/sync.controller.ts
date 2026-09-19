import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { SyncService } from "./sync.service";

// docs/09-api-design.md §14 (Local side). Admin-only.
@Roles(UserRole.ADMIN)
@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get("status")
  status() {
    return this.syncService.status();
  }

  @Get("conflicts")
  conflicts() {
    return this.syncService.conflicts();
  }

  @Post("conflicts/:id/resolve")
  resolve(
    @Param("id") id: string,
    @Body("notes") notes: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.syncService.resolveConflict(id, user.id, notes);
  }
}
