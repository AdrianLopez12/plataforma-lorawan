import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../devices/device.entity';
import { TelemetryRecord } from '../telemetry/telemetry.entity';
import { AuditLog } from '../common/audit-log.entity';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class ExternalApiService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(TelemetryRecord)
    private readonly telemetryRepo: Repository<TelemetryRecord>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Obtiene todos los dispositivos de una organización
   */
  async findDevicesByOrg(orgId: string): Promise<Device[]> {
    return this.deviceRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Obtiene un dispositivo específico de una organización por su devEUI
   */
  async findDeviceByEUIAndOrg(devEUI: string, orgId: string): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { devEUI } });
    if (!device) {
      throw new NotFoundException(`Dispositivo con DevEUI ${devEUI} no encontrado.`);
    }
    if (device.organizationId !== orgId) {
      throw new ForbiddenException('No tienes permisos para acceder a este dispositivo.');
    }
    return device;
  }

  /**
   * Control remoto bidireccional de válvula (abrir/cerrar)
   */
  async controlValve(devEUI: string, orgId: string, open: boolean): Promise<Device> {
    const device = await this.findDeviceByEUIAndOrg(devEUI, orgId);
    
    device.valveOpen = open;
    const updatedDevice = await this.deviceRepo.save(device);

    // Registrar en auditoría
    await this.auditLogService.record(
      open ? 'VALVE_OPEN' : 'VALVE_CLOSE',
      { name: 'External API Client', email: 'external-api@lorawan.com', role: 'user' } as any,
      { devEUI, trigger: 'External API REST Call' },
      '127.0.0.1',
      orgId
    );

    return updatedDevice;
  }

  /**
   * Obtiene últimas telemetrías de los dispositivos de la organización con paginación
   */
  async findLatestTelemetryByOrg(
    orgId: string,
    limit: number,
    page: number,
    devEUI?: string,
  ): Promise<{ data: TelemetryRecord[]; total: number; page: number; limit: number }> {
    const query = this.telemetryRepo.createQueryBuilder('telemetry')
      .innerJoinAndSelect('telemetry.device', 'device')
      .where('device.organizationId = :orgId', { orgId });

    if (devEUI) {
      // Verificar primero que el dispositivo pertenezca a la organización
      await this.findDeviceByEUIAndOrg(devEUI, orgId);
      query.andWhere('telemetry.devEUI = :devEUI', { devEUI });
    }

    query.orderBy('telemetry.receivedAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Obtiene las alertas (ALERT_GENERATED) asociadas a la organización
   */
  async findAlertsByOrg(orgId: string, limit: number): Promise<any[]> {
    const alerts = await this.auditRepo.find({
      where: { organizationId: orgId, action: 'ALERT_GENERATED' },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    // Formatear la salida para hacerla más amigable para sistemas externos
    return alerts.map(alert => {
      let detailsObj = {};
      try {
        if (alert.details) {
          detailsObj = JSON.parse(alert.details);
        }
      } catch (e) {
        detailsObj = { raw: alert.details };
      }

      return {
        id: alert.id,
        createdAt: alert.createdAt,
        type: (detailsObj as any).alertType || 'unknown',
        severity: (detailsObj as any).severity || 'info',
        message: (detailsObj as any).message || alert.details,
        devEUI: (detailsObj as any).devEUI || null,
      };
    });
  }
}
