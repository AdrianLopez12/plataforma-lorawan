import { AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react';
import type { Alert } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface AlertItemProps {
  alert: Alert;
  onAcknowledge?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const severityConfig = {
  critical: { bg: '#FCEBEB', border: '#E24B4A', text: '#791F1F', icon: AlertCircle, iconColor: '#A32D2D' },
  warning:  { bg: '#FAEEDA', border: '#EF9F27', text: '#633806', icon: AlertTriangle, iconColor: '#854F0B' },
  info:     { bg: '#E6F1FB', border: '#378ADD', text: '#0C447C', icon: Info, iconColor: '#185FA5' },
};

export default function AlertItem({ alert, onAcknowledge, onDelete }: AlertItemProps) {
  const severity = alert.severity || 'info';
  const cfg = severityConfig[severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = cfg.icon;

  const dateStr = alert.createdAt || (alert as any).timestamp || new Date().toISOString();
  let timeAgo = 'hace un momento';
  try {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      timeAgo = formatDistanceToNow(parsedDate, { addSuffix: true, locale: es });
    }
  } catch (e) {
    console.warn('Error parsing alert date:', e);
  }

  return (
    <div className="alert-item" style={{ background: cfg.bg, borderLeft: `3px solid ${cfg.border}`, opacity: alert.acknowledged ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'flex-start' }}>
        <Icon size={16} style={{ color: cfg.iconColor, flexShrink: 0, marginTop: 2 }} />
        <div className="alert-content">
          <div className="alert-device" style={{ color: cfg.text, fontWeight: 'bold' }}>{alert.deviceName ?? alert.devEUI}</div>
          <div className="alert-message" style={{ margin: '2px 0', fontSize: 13 }}>{alert.message}</div>
          <div className="alert-time" style={{ fontSize: 11, color: '#666' }}>
            {timeAgo}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {!alert.acknowledged && onAcknowledge && (
          <button 
            className="ack-btn" 
            onClick={() => onAcknowledge(alert.id)}
            style={{
              background: '#1D9E75',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            Atender
          </button>
        )}

        {onDelete && (
          <button 
            onClick={() => onDelete(alert.id)}
            title="Eliminar Alerta"
            style={{
              background: '#FCEBEB',
              color: '#A32D2D',
              border: '1px solid #F3AEAE',
              padding: '6px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
