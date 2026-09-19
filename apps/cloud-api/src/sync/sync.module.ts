import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";
import { DeviceApiKeyGuard } from "./device-api-key.guard";

@Module({
  controllers: [SyncController],
  providers: [SyncService, DeviceApiKeyGuard],
})
export class SyncModule {}
