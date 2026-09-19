import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@shop/database";

/**
 * Explicitly passes `datasources.db.url` rather than letting PrismaClient
 * fall back to its own default resolution. Discovered why this matters the
 * hard way (docs/08-database-schema.md's amendments): local-server and
 * cloud-api both import the SAME generated client from the shared
 * @shop/database package, and without this override, writes from this
 * process landed in the WRONG database (local-server's) instead of this
 * app's own — process.env.DATABASE_URL from this app's own .env wasn't
 * reliably what the client actually used. Reading via `process.env`
 * directly here (not ConfigService) because this constructor runs before
 * Nest's DI has necessarily finished wiring up ConfigService for every
 * other provider — env vars are process-global regardless.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: process.env.DATABASE_URL } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
