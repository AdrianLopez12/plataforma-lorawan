import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryRecord } from './telemetry.entity';
import { DecoderService } from './decoder.service';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(TelemetryRecord)
    private readonly telemetryRepo: Repository<TelemetryRecord>,
    private readonly decoder: DecoderService,
    private readonly devicesService: DevicesService,
  ) {}

  /**
   * Procesa un uplink recibido desde Tektelic KORE.
   * El formato del payload de Tektelic es:
   * {
   *   "devEUI": "0102030405060708",
   *   "fPort": 1,
   *   "fCnt": 42,
   *   "data": "AQID...",          <- payload base64
   *   "rxInfo": [{ "gatewayId": "...", "rssi": -80, "loRaSNR": 7.5 }],
   *   "txInfo": { "dataRate": { "spreadFactor": 7 } }
   * }
   * Ajusta los campos si tu versión de KORE usa nombres distintos.
   */
  async saveUplink(payload: any, integrationId?: string, decoderCode?: string): Promise<TelemetryRecord> {
    // Registrar el device si es la primera vez que lo vemos
    const device = await this.devicesService.findOrCreate(payload.devEUI, integrationId);

    // Extraer datos de señal del primer gateway
    const rxInfo = payload.rxInfo?.[0] ?? {};
    const spreadingFactor =
      payload.txInfo?.dataRate?.spreadFactor ??
      payload.txInfo?.dataRate?.spreadingFactor ??
      null;

    // Decodificar payload (prioriza el decodificador a nivel de dispositivo si existe)
    const activeDecoder = device.codecJs || decoderCode;
    const decodedPayload = payload.data
      ? this.decoder.decode(payload.data, payload.fPort, activeDecoder)
      : null;

    const record = this.telemetryRepo.create({
      devEUI: payload.devEUI,
      fPort: payload.fPort,
      fCnt: payload.fCnt,
      spreadingFactor,
      rssi: rxInfo.rssi ?? rxInfo.loRaRSSI ?? null,
      snr: rxInfo.loRaSNR ?? rxInfo.snr ?? null,
      rawPayload: payload.data ?? null,
      decodedPayload,
      rawMessage: payload,
      gatewayId: rxInfo.gatewayId ?? rxInfo.mac ?? null,
      integrationId,
    });

    const saved = await this.telemetryRepo.save(record) as TelemetryRecord;
    this.logger.log(
      `Guardado: devEUI=${saved.devEUI} fPort=${saved.fPort} integrationId=${integrationId} decoded=${JSON.stringify(decodedPayload)}`,
    );
    return saved;
  }

  async findByDevice(devEUI: string, limit = 100): Promise<TelemetryRecord[]> {
    return this.telemetryRepo.find({
      where: { devEUI },
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }

  async findLatest(limit = 50, integrationId?: string): Promise<TelemetryRecord[]> {
    if (integrationId) {
      return this.telemetryRepo.find({
        where: { integrationId },
        order: { receivedAt: 'DESC' },
        take: limit,
      });
    }
    return this.telemetryRepo.find({
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }
}
