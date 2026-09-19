import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/filters/domain-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.setGlobalPrefix("api/v1");

  // SEC-005: only the Local Shop Server's sync worker and the optional
  // remote-reporting app call this API — CORS can be tightened to those
  // origins once the remote-reporting app's domain is known.
  app.enableCors();

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Cloud API listening on port ${port}`);
}

bootstrap();
