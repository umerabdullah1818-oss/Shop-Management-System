import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@shop/database";

export const ROLES_KEY = "roles";

/**
 * Marks a controller method as requiring one of the given roles. Enforced
 * by RolesGuard — this is the actual security boundary (SEC-001); the
 * frontend hiding a button is never sufficient on its own.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
