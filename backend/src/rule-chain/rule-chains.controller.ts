import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RuleChainService } from './rule-chain.service';
import { RuleChain } from './rule-chain.entity';

@Controller('rule-chains')
@UseGuards(AuthGuard('jwt'))
export class RuleChainsController {
  constructor(private readonly ruleChainService: RuleChainService) {}

  @Get()
  async findAll(@Req() req: any): Promise<RuleChain[]> {
    const orgId = req.user.role === 'superadmin' ? undefined : req.user.organizationId;
    return this.ruleChainService.findAll(orgId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<RuleChain> {
    const chain = await this.ruleChainService.findOne(id);
    if (!chain) {
      throw new NotFoundException(`Cadena de reglas ${id} no encontrada.`);
    }
    return chain;
  }

  @Post()
  async create(
    @Body() data: Partial<RuleChain>,
    @Req() req: any,
  ): Promise<RuleChain> {
    const orgId = req.user.role === 'superadmin' ? data.organizationId : req.user.organizationId;
    return this.ruleChainService.create(data, orgId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Partial<RuleChain>,
  ): Promise<RuleChain> {
    const chain = await this.ruleChainService.update(id, data);
    if (!chain) {
      throw new NotFoundException(`Cadena de reglas ${id} no encontrada.`);
    }
    return chain;
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.ruleChainService.delete(id);
    if (!success) {
      throw new NotFoundException(`Cadena de reglas ${id} no encontrada.`);
    }
    return { success };
  }
}
