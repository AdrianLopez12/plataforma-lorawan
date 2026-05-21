import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { Menu } from 'lucide-react';

export default function AppLayout() {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar drawer automatically on route navigation on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-layout">
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
          <span style={{ color: 'var(--teal)' }}>⚡</span> LoRaWAN AS
        </span>
        <div style={{ width: 40 }} /> {/* Horizontal balancer spacing */}
      </header>

      {/* Sidebar passing mobile state toggles */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
