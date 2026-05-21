import { Controller, Get, Param, Patch, Body, Query } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { Device } from './device.entity';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

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
}
