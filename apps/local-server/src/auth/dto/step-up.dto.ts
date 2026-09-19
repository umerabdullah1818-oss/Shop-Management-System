import { IsOptional, IsString } from "class-validator";

/**
 * Admin step-up override request, bound to a specific in-progress sale
 * attempt (BR-011, SEC-010; sequence in docs/07-architecture-detailed.md §6.2).
 * Exactly one of password/pin is expected depending on how the admin
 * normally authenticates; validated in the service, not here, since it's a
 * cross-field rule.
 */
export class StepUpDto {
  @IsString()
  adminUsername!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsString()
  saleClientId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
