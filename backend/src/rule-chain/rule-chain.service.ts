import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleChain } from './rule-chain.entity';

@Injectable()
export class RuleChainService {
  constructor(
    @InjectRepository(RuleChain)
    private readonly ruleChainRepo: Repository<RuleChain>,
  ) {}

  async findAll(organizationId?: string): Promise<RuleChain[]> {
    if (organizationId) {
      return this.ruleChainRepo.find({
        where: { organizationId },
        order: { createdAt: 'DESC' },
      });
    }
    return this.ruleChainRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<RuleChain | null> {
    return this.ruleChainRepo.findOne({ where: { id } });
  }

  async findActive(organizationId?: string): Promise<RuleChain | null> {
    if (!organizationId) {
      return this.ruleChainRepo.findOne({ where: { active: true } });
    }
    return this.ruleChainRepo.findOne({
      where: { organizationId, active: true },
    });
  }

  async create(data: Partial<RuleChain>, organizationId?: string): Promise<RuleChain> {
    // Si se activa este nuevo flujo y ya hay otro activo en la misma org, desactivamos los anteriores
    if (data.active && organizationId) {
      await this.ruleChainRepo.update(
        { organizationId, active: true },
        { active: false },
      );
    }

    const ruleChain = this.ruleChainRepo.create({
      ...data,
      organizationId,
    });
    return this.ruleChainRepo.save(ruleChain);
  }

  async update(id: string, data: Partial<RuleChain>): Promise<RuleChain | null> {
    const chain = await this.findOne(id);
    if (!chain) return null;

    if (data.active && chain.organizationId) {
      await this.ruleChainRepo.update(
        { organizationId: chain.organizationId, active: true },
        { active: false },
      );
    }

    await this.ruleChainRepo.update(id, data);
    return this.findOne(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.ruleChainRepo.delete(id);
    return result.affected ? result.affected > 0 : false;
  }
}
