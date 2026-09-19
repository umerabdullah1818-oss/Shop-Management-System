import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks an endpoint as not requiring a session token — only login and the
 * health check use this. Every other endpoint is authenticated by default
 * (JwtAuthGuard is applied globally in app.module.ts), which is the safer
 * default: a new endpoint is locked down unless explicitly opened up,
 * rather than open unless explicitly guarded.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
