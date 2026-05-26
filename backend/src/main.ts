import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Habilitar cookie-parser para extraer tokens JWT de las cookies httpOnly
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Configuración de CORS segura apta para transmisión de cookies y Azure
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.enableCors({
    origin: allowedOrigin,
    credentials: true, // Permitir transmisión de cookies httpOnly
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application Server corriendo en http://localhost:${port}`);
  logger.log(`Webhook endpoint: POST http://localhost:${port}/webhook/uplink`);
  logger.log(`Devices API:      GET  http://localhost:${port}/devices`);
  logger.log(`Telemetry API:    GET  http://localhost:${port}/telemetry`);
}

bootstrap();
