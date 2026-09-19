import { ulid } from "ulid";

/**
 * Every financially/operationally significant row gets its primary key from
 * here — never a bare DB auto-increment/serial and never a bare `uuid()`
 * default. ULIDs are lexicographically sortable by creation time and
 * generated client-side (by whichever process creates the row), which is
 * what makes the cloud sync ingest endpoint's upsert-by-id idempotency work
 * (docs/10-offline-engine.md §3, SRS OFF-004/SYNC-001/SYNC-003).
 *
 * Reference/config data with no offline-sync relevance (Category, Setting,
 * Device, Counter) may keep Prisma's `cuid()` default instead — see
 * docs/08-database-schema.md §2 for the rationale split.
 */
export function newId(): string {
  return ulid();
}
