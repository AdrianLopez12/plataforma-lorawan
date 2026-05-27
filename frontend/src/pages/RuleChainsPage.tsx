import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRuleChains, createRuleChain, updateRuleChain, deleteRuleChain } from '../services/api';
import type { RuleChain } from '../types';
import { GitFork, Plus, Calendar, ToggleLeft, ToggleRight, Trash2, PlayCircle, RefreshCw } from 'lucide-react';

export default function RuleChainsPage() {
  const navigate = useNavigate();
  const [chains, setChains] = useState<RuleChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadChains = () => {
    setLoading(true);
    getRuleChains()
      .then((data) => {
        if (data) setChains(data);
      })
      .catch((err) => {
        console.warn('API error, using fallback rule chains:', err);
        // Fallback premium para simulación e interacción inmediata offline
        const localFallback: RuleChain[] = [
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
        setChains(localFallback);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChains();
  }, []);

  const handleToggleActive = (chain: RuleChain) => {
    const nextState = !chain.active;
    updateRuleChain(chain.id, { active: nextState })
      .then(() => {
        loadChains();
      })
      .catch(() => {
        // Fallback de simulación interactiva local
        setChains(prev =>
          prev.map(c => {
            if (c.id === chain.id) return { ...c, active: nextState };
            if (nextState) return { ...c, active: false }; // Solo puede haber una activa
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
      active: chains.length === 0 // Activa por defecto si es la primera
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          graph: initialGraph
        };
        setShowCreateModal(false);
        setNewName('');
        setNewDesc('');
        setChains(prev => [mockCreated, ...prev]);
        navigate(`/rule-chains/designer/${mockCreated.id}`);
      })
      .finally(() => setCreating(false));
  };

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

      {loading ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--color-hint)' }}>
          <RefreshCw size={24} className="animate-spin text-teal-500" style={{ margin: '0 auto 12px' }} />
          Cargando flujos de datos...
        </div>
      ) : chains.length === 0 ? (
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
          {chains.map((chain) => (
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
                <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--color-hint)', fontFamily: 'monospace' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} /> Creado: {new Date(chain.createdAt).toLocaleDateString()}
                  </span>
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
