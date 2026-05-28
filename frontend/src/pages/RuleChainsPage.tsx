import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRuleChains, createRuleChain, updateRuleChain, deleteRuleChain } from '../services/api';
import type { RuleChain } from '../types';
import { GitFork, Plus, Calendar, ToggleLeft, ToggleRight, Trash2, PlayCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RuleChainsPage() {
  const navigate = useNavigate();
  const { user, clients } = useAuth();
  const [chains, setChains] = useState<RuleChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedFilterOrgId, setSelectedFilterOrgId] = useState('all');

  // Resolver recursivamente todas las organizaciones descendientes (subclientes de subclientes)
  const getDescendantOrgIds = (orgId: string): string[] => {
    const ids: string[] = [orgId];
    const getChildren = (id: string) => {
      const children = clients.filter(c => c.parentId === id);
      children.forEach(child => {
        ids.push(child.id);
        getChildren(child.id);
      });
    };
    getChildren(orgId);
    return ids;
  };

  const visibleOrgIds = user?.role === 'superadmin'
    ? []
    : (user?.organizationId ? getDescendantOrgIds(user.organizationId) : []);

  const visibleClients = clients.filter(c => {
    if (user?.role === 'superadmin') return true;
    return visibleOrgIds.includes(c.id);
  });

  useEffect(() => {
    if (user) {
      setSelectedOrgId(user.organizationId || (visibleClients.length > 0 ? visibleClients[0].id : ''));
    }
  }, [user, clients]);

  const loadChains = () => {
    setLoading(true);
    getRuleChains()
      .then((data) => {
        if (data) setChains(data);
      })
      .catch((err) => {
        console.warn('API error, using fallback rule chains:', err);
        // Fallback premium para simulación e interacción inmediata offline
        const defaultFallback: RuleChain[] = [
          {
            id: 'rc_default',
            name: 'Procesamiento de Agua Principal',
            description: 'Filtra caudales altos, registra en base de datos e inunda válvulas si hay fugas.',
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            graph: {}
          },
          {
            id: 'rc_bins',
            name: 'Flota SmartBins Rival',
            description: 'Enruta telemetría volumétrica y enciende alarmas al superar el 85% de capacidad.',
            active: false,
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
            graph: {}
          }
        ];

        // Cargar flujos simulados guardados por el usuario
        const storedSimulated = localStorage.getItem('simulated_rule_chains');
        let simulated: RuleChain[] = [];
        if (storedSimulated) {
          try {
            simulated = JSON.parse(storedSimulated);
          } catch (e) {
            console.error('Error parsing simulated_rule_chains:', e);
          }
        }

        // Combinar los predeterminados con los del usuario
        const combined = [...simulated];
        defaultFallback.forEach((def) => {
          if (!combined.some(c => c.id === def.id)) {
            combined.push(def);
          }
        });

        setChains(combined);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChains();
  }, [user]);

  const handleToggleActive = (chain: RuleChain) => {
    const nextState = !chain.active;
    updateRuleChain(chain.id, { active: nextState })
      .then(() => {
        loadChains();
      })
      .catch(() => {
        // Fallback de simulación interactiva local
        const storedSimulated = localStorage.getItem('simulated_rule_chains');
        let simulated: RuleChain[] = [];
        if (storedSimulated) {
          try {
            simulated = JSON.parse(storedSimulated);
          } catch (e) {}
        }

        const existingIdx = simulated.findIndex(c => c.id === chain.id);
        if (existingIdx !== -1) {
          simulated[existingIdx].active = nextState;
        } else {
          // Si era una default, la copiamos a simulated para persistir su cambio
          const defaultChains = [
            {
              id: 'rc_default',
              name: 'Procesamiento de Agua Principal',
              description: 'Filtra caudales altos, registra en base de datos e inunda válvulas si hay fugas.',
              active: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              graph: {}
            },
            {
              id: 'rc_bins',
              name: 'Flota SmartBins Rival',
              description: 'Enruta telemetría volumétrica y enciende alarmas al superar el 85% de capacidad.',
              active: false,
              createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
              updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
              graph: {}
            }
          ];
          const matchedDefault = defaultChains.find(c => c.id === chain.id);
          if (matchedDefault) {
            matchedDefault.active = nextState;
            simulated.push(matchedDefault);
          } else {
            simulated.push({ ...chain, active: nextState });
          }
        }

        // Si se activó esta cadena, desactivamos todas las demás
        if (nextState) {
          simulated = simulated.map(c => {
            if (c.id !== chain.id) return { ...c, active: false };
            return c;
          });
        }

        localStorage.setItem('simulated_rule_chains', JSON.stringify(simulated));

        setChains(prev =>
          prev.map(c => {
            if (c.id === chain.id) return { ...c, active: nextState };
            if (nextState) return { ...c, active: false };
            return c;
          })
        );
      });
  };

  const handleDelete = (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta cadena de reglas?')) return;
    deleteRuleChain(id)
      .then(() => {
        loadChains();
      })
      .catch(() => {
        const storedSimulated = localStorage.getItem('simulated_rule_chains');
        if (storedSimulated) {
          try {
            let simulated: RuleChain[] = JSON.parse(storedSimulated);
            simulated = simulated.filter(c => c.id !== id);
            localStorage.setItem('simulated_rule_chains', JSON.stringify(simulated));
          } catch (e) {}
        }
        localStorage.removeItem(`rule_chain_local_${id}`);
        setChains(prev => prev.filter(c => c.id !== id));
      });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);

    // Grafo inicial por defecto (Nodo de entrada e inserción de base de datos)
    const initialGraph = {
      nodes: [
        {
          id: 'input_node',
          type: 'input',
          position: { x: 100, y: 150 },
          data: { label: 'Entrada LoRaWAN' }
        },
        {
          id: 'save_node',
          type: 'saveTelemetry',
          position: { x: 350, y: 150 },
          data: { label: 'Guardar Telemetría' }
        }
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'input_node',
          target: 'save_node',
          animated: true
        }
      ]
    };

    createRuleChain({
      name: newName,
      description: newDesc,
      graph: initialGraph,
      organizationId: selectedOrgId || undefined,
      active: chains.length === 0
    })
      .then((created) => {
        setShowCreateModal(false);
        setNewName('');
        setNewDesc('');
        loadChains();
        navigate(`/rule-chains/designer/${created.id}`);
      })
      .catch((err) => {
        console.warn('API error, simulating creation locally:', err);
        const mockCreated: RuleChain = {
          id: 'rc_' + Math.random().toString(36).substring(2, 9),
          name: newName,
          description: newDesc,
          active: chains.length === 0,
          organizationId: selectedOrgId || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          graph: initialGraph
        };

        const storedSimulated = localStorage.getItem('simulated_rule_chains');
        let simulated: RuleChain[] = [];
        if (storedSimulated) {
          try {
            simulated = JSON.parse(storedSimulated);
          } catch (e) {}
        }

        if (mockCreated.active) {
          simulated = simulated.map(c => ({ ...c, active: false }));
        }

        simulated.unshift(mockCreated);
        localStorage.setItem('simulated_rule_chains', JSON.stringify(simulated));
        localStorage.setItem(`rule_chain_local_${mockCreated.id}`, JSON.stringify(initialGraph));

        setShowCreateModal(false);
        setNewName('');
        setNewDesc('');
        setChains(prev => [mockCreated, ...prev]);
        navigate(`/rule-chains/designer/${mockCreated.id}`);
      })
      .finally(() => setCreating(false));
  };

  const filteredChains = chains.filter(chain => {
    if (user?.role !== 'superadmin') {
      // Un cliente puede ver sus propias reglas y las de todos sus sub-clientes jerárquicos
      if (selectedFilterOrgId !== 'all') {
        return chain.organizationId === selectedFilterOrgId;
      }
      return visibleOrgIds.includes(chain.organizationId || '');
    }
    if (selectedFilterOrgId !== 'all') {
      return chain.organizationId === selectedFilterOrgId;
    }
    return true;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Cadenas de Reglas Visuales</h2>
          <p className="page-subtitle">
            Crea flujos de procesamiento, filtrado y enrutamiento dinámico para cualquier tipo de sensor.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
        >
          <Plus size={16} />
          Crear Flujo Visual
        </button>
      </div>

      {(user?.role === 'superadmin' || visibleClients.length > 1) && (
        <div className="toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-hint)' }}>Filtrar por Cliente (Tenant):</span>
            <select
              className="form-input"
              value={selectedFilterOrgId}
              onChange={(e) => setSelectedFilterOrgId(e.target.value)}
              style={{ width: 'auto', minWidth: 220, padding: '6px 12px', fontSize: 13, height: '36px' }}
            >
              <option value="all">{user?.role === 'superadmin' ? 'Ver Todos los Clientes' : 'Ver Todos (Propios y Subclientes)'}</option>
              {visibleClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.id === user?.organizationId ? '(Tus Propios Flujos)' : '(Subcliente)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--color-hint)' }}>
          <RefreshCw size={24} className="animate-spin text-teal-500" style={{ margin: '0 auto 12px' }} />
          Cargando flujos de datos...
        </div>
      ) : filteredChains.length === 0 ? (
        <div className="card empty-state">
          <GitFork size={40} style={{ color: 'var(--color-hint)', marginBottom: 12 }} />
          <h3>No hay Cadenas de Reglas</h3>
          <p style={{ maxWidth: 400, textAlign: 'center', fontSize: 14 }}>
            Crea tu primer flujo de trabajo interactivo para conectar sensores LoRaWAN a alertas, bases de datos o acciones de automatización.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
            style={{ marginTop: 12 }}
          >
            Crear Flujo Ahora
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredChains.map((chain) => (
            <div
              key={chain.id}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                borderLeft: chain.active ? '4px solid var(--teal)' : '1px solid var(--color-border)',
                transition: 'transform 0.15s ease'
              }}
            >
              <div style={{ flex: 1, marginRight: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: 0 }}>{chain.name}</h3>
                  <span className={`status-pill ${chain.active ? 'online' : 'offline'}`} style={{ fontSize: 10.5, padding: '2px 8px' }}>
                    {chain.active ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--color-muted)', marginTop: 4, margin: '4px 0 8px 0' }}>
                  {chain.description || 'Sin descripción provista.'}
                </p>
                <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--color-hint)', fontFamily: 'monospace', flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} /> Creado: {new Date(chain.createdAt).toLocaleDateString()}
                  </span>
                  {user?.role === 'superadmin' && (
                    <span>
                      · Tenant: <strong style={{ color: 'var(--color-text)' }}>{clients.find(c => c.id === chain.organizationId)?.name || chain.organizationId || 'Global/Ninguno'}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Activar/Desactivar Flujo */}
                <button
                  onClick={() => handleToggleActive(chain)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: chain.active ? 'var(--teal)' : 'var(--color-hint)' }}
                  title={chain.active ? 'Desactivar cadena de reglas' : 'Activar cadena de reglas (desactivará las otras)'}
                >
                  {chain.active ? <ToggleRight size={38} /> : <ToggleLeft size={38} />}
                </button>

                {/* Botón Diseñar Flujo */}
                <button
                  onClick={() => navigate(`/rule-chains/designer/${chain.id}`)}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', fontSize: 13, borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}
                >
                  <PlayCircle size={15} />
                  <span>Diseñar Flujo</span>
                </button>

                {/* Eliminar Flujo */}
                <button
                  onClick={() => handleDelete(chain.id)}
                  className="dash-action-btn delete"
                  style={{ width: 36, height: 36, borderRadius: 8 }}
                  title="Eliminar esta cadena"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL CREAR FLUJO */}
      {showCreateModal && (
        <div className="slide-over-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 30, borderRadius: 16, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Nueva Cadena de Reglas</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Nombre del Flujo</label>
                <input
                  className="form-input"
                  required
                  placeholder="Ej. Alertas de Medidores Rival"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Explica qué hace este flujo, qué eventos enruta..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{ minHeight: 80, resize: 'vertical' }}
                />
              </div>
              {(user?.role === 'superadmin' || visibleClients.length > 1) && (
                <div className="form-group">
                  <label className="form-label">Cliente / Tenant Asociado</label>
                  <select
                    className="form-input"
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    style={{ height: '38px', fontSize: '13.5px' }}
                  >
                    {user?.role === 'superadmin' && <option value="">-- Sin Cliente (Global/Ninguno) --</option>}
                    {visibleClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.id === user?.organizationId ? '(Tus Propios Flujos)' : '(Subcliente)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                  style={{ height: 38 }}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ height: 38 }}
                  disabled={creating}
                >
                  {creating ? 'Creando...' : 'Crear y Abrir Lienzo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
