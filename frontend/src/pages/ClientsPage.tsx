import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Building, Plus, Search, Edit2, Trash2, Calendar, 
  Users, Radio, X 
} from 'lucide-react';
import type { Organization } from '../types';

export default function ClientsPage() {
  const { clients, addClient, updateClient, deleteClient, users } = useAuth();
  
  const [search, setSearch] = useState('');
  
  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Organization | null>(null);
  
  // Form Fields
  const [clientName, setClientName] = useState('');
  const [clientDesc, setClientDesc] = useState('');

  // Contador de Dispositivos por Cliente
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Calcular dinámicamente dispositivos mapeados desde el almacenamiento local
    const mappings = JSON.parse(localStorage.getItem('device_organization_mappings') || '{}');
    const counts: Record<string, number> = {};
    
    // Contar también mapeos de dispositivos mock predeterminados si corresponde
    // Inicializar contadores en 0
    clients.forEach((c) => {
      counts[c.id] = 0;
    });

    // Sumar mappings activos
    Object.values(mappings).forEach((orgId: any) => {
      if (counts[orgId] !== undefined) {
        counts[orgId]++;
      } else {
        counts[orgId] = 1;
      }
    });

    // MOCK_DEVICES por defecto: org1 tiene 3 y org2 tiene 1 por defecto
    counts['org1'] = (counts['org1'] || 0) + 3;
    counts['org2'] = (counts['org2'] || 0) + 1;

    setDeviceCounts(counts);
  }, [clients]);

  // Contar usuarios por organización
  const getUserCount = (orgId: string) => {
    return users.filter((u) => u.organizationId === orgId).length;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    
    addClient(clientName, clientDesc);
    
    // Reset & Close
    setClientName('');
    setClientDesc('');
    setShowCreateModal(false);
  };

  const handleEditClick = (client: Organization) => {
    setSelectedClient(client);
    setClientName(client.name);
    setClientDesc(client.description || '');
    setShowEditModal(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !clientName.trim()) return;
    
    updateClient(selectedClient.id, clientName, clientDesc);
    
    // Reset & Close
    setClientName('');
    setClientDesc('');
    setSelectedClient(null);
    setShowEditModal(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`¿Estás completamente seguro de que deseas eliminar al cliente "${name}"?\nEsta acción desasociará a todos sus usuarios y dispositivos.`)) {
      deleteClient(id);
    }
  };

  const filteredClients = clients.filter((c) => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Clientes (Inquilinos)</h2>
          <p className="page-subtitle">
            Administra las cuentas de tus clientes, asigna organizaciones y monitorea su infraestructura.
          </p>
        </div>
        <button 
          onClick={() => {
            setClientName('');
            setClientDesc('');
            setShowCreateModal(true);
          }}
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> Crear Cliente
        </button>
      </div>

      {/* Grid de KPIs */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}>
            <Building size={20} />
          </div>
          <div>
            <div className="stat-title">Clientes registrados</div>
            <div className="stat-value">{clients.length}</div>
            <div className="stat-subtitle">Inquilinos en el sistema</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="stat-title">Usuarios asociados</div>
            <div className="stat-value">
              {users.filter(u => u.role !== 'superadmin').length}
            </div>
            <div className="stat-subtitle">Administradores u Operadores</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <Radio size={20} />
          </div>
          <div>
            <div className="stat-title">Dispositivos cliente</div>
            <div className="stat-value">
              {Object.values(deviceCounts).reduce((a, b) => a + b, 0)}
            </div>
            <div className="stat-subtitle">Mapeados a inquilinos</div>
          </div>
        </div>
      </div>

      {/* Toolbar y Buscador */}
      <div className="toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div className="search-box" style={{ maxWidth: 350, flex: 1 }}>
          <Search size={15} />
          <input 
            placeholder="Buscar inquilino por nombre o descripción..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredClients.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-hint)' }}>
            No se encontraron clientes registrados en el sistema.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Organización</th>
                <th>Descripción</th>
                <th>Usuarios</th>
                <th>Dispositivos</th>
                <th>ID Inquilino</th>
                <th>Fecha Registro</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 550 }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: 8, 
                        background: 'var(--teal-bg)', color: 'var(--teal-dark)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 'bold'
                      }}>
                        {c.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        {c.name}
                      </div>
                    </div>
                  </td>
                  <td className="table-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.description || 'Sin descripción descriptiva'}
                  </td>
                  <td>
                    <span className="role-badge bg-blue-100 text-blue-800" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Users size={10} /> {getUserCount(c.id)} {getUserCount(c.id) === 1 ? 'usuario' : 'usuarios'}
                    </span>
                  </td>
                  <td>
                    <span className="role-badge bg-gray-100 text-gray-700" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Radio size={10} /> {deviceCounts[c.id] || 0} {deviceCounts[c.id] === 1 ? 'dispositivo' : 'dispositivos'}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                      {c.id}
                    </code>
                  </td>
                  <td className="table-muted">
                    <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} />
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-ES') : '21/05/2026'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => handleEditClick(c)}
                        className="ack-btn" 
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
                        title="Editar inquilino"
                      >
                        <Edit2 size={12} />
                      </button>
                      {c.id !== 'org1' && (
                        <button 
                          onClick={() => handleDelete(c.id, c.name)}
                          className="ack-btn" 
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', color: 'var(--red)', borderColor: 'rgba(163,45,45,0.2)' }}
                          title="Eliminar inquilino"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* DRAWER DESLIZANTE: CREAR CLIENTE */}
      {showCreateModal && (
        <div className="slide-over-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building size={20} className="text-teal-500" /> Crear Nuevo Cliente (Tenant)
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Registra un nuevo subcliente para aislar sus usuarios, dispositivos y tableros.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
              <div className="drawer-body">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nombre de la organización *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej. Consorcio de Agua del Sur"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Descripción</label>
                  <textarea
                    className="form-input"
                    style={{ minHeight: 120, resize: 'vertical', padding: '10px 12px' }}
                    value={clientDesc}
                    onChange={(e) => setClientDesc(e.target.value)}
                    placeholder="Escribe detalles breves, ubicación, sector comercial, etc."
                  />
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
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER DESLIZANTE: EDITAR CLIENTE */}
      {showEditModal && (
        <div className="slide-over-overlay" onClick={() => { setSelectedClient(null); setShowEditModal(false); }}>
          <div className="slide-over-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building size={20} className="text-teal-500" /> Editar Cliente (Tenant)
                </h3>
                <p style={{ margin: 0, marginTop: '2px', fontSize: '12px', color: 'var(--color-muted)' }}>
                  Modifica los datos de la organización o su descripción.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => { setSelectedClient(null); setShowEditModal(false); }} style={{ padding: '6px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 75px)' }}>
              <div className="drawer-body">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Nombre de la organización *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej. Consorcio de Agua del Sur"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Descripción</label>
                  <textarea
                    className="form-input"
                    style={{ minHeight: 120, resize: 'vertical', padding: '10px 12px' }}
                    value={clientDesc}
                    onChange={(e) => setClientDesc(e.target.value)}
                    placeholder="Escribe detalles breves, ubicación, sector comercial, etc."
                  />
                </div>
              </div>

              <div className="drawer-footer">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setSelectedClient(null); setShowEditModal(false); }}
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
    </div>
  );
}
