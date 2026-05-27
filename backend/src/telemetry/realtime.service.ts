import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly eventStream$ = new Subject<{ type: string; data: any }>();

  /**
   * Emite una telemetría en tiempo real
   */
  emitTelemetry(data: any) {
    this.logger.log(`Emitiendo telemetría en vivo: devEUI=${data.devEUI}`);
    this.eventStream$.next({ type: 'telemetry', data });
  }

  /**
   * Emite una alerta en tiempo real
   */
  emitAlert(data: any) {
    this.logger.log(`Emitiendo alerta en vivo: devEUI=${data.devEUI} severidad=${data.severity}`);
    this.eventStream$.next({ type: 'alert', data });
  }

  /**
   * Obtiene el flujo de eventos
   */
  getStream(): Observable<{ type: string; data: any }> {
    return this.eventStream$.asObservable();
  }
}
