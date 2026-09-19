import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DomainError, ErrorCode } from "@shop/shared";

/**
 * Guards /sync/ingest: authenticated by a device credential (SEC-004/§6.4 of
 * docs/07-architecture-detailed.md), not a user session — the Local Shop
 * Server calls this as itself, not as any particular staff member.
 */
@Injectable()
export class DeviceApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers["x-device-api-key"];
    const validKeys = (this.config.get<string>("DEVICE_API_KEYS") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    if (!key || !validKeys.includes(key)) {
      throw new DomainError(ErrorCode.FORBIDDEN, "Invalid device credential.", undefined, 403);
    }
    return true;
  }
}
