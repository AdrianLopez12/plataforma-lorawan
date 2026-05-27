import { Injectable, Logger } from '@nestjs/common';
import { TelemetryService } from '../telemetry/telemetry.service';
import { DevicesService } from '../devices/devices.service';
import { AuditLogService } from '../common/audit-log.service';
import { RuleChain } from './rule-chain.entity';

@Injectable()
export class RuleEngineExecutorService {
  private readonly logger = new Logger(RuleEngineExecutorService.name);

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly devicesService: DevicesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(ruleChain: RuleChain, initialPayload: any, device: any) {
    const graph = ruleChain.graph;
    if (!graph || !graph.nodes || !graph.edges) {
      this.logger.warn(`La cadena de reglas ${ruleChain.id} no posee una estructura de grafo válida.`);
      return;
    }

    // Encontrar el nodo de entrada (Input Node)
    const inputNode = graph.nodes.find((n: any) => n.type === 'input' || n.type === 'inputNode');
    if (!inputNode) {
      this.logger.warn(`La cadena de reglas ${ruleChain.id} no posee un nodo de entrada 'input'.`);
      return;
    }

    // Comenzar la ejecución asíncrona desde el nodo de entrada
    setImmediate(async () => {
      await this.executeNode(inputNode.id, initialPayload, device, graph);
    });
  }

  private async executeNode(nodeId: string, payload: any, device: any, graph: any) {
    const node = graph.nodes.find((n: any) => n.id === nodeId);
    if (!node) return;

    this.logger.log(`Ejecutando Nodo de Regla: ${node.id} (${node.type || 'unknown'})`);

    let outputPayload = { ...payload };
    let routingLabel: 'Success' | 'True' | 'False' | 'Other' | 'Inside' | 'Outside' | null = null;

    try {
      switch (node.type) {
        case 'input':
        case 'inputNode':
          routingLabel = 'Success';
          break;

        case 'filter':
        case 'filterNode':
          const expr = node.data?.expression || 'true';
          const match = this.evalExpression(expr, outputPayload, device);
          routingLabel = match ? 'True' : 'False';
          break;

        case 'saveTelemetry':
        case 'saveTimeseries':
          if (outputPayload) {
            await this.telemetryService.saveUplink({
              devEUI: device.devEUI,
              fPort: payload.fPort || 2,
              fCnt: payload.fCnt || 1,
              rssi: payload.rssi || -80,
              snr: payload.snr || 8,
              spreadingFactor: payload.spreadingFactor || 7,
              rawPayload: payload.rawPayload || '',
              decodedPayload: outputPayload,
              receivedAt: new Date().toISOString(),
            });
          }
          routingLabel = 'Success';
          break;

        case 'saveAttributes':
          if (node.data?.attributes && typeof node.data.attributes === 'object') {
            await this.devicesService.update(device.devEUI, node.data.attributes);
          }
          routingLabel = 'Success';
          break;

        case 'email':
        case 'sendEmail':
          const to = node.data?.to || 'admin@rival.com';
          const subject = node.data?.subject || 'Alerta IoT LoRaWAN';
          const body = node.data?.body || 'Se ha detectado un evento de telemetría fuera de rango.';
          
          this.logger.log(`[SIMULACIÓN SMTP] Correo enviado a: ${to} | Asunto: ${subject} | Cuerpo: ${body}`);
          
          await this.auditLogService.record(
            'RULE_CHAIN_NOTIFICATION',
            { name: 'Rule Engine', email: 'system@lorawan.com', role: 'superadmin' } as any,
            { node: node.id, to, subject, devEUI: device.devEUI },
            '127.0.0.1',
            device.organizationId
          );
          routingLabel = 'Success';
          break;

        case 'webhook':
        case 'restCall':
          const url = node.data?.url || 'http://localhost/mock-webhook';
          this.logger.log(`[REST CALL Webhook] Despachando a: ${url} con payload: ${JSON.stringify(outputPayload)}`);
          routingLabel = 'Success';
          break;

        case 'rpc':
        case 'rpcCall':
          const cmd = node.data?.command || 'close';
          const isOpening = cmd === 'open';
          await this.devicesService.update(device.devEUI, { valveOpen: isOpening });
          
          await this.auditLogService.record(
            isOpening ? 'VALVE_OPEN' : 'VALVE_CLOSE',
            { name: 'Rule Engine', email: 'system@lorawan.com', role: 'superadmin' } as any,
            { devEUI: device.devEUI, trigger: 'RuleChain Node: ' + node.id },
            '127.0.0.1',
            device.organizationId
          );
          routingLabel = 'Success';
          break;

        case 'timeRange':
        case 'timeFilter':
          const startStr = node.data?.startTime || '22:00';
          const endStr = node.data?.endTime || '06:00';
          
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentTimeNum = currentHour * 60 + currentMinute;

          const [startHour, startMin] = startStr.split(':').map(Number);
          const [endHour, endMin] = endStr.split(':').map(Number);
          const startTimeNum = startHour * 60 + startMin;
          const endTimeNum = endHour * 60 + endMin;

          let isInside = false;
          if (startTimeNum <= endTimeNum) {
            isInside = currentTimeNum >= startTimeNum && currentTimeNum <= endTimeNum;
          } else {
            isInside = currentTimeNum >= startTimeNum || currentTimeNum <= endTimeNum;
          }
          routingLabel = isInside ? 'Inside' : 'Outside';
          break;

        case 'geofence':
        case 'gpsFilter':
          const centerLat = Number(node.data?.latitude ?? -0.1807);
          const centerLng = Number(node.data?.longitude ?? -78.4678);
          const maxRadius = Number(node.data?.radius ?? 5000);

          const devLat = outputPayload.lat ?? device.lat;
          const devLng = outputPayload.lng ?? device.lng;

          let isInsideGeofence = false;
          if (devLat !== undefined && devLng !== undefined && devLat !== null && devLng !== null) {
            const distance = this.getDistance(centerLat, centerLng, Number(devLat), Number(devLng));
            isInsideGeofence = distance <= maxRadius;
          }
          routingLabel = isInsideGeofence ? 'Inside' : 'Outside';
          break;

        case 'createAlert':
        case 'sysAlert':
          const alertType = node.data?.alertType || 'leak';
          const msg = node.data?.message || 'Alerta disparada por el motor de reglas visual';
          const severity = node.data?.severity || 'critical';

          this.logger.log(`[ALERTA SISTEMA] Tipo: ${alertType} | Severidad: ${severity} | Mensaje: ${msg}`);

          await this.auditLogService.record(
            'ALERT_GENERATED',
            { name: 'Rule Engine', email: 'system@lorawan.com', role: 'superadmin' } as any,
            { alertType, severity, message: msg, devEUI: device.devEUI },
            '127.0.0.1',
            device.organizationId
          );
          routingLabel = 'Success';
          break;

        default:
          this.logger.warn(`Tipo de nodo no manejado: ${node.type}`);
          routingLabel = 'Success';
          break;
      }
    } catch (err) {
      this.logger.error(`Error ejecutando nodo ${node.id}: ${err.message}`, err.stack);
      return; 
    }

    // Encontrar conexiones salientes
    const outgoingEdges = graph.edges.filter((e: any) => e.source === nodeId);

    for (const edge of outgoingEdges) {
      const edgeLabel = edge.label || edge.sourceHandle;
      
      // Enrutado condicional: si no hay etiqueta (ej. conexión directa de Save), o si la etiqueta coincide con el resultado
      if (!edgeLabel || edgeLabel === routingLabel || routingLabel === 'Success') {
        setImmediate(async () => {
          await this.executeNode(edge.target, outputPayload, device, graph);
        });
      }
    }
  }

  private evalExpression(expression: string, payload: any, device: any): boolean {
    try {
      const context = {
        payload,
        device,
        ...payload,
        ...device
      };
      
      const func = new Function(...Object.keys(context), `return ${expression};`);
      return func(...Object.values(context));
    } catch (e) {
      this.logger.warn(`Error al evaluar la expresión: "${expression}". Detalle: ${e.message}`);
      return false;
    }
  }

  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // en metros
  }
}
