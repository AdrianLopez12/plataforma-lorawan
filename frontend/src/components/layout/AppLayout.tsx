import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { Menu, Zap, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AppLayout() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const location = useLocation();

  // Close sidebar drawer automatically on route navigation on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  if (!user) return <Navigate to="/login" replace />;

  const toggleSidebar = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    localStorage.setItem('sidebar-collapsed', String(nextState));
  };

  return (
    <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Dynamic blurred dark glass backdrop overlay for mobile view */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Premium responsive Mobile Top Bar (only displayed on screens < 768px via CSS) */}
      <header className="mobile-header">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px'
          }}
          title="Abrir menú"
        >
          <Menu size={24} />
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.015em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={16} style={{ color: 'var(--teal)', fill: 'var(--teal-bg)' }} /> LoRaWAN AS
        </span>
        <div style={{ width: 40 }} /> {/* Horizontal balancer spacing */}
      </header>

      {/* Premium Desktop Sidebar Collapse Toggle Handle */}
      <button 
        onClick={toggleSidebar}
        className="sidebar-toggle-handle"
        title={isSidebarCollapsed ? "Mostrar menú de navegación" : "Contraer menú de navegación"}
      >
        {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Sidebar passing mobile state toggles */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
