import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UserRole } from "@shop/database";
import { Roles } from "../common/decorators/roles.decorator";
import { SettingsService } from "./settings.service";

// docs/09-api-design.md §15. Admin-only.
@Roles(UserRole.ADMIN)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @Patch(":key")
  update(@Param("key") key: string, @Body("value") value: unknown) {
    return this.settingsService.update(key, value);
  }
}
