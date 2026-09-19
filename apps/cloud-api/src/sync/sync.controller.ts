import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { DeviceApiKeyGuard } from "./device-api-key.guard";
import { Public } from "../common/decorators/public.decorator";
import type { SyncIngestRequest } from "@shop/shared";

// docs/09-api-design.md §14 (Cloud side). Authenticated by a device
// credential, not a user session — @Public() skips the global JwtAuthGuard,
// DeviceApiKeyGuard is the real gate here.
@Public()
@UseGuards(DeviceApiKeyGuard)
@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post("ingest")
  ingest(@Body() request: SyncIngestRequest) {
    return this.syncService.ingest(request);
  }
}
