import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Map, Bell, Settings, LogOut, Radio, Cpu, X, Building, Users, History } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAlerts } from '../../services/alertsEngine';

const baseNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/map', icon: Map, label: 'Mapa' },
  { to: '/alerts', icon: Bell, label: 'Alertas' },
  { to: '/devices', icon: Radio, label: 'Dispositivos' },
  { to: '/integration', icon: Cpu, label: 'Integración LNS' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unacknowledged, setUnacknowledged] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const activeAlerts = getAlerts(user?.role !== 'superadmin' ? user?.organizationId : undefined);
      const count = activeAlerts.filter(a => !a.acknowledged).length;
      setUnacknowledged(count);
    };

    updateCount();

    window.addEventListener('alerts-changed', updateCount);
    window.addEventListener('storage', updateCount);

    return () => {
      window.removeEventListener('alerts-changed', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, [user]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const roleBadge: Record<string, string> = {
    superadmin: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    operator: 'bg-gray-100 text-gray-700',
  };

  const navItems = [...baseNavItems];
  if (user?.role === 'superadmin' || user?.role === 'admin') {
    navItems.push(
      { to: '/clients', icon: Building, label: 'Clientes (Tenants)' },
      { to: '/users', icon: Users, label: 'Usuarios' },
      { to: '/audit', icon: History, label: 'Auditoría' }
    );
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={22} className="text-teal-500" />
            <span style={{ fontWeight: 650, letterSpacing: '-0.02em' }}>LoRaWAN AS</span>
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="mobile-close-btn"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-hint)',
                cursor: 'pointer',
                padding: '4px',
                display: 'none', // Managed by responsive CSS media query
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Cerrar menú"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="sidebar-user" style={{ marginTop: 12 }}>
          <div className="sidebar-user-name">{user?.name}</div>
          <span className={`role-badge ${roleBadge[user?.role ?? 'operator']}`}>
            {user?.role === 'superadmin' ? 'superadmin' : user?.role === 'admin' ? 'admin' : 'operator'}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={18} />
            <span>{label}</span>
            {to === '/alerts' && unacknowledged > 0 && (
              <span className="alert-badge">{unacknowledged}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={18} /><span>Configuración</span>
        </NavLink>
        <button className="nav-item logout-btn" onClick={handleLogout}>
          <LogOut size={18} /><span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
