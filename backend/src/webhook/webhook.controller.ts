import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { WebhookGuard } from '../common/guards/webhook.guard';
import { TelemetryService } from '../telemetry/telemetry.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * Obtiene la configuración del webhook de fallback estático.
   */
  @Get('config')
  getConfig() {
    return {
      endpoint: 'http://localhost:3000/webhook/uplink',
      secret: process.env.TEKTELIC_WEBHOOK_SECRET || 'cambia_este_secreto_seguro',
    };
  }

  /**
   * Endpoint multitenant dinámico para uplinks de Tektelic LNS.
   * URL: http://TU_IP:3000/webhook/uplink/:integrationId
   * Header: Authorization: Bearer <INTEGRATION_SECRET>
   */
  @Post('uplink/:integrationId')
  @UseGuards(WebhookGuard)
  @HttpCode(HttpStatus.OK)
  async receiveUplink(@Body() payload: any, @Req() req: any) {
    const integration = req.integration;
    this.logger.log(
      `Uplink recibido — devEUI: ${payload.devEUI ?? 'desconocido'} para integración: ${integration?.name ?? 'desconocido'}`,
    );
    await this.telemetryService.saveUplink(payload, integration.id, integration.decoderCode);
    return { status: 'ok' };
  }
}
