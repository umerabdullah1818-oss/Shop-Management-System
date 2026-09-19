import { Module } from "@nestjs/common";
import { CountersController } from "./counters.controller";

@Module({ controllers: [CountersController] })
export class CountersModule {}
