-- BR-021 / docs/08-database-schema.md §5: "one OPEN shift per counter" can't
-- be expressed as a plain Prisma @@unique since it's conditional on
-- status = 'OPEN'. This is the real guarantee; the app-level check in
-- ShiftsService.open() is just the fast-path friendly error before hitting it.
CREATE UNIQUE INDEX "one_open_shift_per_counter"
  ON "Shift" ("counterId")
  WHERE "status" = 'OPEN';
