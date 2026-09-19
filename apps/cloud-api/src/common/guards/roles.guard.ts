import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DomainError, ErrorCode } from "@shop/shared";
import { UserRole } from "@shop/database";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AuthenticatedUser } from "../../auth/auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new DomainError(ErrorCode.FORBIDDEN, "You don't have permission to perform this action.", undefined, 403);
    }
    return true;
  }
}
