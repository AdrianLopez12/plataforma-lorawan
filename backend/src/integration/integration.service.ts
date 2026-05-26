import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration } from './integration.entity';
import * as crypto from 'crypto';

@Injectable()
export class IntegrationService {
  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
  ) {}

  private getPresetTemplate(preset: string): string {
    switch (preset) {
      case 'water-meter':
        return `// Decodificador de Medidor de Agua (fPort = 1)
function decode(bytes, port) {
  if (port === 1) {
    const flow = ((bytes[0] << 8) | bytes[1]) / 100;
    const level = ((bytes[2] << 8) | bytes[3]) / 10;
    const alerts = bytes[4] || 0;
    const alertLeak = (alerts & 0x01) !== 0;
    const alertOverflow = (alerts & 0x02) !== 0;
    return {
      flow: Number(flow.toFixed(2)),
      level: Number(level.toFixed(1)),
      alertLeak,
      alertOverflow,
      battery: 98
    };
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`;

      case 'smart-bin':
        return `// Decodificador de Contenedor de Basura (SmartBin, fPort = 2)
function decode(bytes, port) {
  if (port === 2) {
    const fillLevel = bytes[0];
    let temperature = bytes[1];
    if (temperature > 127) temperature -= 256;
    const battery = bytes[2];
    return {
      fillLevel,
      temperature,
      battery,
      alertCritical: fillLevel >= 80
    };
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`;

      case 'tektelic-room':
        return `// Decodificador de Sensor de Ambiente Tektelic (fPort = 10)
function decode(bytes, port) {
  if (port === 10) {
    const result = {};
    let i = 0;
    while (i < bytes.length) {
      const channel = bytes[i++];
      const type = bytes[i++];
      if (channel === 0x03 && type === 0x67) {
        let temp = (bytes[i++] << 8) | bytes[i++];
        if (temp > 0x7FFF) temp -= 0x10000;
        result.temperature = Number((temp / 10).toFixed(1));
      } else if (channel === 0x04 && type === 0x68) {
        result.humidity = Number((bytes[i++] / 2).toFixed(1));
      } else if (channel === 0x05 && type === 0x00) {
        result.presence = bytes[i++] === 0xFF;
      } else {
        break;
      }
    }
    return result;
  }
  return { error: "Puerto no soportado para este dispositivo" };
}`;

      default:
        return `// Decodificador LoRaWAN Genérico
function decode(bytes, port) {
  // Retorna bytes en Hex
  return {
    hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(''),
    port: port
  };
}`;
    }
  }

  async create(data: { name: string; description?: string; preset?: string; organizationId?: string }): Promise<Integration> {
    const secret = 'sec_' + crypto.randomBytes(18).toString('hex');
    const decoderCode = this.getPresetTemplate(data.preset || 'generic');

    const integration = this.integrationRepo.create({
      name: data.name,
      description: data.description,
      secret,
      decoderCode,
      organizationId: data.organizationId || undefined,
    });

    return this.integrationRepo.save(integration);
  }

  async findAll(): Promise<Integration[]> {
    return this.integrationRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Integration> {
    const integration = await this.integrationRepo.findOne({ where: { id } });
    if (!integration) {
      throw new NotFoundException(`Integración con ID ${id} no encontrada`);
    }
    return integration;
  }

  async update(id: string, data: Partial<Integration>): Promise<Integration> {
    const integration = await this.findOne(id);
    Object.assign(integration, data);
    return this.integrationRepo.save(integration);
  }

  async remove(id: string): Promise<void> {
    const integration = await this.findOne(id);
    await this.integrationRepo.remove(integration);
  }
}
