import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// §57 coding rules: business-rule values configurable here, never hardcoded.
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.setting.findMany();
  }

  async update(key: string, value: unknown) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }
}
