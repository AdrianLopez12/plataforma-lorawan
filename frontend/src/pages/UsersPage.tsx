import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Plus, Search, Edit2, Trash2, KeyRound, 
  Mail, X, ShieldCheck, RefreshCw, 
  Send, Server, CheckCircle, Copy 
} from 'lucide-react';
import type { User, Role } from '../types';

export default function UsersPage() {
  const { users, addUser, updateUser, deleteUser, changeUserPassword, clients, user: activeSessionUser } = useAuth();
  
  const [search, setSearch] = useState('');
  
  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form Fields
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<Role>('operator');
  const [userOrgId, setUserOrgId] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Estados de la simulación SMTP
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [smtpStep, setSmtpStep] = useState(0); // 0: connecting, 1: authenticating, 2: sending, 3: success
  const [generatedCreds, setGeneratedCreds] = useState({ email: '', pass: '', name: '' });
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const visibleClients = clients.filter((c) => {
    if (activeSessionUser?.role === 'superadmin') return true;
    return c.id === activeSessionUser?.organizationId || c.parentId === activeSessionUser?.organizationId;
  });
  const visibleClientIds = visibleClients.map(c => c.id);

  // Rellenar automáticamente la primera organización si está vacía
  useEffect(() => {
    if (visibleClients.length > 0 && !userOrgId) {
      setUserOrgId(visibleClients[0].id);
    }
  }, [visibleClients]);

  const handleCreateClick = () => {
    setUserName('');
    setUserEmail('');
    setUserRole('operator');
    if (visibleClients.length > 0) setUserOrgId(visibleClients[0].id);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) return;

    // Autogenerar una contraseña aleatoria de 8 caracteres
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@';
    let autoPass = '';
    for (let i = 0; i < 8; i++) {
      autoPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Agregar usuario mediante AuthContext
    const newU = addUser(userName, userEmail, userRole, userOrgId, autoPass);

    // Preparar credenciales generadas para el modal SMTP
    setGeneratedCreds({
      email: newU.email,
      pass: autoPass,
      name: newU.name
    });

    // Cerrar modal de creación e iniciar animación SMTP
    setShowCreateModal(false);
    setSmtpStep(0);
    setShowSmtpModal(true);
  };

  // Simulación de los pasos SMTP
  useEffect(() => {
    if (!showSmtpModal) return;

    const timers = [
      setTimeout(() => setSmtpStep(1), 1000), // conexión
      setTimeout(() => setSmtpStep(2), 2200), // autenticación
      setTimeout(() => setSmtpStep(3), 3600)  // envío completado
    ];

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [showSmtpModal]);

  const handleEditClick = (u: User) => {
    setSelectedUser(u);
    setUserName(u.name);
    setUserEmail(u.email);
    setUserRole(u.role);
    setUserOrgId(u.organizationId || (visibleClients.length > 0 ? visibleClients[0].id : ''));
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !userName.trim() || !userEmail.trim()) return;

    updateUser(selectedUser.id, {
      name: userName,
      email: userEmail,
      role: userRole,
      organizationId: userRole === 'superadmin' ? undefined : userOrgId
    });

    setSelectedUser(null);
    setShowEditModal(false);
  };

  const handlePasswordClick = (u: User) => {
    setSelectedUser(u);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || newPassword.length < 6) return;

    changeUserPassword(selectedUser.id, newPassword);

    // Cerrar
    setSelectedUser(null);
    setNewPassword('');
    setShowPasswordModal(false);
    alert('Contraseña actualizada con éxito.');
  };

  const handleDeleteClick = (u: User) => {
    if (u.id === activeSessionUser?.id) {
      alert('No puedes eliminarte a ti mismo de la sesión actual.');
      return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${u.name}" (${u.email})?`)) {
      deleteUser(u.id);
    }
  };

  const handleCopyReceipt = () => {
    const text = `Acceso LoRaWAN Platform\nURL: http://localhost:5173/login\nUsuario: ${generatedCreds.email}\nClave: ${generatedCreds.pass}`;
    navigator.clipboard.writeText(text);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  const getClientName = (orgId?: string) => {
    if (!orgId) return 'Plataforma (Global)';
    const found = clients.find(c => c.id === orgId);
    return found ? found.name : 'Cliente Desconocido';
  };

  const visibleUsers = users.filter((u) => {
    if (activeSessionUser?.role === 'superadmin') return true;
    return u.organizationId !== undefined && visibleClientIds.includes(u.organizationId);
  });

  const filteredUsers = visibleUsers.filter((u) => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Gestión de Usuarios</h2>
          <p className="page-subtitle">
            Crea, edita y otorga permisos a los operadores del sistema. Envía accesos simulados al correo.
          </p>
        </div>
        <button 
          onClick={handleCreateClick}
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> Crear Usuario
        </button>
      </div>

      {/* KPIs de Usuarios */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="stat-title">Usuarios Totales</div>
            <div className="stat-value">{visibleUsers.length}</div>
            <div className="stat-subtitle">Cuentas creadas en total</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--purple-bg)', color: 'var(--purple)' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="stat-title">Super Admins</div>
            <div className="stat-value">{visibleUsers.filter(u => u.role === 'superadmin').length}</div>
            <div className="stat-subtitle">Acceso total a la plataforma</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="stat-title">Administradores</div>
            <div className="stat-value">{visibleUsers.filter(u => u.role === 'admin').length}</div>
            <div className="stat-subtitle">Gestores de su organización</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--gray-bg)', color: 'var(--color-muted)' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="stat-title">Operadores</div>
            <div className="stat-value">{visibleUsers.filter(u => u.role === 'operator').length}</div>
            <div className="stat-subtitle">Solo lectura y dashboards</div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div className="search-box" style={{ maxWidth: 350, flex: 1 }}>
          <Search size={15} />
          <input 
            placeholder="Buscar por nombre, correo o rol..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredUsers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-hint)' }}>
            No se encontraron usuarios que coincidan con la búsqueda.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo Electrónico</th>
                <th>Rol</th>
                <th>Cliente Asociado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 550 }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: '50%', 
                        background: u.role === 'superadmin' ? 'var(--purple-bg)' : u.role === 'admin' ? 'var(--blue-bg)' : 'var(--gray-bg)',
                        color: u.role === 'superadmin' ? 'var(--purple-dark)' : u.role === 'admin' ? 'var(--blue-dark)' : 'var(--color-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 'bold'
                      }}>
                        {u.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        {u.name} {u.id === activeSessionUser?.id && <span style={{ fontSize: 10, color: 'var(--teal)', background: 'var(--teal-bg)', padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>Tú</span>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-muted)' }}>
                      {u.email}
                    </span>
                  </td>
                  <td>
                    <span className={`role-badge ${
                      u.role === 'superadmin' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="table-muted">
                    {getClientName(u.organizationId)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => handlePasswordClick(u)}
                        className="ack-btn" 
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
                        title="Cambiar contraseña de usuario"
                      >
                        <KeyRound size={12} />
                      </button>
                      <button 
                        onClick={() => handleEditClick(u)}
                        className="ack-btn" 
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
                        title="Editar usuario"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(u)}
                        className="ack-btn" 
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', color: 'var(--red)', borderColor: 'rgba(163,45,45,0.2)' }}
                        title="Eliminar usuario"
                        disabled={u.id === activeSessionUser?.id}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* DRAWER DESLIZANTE: CREAR USUARIO */}
      {showCreateModal && (
        <div className="slide-over-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={20} className="text-teal-500" /> Registrar Nuevo Usuario
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Añade un nuevo operador o administrador y configura sus privilegios.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
              <div className="drawer-body">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nombre completo *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Correo electrónico *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="juan@empresa.com"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Rol del usuario</label>
                  <select
                    className="form-input"
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as Role)}
                  >
                    <option value="operator">Operador (Visualización)</option>
                    <option value="admin">Administrador (Gestión Inquilino)</option>
                    {activeSessionUser?.role === 'superadmin' && (
                      <option value="superadmin">Super Administrador (Acceso Global)</option>
                    )}
                  </select>
                </div>

                {userRole !== 'superadmin' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Cliente / Inquilino *</label>
                    <select
                      className="form-input"
                      value={userOrgId}
                      onChange={(e) => setUserOrgId(e.target.value)}
                      required
                    >
                      {visibleClients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--teal-bg)', color: 'var(--teal-dark)', padding: '10px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500, lineHeight: 1.4 }}>
                  <Mail size={16} style={{ flexShrink: 0 }} />
                  <span>La contraseña se autogenerará dinámicamente y se despachará en la simulación de correo SMTP para su uso inmediato.</span>
                </div>
              </div>

              <div className="drawer-footer">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                >
                  <Send size={14} /> Registrar y Enviar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE: EDITAR USUARIO */}
      {showEditModal && (
        <div className="slide-over-overlay" onClick={() => { setSelectedUser(null); setShowEditModal(false); }}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={20} className="text-teal-500" /> Editar Perfil de Usuario
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Modifica la información básica o los permisos asociados a esta cuenta.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => { setSelectedUser(null); setShowEditModal(false); }} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
              <div className="drawer-body">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nombre completo *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Correo electrónico *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="juan@empresa.com"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Rol del usuario</label>
                  <select
                    className="form-input"
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as Role)}
                  >
                    <option value="operator">Operador (Visualización)</option>
                    <option value="admin">Administrador (Gestión Inquilino)</option>
                    {activeSessionUser?.role === 'superadmin' && (
                      <option value="superadmin">Super Administrador (Acceso Global)</option>
                    )}
                  </select>
                </div>

                {userRole !== 'superadmin' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Cliente / Inquilino *</label>
                    <select
                      className="form-input"
                      value={userOrgId}
                      onChange={(e) => setUserOrgId(e.target.value)}
                      required
                    >
                      {visibleClients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="drawer-footer">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setSelectedUser(null); setShowEditModal(false); }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE: CAMBIAR CONTRASEÑA */}
      {showPasswordModal && (
        <div className="slide-over-overlay" onClick={() => { setSelectedUser(null); setShowPasswordModal(false); }}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KeyRound size={20} className="text-teal-500" /> Restablecer Contraseña
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Establece una contraseña nueva para el usuario.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => { setSelectedUser(null); setShowPasswordModal(false); }} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
              <div className="drawer-body">
                <div style={{ fontSize: 12, color: 'var(--color-muted)', background: 'var(--color-bg)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  Estás cambiando la contraseña del usuario: <br />
                  <strong>{selectedUser?.name}</strong> (<code>{selectedUser?.email}</code>)
                </div>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nueva contraseña *</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="drawer-footer">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setSelectedUser(null); setShowPasswordModal(false); }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={newPassword.length < 6}
                >
                  Guardar Contraseña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: SIMULADOR DE ENVÍO SMTP DE CREDENCIALES AL CORREO */}
      {showSmtpModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: 16
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', overflow: 'hidden' }}>
            
            {/* Header del Simulador */}
            <div className="card-header" style={{ marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={18} className={smtpStep < 3 ? "text-teal-500 animate-pulse" : "text-teal-500"} />
                <h3 className="card-title" style={{ fontWeight: 650, letterSpacing: '-0.015em' }}>Simulador SMTP de Credenciales</h3>
              </div>
              {smtpStep === 3 && (
                <button 
                  onClick={() => setShowSmtpModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-hint)' }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Cuerpo del Simulador */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Pantalla Consola de logs SMTP */}
              <div style={{ 
                background: '#151515', color: '#10b981', fontFamily: 'monospace', 
                fontSize: 12, padding: 16, borderRadius: 8, minHeight: 140,
                display: 'flex', flexDirection: 'column', gap: 6,
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <div style={{ color: '#888' }}>&gt; Inicializando despacho de credenciales...</div>
                
                {smtpStep >= 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {smtpStep === 0 ? <RefreshCw size={11} className="animate-spin text-teal-400" /> : <span style={{ color: '#34d399' }}>[OK]</span>}
                    <span>Conectando a smtp.lorawan-platform.com:587...</span>
                  </div>
                )}

                {smtpStep >= 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {smtpStep === 1 ? <RefreshCw size={11} className="animate-spin text-teal-400" /> : <span style={{ color: '#34d399' }}>[OK]</span>}
                    <span>Autenticación exitosa (TLS SECURE)...</span>
                  </div>
                )}

                {smtpStep >= 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {smtpStep === 2 ? <RefreshCw size={11} className="animate-spin text-teal-400" /> : <span style={{ color: '#34d399' }}>[OK]</span>}
                    <span>Despachando correo de bienvenida a &lt;{generatedCreds.email}&gt;...</span>
                  </div>
                )}

                {smtpStep >= 3 && (
                  <div style={{ color: '#60a5fa', fontWeight: 'bold', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={13} />
                    <span>[EXITOSO] Mensaje enviado ID: msg_${Math.floor(Math.random()*1000000)}</span>
                  </div>
                )}
              </div>

              {/* Recibo final visual de credenciales */}
              {smtpStep === 3 && (
                <div style={{ 
                  animation: 'fadeIn 0.4s ease-out',
                  background: 'var(--teal-bg)', color: 'var(--teal-dark)',
                  padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10,
                  border: '0.5px solid rgba(29, 158, 117, 0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle size={18} style={{ color: 'var(--teal)' }} />
                    <span style={{ fontWeight: 650, fontSize: 13 }}>¡Credenciales despachadas con éxito!</span>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.9 }}>
                    Hemos simulado el envío de un correo de bienvenida a <strong>{generatedCreds.name}</strong>. Puedes copiar los accesos a continuación para testear e iniciar sesión en una nueva pestaña del navegador:
                  </p>

                  <div style={{ 
                    background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', 
                    borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
                    fontSize: 12
                  }}>
                    <div>
                      <span style={{ color: 'var(--color-hint)', display: 'block', fontSize: 10, textTransform: 'uppercase', fontWeight: 650, letterSpacing: '0.05em' }}>Ruta de acceso</span>
                      <code style={{ fontSize: 11, color: 'var(--color-text)' }}>http://localhost:5173/login</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-hint)', display: 'block', fontSize: 10, textTransform: 'uppercase', fontWeight: 650, letterSpacing: '0.05em' }}>Usuario (Email)</span>
                      <code style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--color-text)' }}>{generatedCreds.email}</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-hint)', display: 'block', fontSize: 10, textTransform: 'uppercase', fontWeight: 650, letterSpacing: '0.05em' }}>Clave Temporal</span>
                      <code style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--teal-dark)', background: 'var(--teal-bg)', padding: '2px 6px', borderRadius: 4 }}>{generatedCreds.pass}</code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button 
                      onClick={handleCopyReceipt}
                      className="ack-btn" 
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: 6, 
                        fontSize: 11, height: 32, background: 'var(--color-surface)',
                        color: 'var(--color-text)', padding: '0 12px'
                      }}
                    >
                      <Copy size={12} />
                      {copiedReceipt ? '¡Copiado!' : 'Copiar credenciales'}
                    </button>
                    <button 
                      onClick={() => setShowSmtpModal(false)}
                      className="btn-primary" 
                      style={{ 
                        fontSize: 11, height: 32, 
                        padding: '0 16px', background: 'var(--teal)',
                        display: 'flex', alignItems: 'center'
                      }}
                    >
                      Finalizar y Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
