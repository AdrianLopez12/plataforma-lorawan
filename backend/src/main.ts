import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.enableCors();

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application Server corriendo en http://localhost:${port}`);
  logger.log(`Webhook endpoint: POST http://localhost:${port}/webhook/uplink`);
  logger.log(`Devices API:      GET  http://localhost:${port}/devices`);
  logger.log(`Telemetry API:    GET  http://localhost:${port}/telemetry`);
}

bootstrap();
