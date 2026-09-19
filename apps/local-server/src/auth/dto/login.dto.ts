import { IsString, MinLength } from "class-validator";

// Admin full-credential login (SEC-002). See docs/09-api-design.md §1.
export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
