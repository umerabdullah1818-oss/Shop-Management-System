import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Minimal ULID-shaped ids for seed data only — real runtime code always
// uses @shop/shared's newId() (see packages/shared/src/id.ts). Avoided here
// to keep this script dependency-free of the workspace build order.
function seedId(label: string) {
  return `SEED-${label}`;
}

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      id: seedId("admin"),
      name: "Shop Admin",
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  await prisma.customer.upsert({
    where: { id: seedId("walkin-customer") },
    update: {},
    create: {
      id: seedId("walkin-customer"),
      name: "Walk-in Customer",
      isWalkIn: true,
      status: "ACTIVE",
    },
  });

  // Deterministic id (not the cuid() default): Counter.id is referenced by
  // Shift/Sale foreign keys, and a random per-environment id would never
  // match between local and cloud once those rows try to sync — found this
  // the hard way during the runtime smoke test (docs/08-database-schema.md
  // amendments). In real usage beyond this initial bootstrap row, counters
  // are created via POST /counters, which correctly syncs like everything
  // else — this seed only needs to cover the one counter every shop starts with.
  await prisma.counter.upsert({
    where: { id: seedId("counter-c1") },
    update: {},
    create: { id: seedId("counter-c1"), name: "C1" },
  });

  await prisma.setting.upsert({
    where: { key: "cashierDiscountCapPercent" },
    update: {},
    create: { key: "cashierDiscountCapPercent", value: 10 },
  });

  await prisma.setting.upsert({
    where: { key: "printerFormat" },
    update: {},
    create: { key: "printerFormat", value: "80mm" },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin user "${admin.username}". ` +
    (process.env.SEED_ADMIN_PASSWORD ? "" : `Default password is "${adminPassword}" — change it immediately (Decision-driven default, not for production use).`));
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
