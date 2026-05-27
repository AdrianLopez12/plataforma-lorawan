import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryRecord } from './telemetry.entity';
import { DecoderService } from './decoder.service';
import { DevicesService } from '../devices/devices.service';
import { RealtimeService } from './realtime.service';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(TelemetryRecord)
    private readonly telemetryRepo: Repository<TelemetryRecord>,
    private readonly decoder: DecoderService,
    private readonly devicesService: DevicesService,
    private readonly realtimeService: RealtimeService,
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
  /**
   * Decodifica un uplink recibido desde Tektelic KORE y busca/crea el dispositivo asociado.
   */
  async decodeUplink(payload: any, integrationId?: string, decoderCode?: string): Promise<{ device: any; decodedPayload: any }> {
    const device = await this.devicesService.findOrCreate(payload.devEUI, integrationId);
    const activeDecoder = device.codecJs || decoderCode;
    const decodedPayload = payload.data
      ? this.decoder.decode(payload.data, payload.fPort, activeDecoder)
      : null;
    return { device, decodedPayload };
  }

  /**
   * Guarda un uplink con su carga útil ya decodificada en la base de datos de telemetría.
   */
  async saveUplinkWithDecoded(
    payload: any,
    device: any,
    decodedPayload: any,
    integrationId?: string,
  ): Promise<TelemetryRecord> {
    const rxInfo = payload.rxInfo?.[0] ?? {};
    const spreadingFactor =
      payload.txInfo?.dataRate?.spreadFactor ??
      payload.txInfo?.dataRate?.spreadingFactor ??
      null;

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
      `Guardado (Con Desvío): devEUI=${saved.devEUI} fPort=${saved.fPort} integrationId=${integrationId} decoded=${JSON.stringify(decodedPayload)}`,
    );

    // Emitir el evento de telemetría en tiempo real por SSE
    this.realtimeService.emitTelemetry({
      devEUI: saved.devEUI,
      name: device.name || `Dispositivo ${saved.devEUI.substring(0, 6)}`,
      lastTelemetry: saved,
    });

    return saved;
  }

  /**
   * Procesa un uplink recibido desde Tektelic KORE (Flujo directo tradicional).
   */
  async saveUplink(payload: any, integrationId?: string, decoderCode?: string): Promise<TelemetryRecord> {
    const { device, decodedPayload } = await this.decodeUplink(payload, integrationId, decoderCode);
    return this.saveUplinkWithDecoded(payload, device, decodedPayload, integrationId);
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
