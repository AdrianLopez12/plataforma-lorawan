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
    let routingLabel: 'Success' | 'True' | 'False' | 'Other' | null = null;

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
}
