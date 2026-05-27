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
import { RuleChainService } from '../rule-chain/rule-chain.service';
import { RuleEngineExecutorService } from '../rule-chain/rule-engine-executor.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly ruleChainService: RuleChainService,
    private readonly ruleEngineExecutorService: RuleEngineExecutorService,
  ) {}

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
    
    try {
      // 1. Decodificar la telemetría y encontrar/crear el dispositivo asociado
      const { device, decodedPayload } = await this.telemetryService.decodeUplink(
        payload,
        integration.id,
        integration.decoderCode,
      );

      // 2. Buscar si la organización posee una cadena de reglas activa
      const activeChain = await this.ruleChainService.findActive(device.organizationId);

      if (activeChain) {
        this.logger.log(
          `Redirigiendo flujo de uplink del dispositivo ${device.devEUI} hacia Cadena de Reglas: ${activeChain.name}`,
        );
        // Ejecutar de forma asíncrona no bloqueante
        await this.ruleEngineExecutorService.execute(activeChain, decodedPayload || {}, device);
      } else {
        // Flujo tradicional: guardar directamente
        await this.telemetryService.saveUplinkWithDecoded(
          payload,
          device,
          decodedPayload,
          integration.id,
        );
      }
    } catch (err) {
      this.logger.error(`Error procesando webhook uplink: ${err.message}`, err.stack);
      // Fallback robusto en caso de error para guardar la telemetría en bruto sin interrumpir
      try {
        await this.telemetryService.saveUplink(payload, integration.id, integration.decoderCode);
      } catch (innerErr) {
        this.logger.error(`Error crítico en fallback de persistencia: ${innerErr.message}`);
      }
    }

    return { status: 'ok' };
  }
}
