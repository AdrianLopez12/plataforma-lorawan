import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { DecoderService } from './decoder.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly decoderService: DecoderService,
  ) {}

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
