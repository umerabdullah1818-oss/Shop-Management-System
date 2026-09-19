import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";
import { StepUpDto } from "./dto/step-up.dto";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "./auth.types";

// Endpoint shapes per docs/09-api-design.md §1.
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post("login-pin")
  loginPin(@Body() dto: LoginPinDto) {
    return this.authService.loginPin(dto);
  }

  @Post("logout")
  @HttpCode(204)
  logout() {
    // Stateless JWT — the client discards the token. If server-side
    // revocation is ever needed, introduce a session/blocklist table here.
    return;
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  @Post("step-up")
  stepUp(@Body() dto: StepUpDto) {
    return this.authService.stepUp(dto);
  }
}
