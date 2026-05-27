import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryRecord } from './telemetry.entity';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { DecoderService } from './decoder.service';
import { RealtimeService } from './realtime.service';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryRecord]), DevicesModule],
  providers: [TelemetryService, DecoderService, RealtimeService],
  controllers: [TelemetryController],
  exports: [TelemetryService, RealtimeService],
})
export class TelemetryModule {}

