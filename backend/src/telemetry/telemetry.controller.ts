import { Controller, Get, Post, Body, Param, Query, Sse, MessageEvent } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { DecoderService } from './decoder.service';
import { RealtimeService } from './realtime.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly decoderService: DecoderService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Sse('stream')
  streamTelemetry(): Observable<MessageEvent> {
    return this.realtimeService.getStream().pipe(
      map((event) => ({
        data: event,
      } as MessageEvent)),
    );
  }

  @Get('decoder')
  getDecoder() {
    return { code: this.decoderService.getDecoderCode() };
  }

  @Post('decoder')
  saveDecoder(@Body() body: { code: string }) {
    this.decoderService.saveDecoderCode(body.code);
    return { status: 'success' };
  }

  @Get()
  findLatest(
    @Query('limit') limit?: string,
    @Query('integrationId') integrationId?: string,
  ) {
    return this.telemetryService.findLatest(
      limit ? parseInt(limit) : 50,
      integrationId,
    );
  }

  @Get(':devEUI')
  findByDevice(
    @Param('devEUI') devEUI: string,
    @Query('limit') limit?: string,
  ) {
    return this.telemetryService.findByDevice(devEUI, limit ? parseInt(limit) : 100);
  }
}

