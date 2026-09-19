import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { DomainError, ApiErrorBody, ErrorCode } from "@shop/shared";

/**
 * Translates thrown errors into the standard error envelope
 * (docs/09-api-design.md §0). Staff-facing `message` is always
 * plain-language (SRS NFR-005); full technical detail (stack, raw DB error)
 * is logged server-side only and never sent to the client.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("DomainExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const body: ApiErrorBody = {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
      response.status(exception.httpStatus).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === "string"
          ? res
          : (res as { message?: string | string[] })?.message ?? exception.message;
      const body: ApiErrorBody = {
        error: {
          code: status === HttpStatus.FORBIDDEN ? ErrorCode.FORBIDDEN : ErrorCode.VALIDATION_ERROR,
          message: Array.isArray(message) ? message.join("; ") : message,
        },
      };
      response.status(status).json(body);
      return;
    }

    // Unexpected/unhandled — log full detail internally, show a generic
    // staff-facing message only (never a raw 500 stack trace, per NFR-005).
    this.logger.error(exception instanceof Error ? exception.stack : exception);
    const body: ApiErrorBody = {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again or contact an admin.",
      },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
