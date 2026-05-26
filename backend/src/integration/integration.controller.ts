import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { Integration } from './integration.entity';

@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Post()
  create(
    @Body() data: { name: string; description?: string; preset?: string; organizationId?: string },
  ): Promise<Integration> {
    return this.integrationService.create(data);
  }

  @Get()
  findAll(): Promise<Integration[]> {
    return this.integrationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Integration> {
    return this.integrationService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: Partial<Integration>,
  ): Promise<Integration> {
    return this.integrationService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.integrationService.remove(id);
  }
}
