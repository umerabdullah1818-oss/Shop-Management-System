import { IsOptional, IsString, Length, MinLength } from "class-validator";

// One endpoint, one of the two fields — service picks based on the target
// user's role. Admin re-enters the new credential in person; there's no
// "email a reset link" flow since this is a LAN-only shop system.
export class ResetCredentialDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @Length(4, 8)
  pin?: string;
}
