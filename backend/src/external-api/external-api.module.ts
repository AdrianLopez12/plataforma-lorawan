import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../devices/device.entity';
import { TelemetryRecord } from '../telemetry/telemetry.entity';
import { AuditLog } from '../common/audit-log.entity';
import { IntegrationModule } from '../integration/integration.module';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, TelemetryRecord, AuditLog]),
    IntegrationModule, // Requerido para resolver IntegrationService en ApiKeyGuard
  ],
  controllers: [ExternalApiController],
  providers: [ExternalApiService],
})
export class ExternalApiModule {}
