import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/decorators/public.decorator";

/**
 * docs/10-offline-engine.md §7 — checked by an external watchdog or the
 * Admin dashboard's sync/health panel (SYNC-006), not by shop staff.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up", timestamp: new Date().toISOString() };
    } catch {
      return { status: "degraded", database: "down", timestamp: new Date().toISOString() };
    }
  }
}
