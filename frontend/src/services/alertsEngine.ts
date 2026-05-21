import type { Alert, AlertRule, TelemetryRecord, DeviceGroup, Device } from '../types';

const STORAGE_KEYS = {
  RULES: 'alert_rules',
  ALERTS: 'device_alerts',
  GROUPS: 'device_groups'
};

// Reglas iniciales por defecto para demostración
const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'rule-flow-critical',
    name: 'Caudal Alto Crítico',
    applyToAll: true,
    deviceType: 'water_meter',
    metricKey: 'flow',
    operator: '>',
    thresholdValue: 80,
    severity: 'critical',
    messageTemplate: '¡Fuga Crítica! Caudal de {deviceName} alcanzó {value} L/h (Límite: 80 L/h)',
    active: true,
    organizationId: 'org1',
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule-level-warning',
    name: 'Nivel de Agua Crítico',
    applyToAll: true,
    deviceType: 'water_meter',
    metricKey: 'level',
    operator: '<=',
    thresholdValue: 15,
    severity: 'warning',
    messageTemplate: 'Advertencia: Nivel de agua bajo en {deviceName} es {value} cm (Límite: 15 cm)',
    active: true,
    organizationId: 'org1',
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule-bin-full',
    name: 'Contenedor Lleno',
    applyToAll: true,
    deviceType: 'smartbin',
    metricKey: 'fillLevel',
    operator: '>=',
    thresholdValue: 85,
    severity: 'critical',
    messageTemplate: 'Crítico: El contenedor {deviceName} está lleno ({value}%)',
    active: true,
    organizationId: 'org1',
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule-battery-low',
    name: 'Batería Crítica General',
    applyToAll: true,
    deviceType: 'water_meter',
    metricKey: 'battery',
    operator: '<',
    thresholdValue: 20,
    severity: 'warning',
    messageTemplate: 'Batería baja en medidor {deviceName}: {value}% restante',
    active: true,
    organizationId: 'org1',
    createdAt: new Date().toISOString()
  }
];

export function getAlertRules(organizationId?: string): AlertRule[] {
  const saved = localStorage.getItem(STORAGE_KEYS.RULES);
  let rules: AlertRule[] = saved ? JSON.parse(saved) : [];
  
  if (rules.length === 0) {
    localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(DEFAULT_RULES));
    rules = DEFAULT_RULES;
  }
  
  if (organizationId) {
    return rules.filter(r => r.organizationId === organizationId);
  }
  return rules;
}

export function saveAlertRules(rules: AlertRule[]): void {
  localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules));
}

export function getAlerts(organizationId?: string): Alert[] {
  const saved = localStorage.getItem(STORAGE_KEYS.ALERTS);
  const alerts: Alert[] = saved ? JSON.parse(saved) : [];
  
  if (organizationId) {
    // Para filtrar las alertas en base a los mapeos de inquilino de cada dispositivo
    const mappingsStr = localStorage.getItem('device_organization_mappings') || '{}';
    const mappings = JSON.parse(mappingsStr);
    
    return alerts.filter(a => {
      const deviceOrg = mappings[a.devEUI] || 'org1';
      return deviceOrg === organizationId;
    });
  }
  return alerts;
}

export function saveAlerts(alerts: Alert[]): void {
  localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
}

/**
 * Evalúa las reglas de alertas contra una telemetría dada.
 * Si se dispara una regla y no hay alertas duplicadas para esa hora/trama,
 * crea la alerta, la almacena y la retorna.
 */
export function evaluateTelemetry(
  device: Device,
  record: TelemetryRecord,
  organizationId: string
): Alert | null {
  if (!record || !record.decodedPayload) return null;

  const rules = getAlertRules(organizationId).filter(r => r.active);
  const payload = record.decodedPayload as Record<string, any>;
  
  // Cargar grupos para ver si el dispositivo es integrante de alguno
  const savedGroups = localStorage.getItem(STORAGE_KEYS.GROUPS);
  const groups: DeviceGroup[] = savedGroups ? JSON.parse(savedGroups) : [];

  for (const rule of rules) {
    // 1. Validar si la regla aplica a este dispositivo
    let matchesDevice = false;

    if (rule.applyToAll && rule.deviceType === device.deviceType) {
      matchesDevice = true;
    } else if (rule.deviceEUI === device.devEUI) {
      matchesDevice = true;
    } else if (rule.deviceGroupId) {
      const group = groups.find(g => g.id === rule.deviceGroupId);
      if (group && group.deviceEUIs.includes(device.devEUI)) {
        matchesDevice = true;
      }
    }

    if (!matchesDevice) continue;

    // 2. Extraer el valor de la métrica y verificar si existe
    const metricValue = payload[rule.metricKey];
    if (metricValue === undefined || metricValue === null || typeof metricValue !== 'number') {
      continue;
    }

    // 3. Evaluar la condición
    let triggered = false;
    switch (rule.operator) {
      case '<':
        triggered = metricValue < rule.thresholdValue;
        break;
      case '>':
        triggered = metricValue > rule.thresholdValue;
        break;
      case '<=':
        triggered = metricValue <= rule.thresholdValue;
        break;
      case '>=':
        triggered = metricValue >= rule.thresholdValue;
        break;
      case '==':
        triggered = metricValue === rule.thresholdValue;
        break;
    }

    if (triggered) {
      // Evitar alertas duplicadas para el mismo dispositivo, métrica y marca de tiempo
      const alerts = getAlerts();
      const isDuplicate = alerts.some(a => 
        a.devEUI === device.devEUI && 
        a.createdAt === record.receivedAt &&
        a.message.includes(rule.name)
      );

      if (isDuplicate) continue;

      // 4. Crear la alerta reemplazando los placeholders en la plantilla
      let customMessage = rule.messageTemplate;
      customMessage = customMessage.replace(/{deviceName}/g, device.name);
      customMessage = customMessage.replace(/{value}/g, String(metricValue));
      customMessage = customMessage.replace(/{metric}/g, rule.metricKey);

      // Si no se reemplazó el nombre, añadir contexto básico de la regla
      if (!customMessage.includes(device.name)) {
        customMessage = `${rule.name}: ${device.name} reporta ${metricValue} en ${rule.metricKey}.`;
      }

      // Mapear tipos de alerta compatibles con la UI (leak | overflow | frost | tamper | bin_full | offline | battery)
      let alertType: Alert['type'] = 'info' as any;
      if (rule.metricKey === 'flow') alertType = 'leak';
      else if (rule.metricKey === 'level') alertType = 'overflow';
      else if (rule.metricKey === 'fillLevel') alertType = 'bin_full';
      else if (rule.metricKey === 'battery') alertType = 'battery';

      const newAlert: Alert = {
        id: 'alt-' + Math.random().toString(36).substr(2, 9),
        devEUI: device.devEUI,
        deviceName: device.name,
        type: alertType,
        message: customMessage,
        severity: rule.severity,
        acknowledged: false,
        createdAt: record.receivedAt || new Date().toISOString()
      };

      // Guardar y retornar la alerta
      const updatedAlerts = [newAlert, ...alerts];
      saveAlerts(updatedAlerts);
      
      return newAlert;
    }
  }

  return null;
}
