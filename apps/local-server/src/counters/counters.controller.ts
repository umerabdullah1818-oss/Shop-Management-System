import { Body, Controller, Get, Post } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { newId } from "@shop/shared";
import { PrismaService } from "../prisma/prisma.service";
import { recordOutbox } from "../sync/outbox.util";
import { Roles } from "../common/decorators/roles.decorator";
import { CreateCounterDto } from "./dto/create-counter.dto";

/**
 * Small gap discovered while building the POS screen: the frontend needs a
 * way to list counters to open a shift against (FR-090), and the API design
 * doc didn't call out a dedicated endpoint for it — Counter only appeared
 * as a foreign key elsewhere.
 *
 * Counters must sync like any other reference data despite being "fixed
 * physical setup" — Shift and Sale both hold a hard FK to counterId, so a
 * counter that only exists locally breaks sync for everything referencing
 * it (found via the runtime smoke test; see docs/08-database-schema.md's
 * amendments). Admin-only create, matching the original spec's silence on
 * counter management as a distinct capability while still giving it a
 * real, synced identity from the moment it's created.
 */
@Controller("counters")
export class CountersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.counter.findMany({ orderBy: { name: "asc" } });
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateCounterDto) {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.counter.create({ data: { id: newId(), name: dto.name } });
      await recordOutbox(tx, "Counter", counter.id, counter);
      return counter;
    });
  }
}
