import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './device.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
  ) {}

  async findOrCreate(devEUI: string, integrationId?: string): Promise<Device> {
    let device = await this.deviceRepo.findOne({ where: { devEUI } });
    if (!device) {
      device = this.deviceRepo.create({ devEUI, integrationId });
      await this.deviceRepo.save(device);
    } else if (integrationId && !device.integrationId) {
      device.integrationId = integrationId;
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
