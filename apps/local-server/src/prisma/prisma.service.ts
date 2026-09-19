import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@shop/database";

/**
 * Thin NestJS wrapper around the shared @shop/database Prisma client, so
 * every module injects PrismaService rather than importing the client
 * directly — keeps lifecycle (connect/disconnect) managed by Nest.
 *
 * Explicitly passes datasources.db.url rather than trusting PrismaClient's
 * own resolution: the generated client auto-loads packages/database/.env
 * (since that's where schema.prisma lives) at import time, which can set
 * process.env.DATABASE_URL before this app's own .env gets a chance —
 * dotenv never overrides an already-set var. See package.json's "dev"/
 * "start" scripts (dotenv-cli loading THIS app's .env into the real OS
 * environment before Node starts) for the actual fix; this is defense in
 * depth. Discovered the hard way running cloud-api and local-server side
 * by side — see docs/08-database-schema.md's amendments.
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
