import { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Info, X } from 'lucide-react';
import type { Alert } from '../../types';

export interface ToastMessage extends Alert {
  id: string;
}

export default function RealtimeToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleNewAlert = (e: Event) => {
      const customEvent = e as CustomEvent<Alert>;
      const newAlert = customEvent.detail;
      
      if (!newAlert) return;

      // Generar un ID si no viene
      const toastId = newAlert.id || 'toast-' + Math.random().toString(36).substr(2, 9);
      const toast: ToastMessage = { ...newAlert, id: toastId };

      // Agregar a la cola de toasts
      setToasts((prev) => [...prev, toast]);

      // Remover automáticamente en 6 segundos
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, 6000);
    };

    window.addEventListener('realtime-alert-received', handleNewAlert);
    return () => {
      window.removeEventListener('realtime-alert-received', handleNewAlert);
    };
  }, []);

  const closeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const isCritical = toast.severity === 'critical';
        const isWarning = toast.severity === 'warning';
        
        let severityClass = 'toast-info';
        let Icon = Info;
        let severityLabel = 'Información';

        if (isCritical) {
          severityClass = 'toast-critical';
          Icon = ShieldAlert;
          severityLabel = 'Alerta Crítica';
        } else if (isWarning) {
          severityClass = 'toast-warning';
          Icon = AlertTriangle;
          severityLabel = 'Advertencia';
        }

        return (
          <div key={toast.id} className={`toast-card ${severityClass}`}>
            <div className="toast-indicator" />
            <div className="toast-icon-wrapper">
              <Icon size={20} />
            </div>
            <div className="toast-content">
              <div className="toast-header">
                <span className="toast-title">{toast.deviceName}</span>
                <span className="toast-tag">{severityLabel}</span>
              </div>
              <p className="toast-message">{toast.message}</p>
              <span className="toast-time">
                {new Date(toast.createdAt || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <button className="toast-close" onClick={() => closeToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
