import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ExternalApiService } from './external-api.service';

@Controller('external-api')
@UseGuards(ApiKeyGuard)
export class ExternalApiController {
  constructor(private readonly externalApiService: ExternalApiService) {}

  /**
   * GET /external-api/devices
   * Lista todos los dispositivos de la organización del cliente
   */
  @Get('devices')
  async getDevices(@Req() req: any) {
    const orgId = req.organizationId;
    return this.externalApiService.findDevicesByOrg(orgId);
  }

  /**
   * GET /external-api/devices/:devEUI
   * Detalle técnico de un dispositivo por su DevEUI
   */
  @Get('devices/:devEUI')
  async getDevice(@Req() req: any, @Param('devEUI') devEUI: string) {
    const orgId = req.organizationId;
    return this.externalApiService.findDeviceByEUIAndOrg(devEUI, orgId);
  }

  /**
   * POST /external-api/devices/:devEUI/valve
   * Control remoto bidireccional (abrir o cerrar válvula)
   */
  @Post('devices/:devEUI/valve')
  @HttpCode(HttpStatus.OK)
  async controlValve(
    @Req() req: any,
    @Param('devEUI') devEUI: string,
    @Body() body: { open: boolean },
  ) {
    const orgId = req.organizationId;
    if (body.open === undefined || typeof body.open !== 'boolean') {
      throw new BadRequestException('El cuerpo de la petición debe contener el campo booleano "open".');
    }
    return this.externalApiService.controlValve(devEUI, orgId, body.open);
  }

  /**
   * GET /external-api/telemetry
   * Obtiene las últimas telemetrías asociadas a los dispositivos de la organización
   */
  @Get('telemetry')
  async getTelemetry(
    @Req() req: any,
    @Query('limit') limitQuery?: string,
    @Query('page') pageQuery?: string,
    @Query('devEUI') devEUI?: string,
  ) {
    const orgId = req.organizationId;
    const limit = Math.min(limitQuery ? parseInt(limitQuery, 10) : 50, 500);
    const page = pageQuery ? parseInt(pageQuery, 10) : 1;

    if (isNaN(limit) || limit <= 0) {
      throw new BadRequestException('El parámetro "limit" debe ser un número entero positivo.');
    }
    if (isNaN(page) || page <= 0) {
      throw new BadRequestException('El parámetro "page" debe ser un número entero positivo.');
    }

    return this.externalApiService.findLatestTelemetryByOrg(orgId, limit, page, devEUI);
  }

  /**
   * GET /external-api/telemetry/:devEUI
   * Obtiene el historial de telemetrías específico de un DevEUI
   */
  @Get('telemetry/:devEUI')
  async getTelemetryForDevice(
    @Req() req: any,
    @Param('devEUI') devEUI: string,
    @Query('limit') limitQuery?: string,
    @Query('page') pageQuery?: string,
  ) {
    const orgId = req.organizationId;
    const limit = Math.min(limitQuery ? parseInt(limitQuery, 10) : 50, 500);
    const page = pageQuery ? parseInt(pageQuery, 10) : 1;

    if (isNaN(limit) || limit <= 0) {
      throw new BadRequestException('El parámetro "limit" debe ser un número entero positivo.');
    }
    if (isNaN(page) || page <= 0) {
      throw new BadRequestException('El parámetro "page" debe ser un número entero positivo.');
    }

    return this.externalApiService.findLatestTelemetryByOrg(orgId, limit, page, devEUI);
  }

  /**
   * GET /external-api/alerts
   * Obtiene la bitácora de alertas de la organización
   */
  @Get('alerts')
  async getAlerts(
    @Req() req: any,
    @Query('limit') limitQuery?: string,
  ) {
    const orgId = req.organizationId;
    const limit = Math.min(limitQuery ? parseInt(limitQuery, 10) : 50, 500);

    if (isNaN(limit) || limit <= 0) {
      throw new BadRequestException('El parámetro "limit" debe ser un número entero positivo.');
    }

    return this.externalApiService.findAlertsByOrg(orgId, limit);
  }
}
