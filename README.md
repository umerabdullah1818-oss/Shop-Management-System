# Shop Billing & Management System

Hybrid offline-first POS/inventory/accounting system for a decoration-pieces shop. See [`docs/`](docs/) for the full design record — start with [`docs/05-implementation-roadmap.md`](docs/05-implementation-roadmap.md) for where the project currently stands.

## Structure

```
apps/
  local-server/   NestJS API (port 3000) — the Local Shop Server, source of truth for the shop
  cloud-api/      NestJS API (port 4000) — cloud sync ingest + read-mostly reporting
  web/            Next.js frontend (port 3002) — thin LAN client of local-server
packages/
  database/       Shared Prisma schema + client (packages/database/prisma/schema.prisma)
  shared/         Shared TS types/utilities (ULID id generation, error codes, sync payload shapes)
docs/             Design record: requirements, architecture, schema rationale, API design, offline engine, UI/UX
```

## Getting started (local development)

```bash
pnpm install
docker compose up -d postgres postgres-cloud
cp packages/database/.env.example packages/database/.env
cp apps/local-server/.env.example apps/local-server/.env
cp apps/cloud-api/.env.example apps/cloud-api/.env
cp apps/web/.env.local.example apps/web/.env.local

pnpm db:generate
pnpm --filter @shop/database exec prisma migrate dev --name init
pnpm --filter @shop/database run seed

# The cloud DB uses the same schema (packages/database) — point at it and
# migrate/seed separately, since it's a distinct Postgres instance:
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/shop_cloud?schema=public" \
  pnpm --filter @shop/database exec prisma migrate deploy

pnpm dev:local-server   # http://localhost:3000
pnpm dev:cloud-api      # http://localhost:4000
pnpm dev:web            # http://localhost:3002
```

Also run `pnpm --filter @shop/local-server run test:setup` once (creates/migrates a separate `shop_test` database) before `pnpm --filter @shop/local-server test` — the integration test suite runs against real Postgres, not mocks (see `apps/local-server/test/`).

Default seeded admin credentials (**change immediately, never used in production** — see `packages/database/prisma/seed.ts`): username `admin`, password `ChangeMe123!`.

For the Local Shop Server to actually reach the cloud (rather than just operating fully offline, which needs no cloud setup at all — see `docs/10-offline-engine.md`), set `CLOUD_API_URL=http://localhost:4000/api/v1` and a matching `CLOUD_DEVICE_API_KEY`/`DEVICE_API_KEYS` pair in each app's `.env`.

## Why the structure is the way it is

Every non-obvious decision — why FIFO batches work the way they do, why sync is one-directional, why client devices don't need their own offline store — is written down in `docs/`, not just in code comments. If something in the code looks surprising, check there first; the reasoning is almost always already recorded.
