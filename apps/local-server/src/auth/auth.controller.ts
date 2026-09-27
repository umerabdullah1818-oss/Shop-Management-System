import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { LoginPinDto } from "./dto/login-pin.dto";
import { StepUpDto } from "./dto/step-up.dto";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "./auth.types";
import { PermissionsService } from "../users/permissions.service";

// Endpoint shapes per docs/09-api-design.md §1.
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // Tighter than the global 30/min default — credential-guessing endpoints
  // (audit §3: "rate limiting/lockout protection where appropriate").
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  // The logged-in user's own action permissions + dashboard config, so the
  // frontend can render itself correctly. This is a UI convenience only —
  // PermissionsService.assert() in each business-logic service is what
  // actually enforces these, not this endpoint (audit §4: "hiding a button
  // is NOT sufficient").
  @Get("permissions")
  async permissions(@CurrentUser() user: AuthenticatedUser) {
    const [actions, dashboard] = await Promise.all([
      this.permissionsService.getActionPermissions(user),
      this.permissionsService.getDashboardConfig(user),
    ]);
    return { actions, dashboard };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("step-up")
  stepUp(@Body() dto: StepUpDto) {
    return this.authService.stepUp(dto);
  }
}
