import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyRound, ShieldCheck, AlertCircle, RefreshCw, UserCheck } from 'lucide-react';

export default function SettingsPage() {
  const { user, changeOwnPassword } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Las nuevas contraseñas no coinciden.');
      return;
    }
    
    setLoading(true);
    try {
      const ok = await changeOwnPassword(currentPassword, newPassword);
      if (ok) {
        setSuccess('¡Contraseña cambiada con éxito!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError('La contraseña actual es incorrecta.');
      }
    } catch (err) {
      setError('Ocurrió un error inesperado. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Configuración</h2>
          <p className="page-subtitle">Gestiona tu perfil de cuenta y seguridad del sistema</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Card: Perfil */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ marginBottom: 4 }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCheck size={16} className="text-teal-500" /> Mi Perfil
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="form-label" style={{ marginBottom: 2 }}>Nombre</div>
              <div style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                {user?.name}
              </div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: 2 }}>Correo electrónico</div>
              <div style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', color: 'var(--color-muted)' }}>
                {user?.email}
              </div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom: 4 }}>Rol asignado</div>
              <span className={`role-badge ${
                user?.role === 'superadmin' ? 'bg-purple-100 text-purple-800' :
                user?.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
              }`}>
                {user?.role === 'superadmin' ? 'Super Administrador' : user?.role === 'admin' ? 'Administrador' : 'Operador'}
              </span>
            </div>
          </div>
        </div>

        {/* Card: Seguridad (Cambiar contraseña) */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={16} className="text-teal-500" /> Seguridad de la Cuenta
            </h3>
          </div>

          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contraseña actual</label>
              <input
                type="password"
                className="form-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nueva contraseña</label>
              <input
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Confirmar nueva contraseña</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--red-bg)', color: 'var(--red)', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--teal-bg)', color: 'var(--teal-dark)', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                <span>{success}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, height: 38 }}
              disabled={loading}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3 className="card-title">Webhook de Integración Tektelic KORE</h3></div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--color-bg)', padding: '12px 16px', borderRadius: 8, color: 'var(--color-muted)' }}>
          POST http://TU_IP:3000/webhook/uplink<br />
          Authorization: Bearer &lt;TEKTELIC_WEBHOOK_SECRET&gt;
        </div>
      </div>
    </div>
  );
}
