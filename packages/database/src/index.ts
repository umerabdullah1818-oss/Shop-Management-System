import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * Both the Local Shop Server and the Cloud API import this same generated
 * client against the same schema (docs/08-database-schema.md) — they are
 * two separate deployed Postgres instances, distinguished only by each
 * app's own DATABASE_URL, not by a different schema.
 */
let sharedClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!sharedClient) {
    sharedClient = new PrismaClient();
  }
  return sharedClient;
}
