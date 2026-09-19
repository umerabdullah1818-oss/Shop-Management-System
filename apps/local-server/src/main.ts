import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/filters/domain-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Backend enforces all validation — the frontend's own checks are UX only
  // (SEC-001, §58 of the master prompt).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Maps DomainError -> the standard { error: { code, message, details } }
  // envelope (docs/09-api-design.md §0) instead of leaking stack traces.
  app.useGlobalFilters(new DomainExceptionFilter());

  app.setGlobalPrefix("api/v1");
  app.enableCors(); // LAN-only in practice; see docs/07-architecture-detailed.md §4

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Local Shop Server API listening on port ${port}`);
}

bootstrap();
