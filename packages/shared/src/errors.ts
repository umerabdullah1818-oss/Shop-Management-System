/**
 * Stable, machine-readable error codes shared between the backend (which
 * throws them) and the frontend (which branches on them) — see
 * docs/09-api-design.md §0. Never expose raw stack traces or DB error
 * messages to the client; `message` here is always the plain-language text
 * shown to shop staff (SRS NFR-005).
 */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  DUPLICATE_SKU: "DUPLICATE_SKU",
  DUPLICATE_BARCODE: "DUPLICATE_BARCODE",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  BELOW_COST_BLOCKED: "BELOW_COST_BLOCKED",
  DISCOUNT_CAP_EXCEEDED: "DISCOUNT_CAP_EXCEEDED",
  OVERRIDE_REQUIRED: "OVERRIDE_REQUIRED",
  OVERRIDE_TOKEN_INVALID_OR_EXPIRED: "OVERRIDE_TOKEN_INVALID_OR_EXPIRED",
  SHIFT_ALREADY_OPEN: "SHIFT_ALREADY_OPEN",
  NO_OPEN_SHIFT: "NO_OPEN_SHIFT",
  ANONYMOUS_KHATA_NOT_ALLOWED: "ANONYMOUS_KHATA_NOT_ALLOWED",
  SPLIT_PAYMENT_NOT_SUPPORTED: "SPLIT_PAYMENT_NOT_SUPPORTED",
  INVALID_CANCELLATION_SCOPE: "INVALID_CANCELLATION_SCOPE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Thrown by service-layer code; a global NestJS exception filter (each
 * app's src/common/filters) maps this to the ApiErrorBody shape and the
 * matching HTTP status. Keeping this in the shared package means both
 * local-server and cloud-api produce identically-shaped errors.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
