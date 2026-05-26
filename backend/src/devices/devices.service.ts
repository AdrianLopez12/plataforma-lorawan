import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Device } from './device.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    private readonly entityManager: EntityManager,
  ) {}

  async findOrCreate(devEUI: string, integrationId?: string): Promise<Device> {
    let device = await this.deviceRepo.findOne({ where: { devEUI } });
    if (!device) {
      if (!integrationId) {
        throw new Error(`No se puede crear el dispositivo ${devEUI} sin una integración asociada.`);
      }

      let orgId: string | undefined = undefined;
      try {
        const integration = await this.entityManager.findOne('Integration', { where: { id: integrationId } });
        if (integration && (integration as any).organizationId) {
          orgId = (integration as any).organizationId;
        }
      } catch (e) {
        console.warn('Error al buscar integración para heredar organizationId:', e);
      }

      device = this.deviceRepo.create({ 
        devEUI, 
        integrationId, 
        organizationId: orgId 
      });
      await this.deviceRepo.save(device);
    } else if (integrationId && !device.integrationId) {
      device.integrationId = integrationId;
      
      try {
        const integration = await this.entityManager.findOne('Integration', { where: { id: integrationId } });
        if (integration && (integration as any).organizationId) {
          device.organizationId = (integration as any).organizationId;
        }
      } catch (e) {}

      await this.deviceRepo.save(device);
    }
    return device;
  }

  async findAll(integrationId?: string): Promise<Device[]> {
    if (integrationId) {
      return this.deviceRepo.find({
        where: { integrationId },
        order: { createdAt: 'DESC' },
      });
    }
    return this.deviceRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(devEUI: string): Promise<Device | null> {
    return this.deviceRepo.findOne({ where: { devEUI } });
  }

  async update(devEUI: string, data: Partial<Device>): Promise<Device | null> {
    await this.deviceRepo.update({ devEUI }, data);
    return this.findOne(devEUI);
  }
}
