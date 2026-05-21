import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [TelemetryModule, IntegrationModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
