import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";
import { SyncWorkerService } from "./sync-worker.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SyncController],
  providers: [SyncService, SyncWorkerService],
})
export class SyncModule {}
