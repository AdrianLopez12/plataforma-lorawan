import { Controller, Get, Param, Patch, Body, Query, Post, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { Device } from './device.entity';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogService } from '../common/audit-log.service';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  findAll(@Query('integrationId') integrationId?: string): Promise<Device[]> {
    return this.devicesService.findAll(integrationId);
  }

  @Get(':devEUI')
  findOne(@Param('devEUI') devEUI: string): Promise<Device | null> {
    return this.devicesService.findOne(devEUI);
  }

  @Patch(':devEUI')
  update(
    @Param('devEUI') devEUI: string,
    @Body() body: Partial<Device>,
  ): Promise<Device | null> {
    return this.devicesService.update(devEUI, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':devEUI/downlink')
  async sendDownlink(
    @Param('devEUI') devEUI: string,
    @Body() body: { command: 'open' | 'close' },
    @Req() req: any,
  ) {
    const device = await this.devicesService.findOne(devEUI);
    if (!device) {
      throw new NotFoundException(`Dispositivo ${devEUI} no encontrado.`);
    }

    const command = body.command;
    const isOpening = command === 'open';

    // Actualizar el estado de la válvula en la base de datos
    await this.devicesService.update(devEUI, { valveOpen: isOpening });

    // Registrar en el log de auditoría
    await this.auditLogService.record(
      isOpening ? 'VALVE_OPEN' : 'VALVE_CLOSE',
      req.user,
      { devEUI, command },
      req.ip || '127.0.0.1',
      device.organizationId
    );

    return {
      success: true,
      message: `Comando Downlink de ${isOpening ? 'apertura' : 'cierre'} enviado con éxito.`,
      valveOpen: isOpening,
    };
  }
}
