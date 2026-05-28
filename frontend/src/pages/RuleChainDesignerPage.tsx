import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRuleChain, updateRuleChain } from '../services/api';
import type { RuleChain } from '../types';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  PlayCircle, ShieldAlert, FileSpreadsheet, Mail, Globe, Send, Radio,
  ArrowLeft, Save, HelpCircle, RefreshCw, Layers, Clock, MapPin, AlertOctagon
} from 'lucide-react';

// Custom Nodes Components
function InputNode({ data }: any) {
  return (
    <div style={{ background: '#E1F5EE', border: '2px solid #1D9E75', borderRadius: 8, padding: '10px 14px', minWidth: 150, color: '#085041' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <PlayCircle size={15} style={{ color: '#1D9E75' }} />
        <span>{data.label || 'Entrada IoT'}</span>
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#1D9E75', width: 8, height: 8 }} />
    </div>
  );
}

function FilterNode({ data }: any) {
  return (
    <div style={{ background: '#FAEEDA', border: '2px solid #854F0B', borderRadius: 8, padding: '10px 14px', minWidth: 160, color: '#633806', position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#854F0B', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <ShieldAlert size={15} style={{ color: '#854F0B' }} />
        <span>{data.label || 'Filtro Condicional'}</span>
      </div>
      <div style={{ fontSize: 9.5, fontFamily: 'monospace', marginTop: 4, background: 'rgba(0,0,0,0.03)', padding: '2px 4px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.expression || 'payload.temp > 40'}
      </div>
      <Handle type="source" position={Position.Right} id="True" style={{ top: '30%', background: '#1D9E75', width: 7, height: 7 }} />
      <span style={{ position: 'absolute', right: -24, top: '15%', fontSize: 8.5, fontWeight: 700, color: '#1D9E75' }}>True</span>
      <Handle type="source" position={Position.Right} id="False" style={{ top: '70%', background: '#A32D2D', width: 7, height: 7 }} />
      <span style={{ position: 'absolute', right: -28, top: '55%', fontSize: 8.5, fontWeight: 700, color: '#A32D2D' }}>False</span>
    </div>
  );
}

function SaveTelemetryNode({ data }: any) {
  return (
    <div style={{ background: '#E6F1FB', border: '2px solid #185FA5', borderRadius: 8, padding: '10px 14px', minWidth: 155, color: '#0C447C' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#185FA5', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <FileSpreadsheet size={15} style={{ color: '#185FA5' }} />
        <span>{data.label || 'Guardar Telemetría'}</span>
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#185FA5', width: 8, height: 8 }} />
    </div>
  );
}

function SaveAttributesNode({ data }: any) {
  return (
    <div style={{ background: '#EEEDFE', border: '2px solid #534AB7', borderRadius: 8, padding: '10px 14px', minWidth: 155, color: '#3C3489' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#534AB7', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <Radio size={15} style={{ color: '#534AB7' }} />
        <span>{data.label || 'Guardar Atributos'}</span>
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#534AB7', width: 8, height: 8 }} />
    </div>
  );
}

function EmailNode({ data }: any) {
  return (
    <div style={{ background: '#FCEBEB', border: '2px solid #A32D2D', borderRadius: 8, padding: '10px 14px', minWidth: 155, color: '#A32D2D' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#A32D2D', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <Mail size={15} style={{ color: '#A32D2D' }} />
        <span>{data.label || 'Enviar Email'}</span>
      </div>
      <div style={{ fontSize: 9, marginTop: 2, color: '#6b6a64', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        A: {data.to || 'admin@rival.com'}
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#A32D2D', width: 8, height: 8 }} />
    </div>
  );
}

function WebhookNode({ data }: any) {
  return (
    <div style={{ background: '#F1EFE8', border: '2px solid #6b6a64', borderRadius: 8, padding: '10px 14px', minWidth: 155, color: '#1a1a18' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#6b6a64', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <Globe size={15} style={{ color: '#6b6a64' }} />
        <span>{data.label || 'HTTP Webhook'}</span>
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#6b6a64', width: 8, height: 8 }} />
    </div>
  );
}

function RPCNode({ data }: any) {
  return (
    <div style={{ background: '#FCEBEB', border: '2px solid #E24B4A', borderRadius: 8, padding: '10px 14px', minWidth: 155, color: '#E24B4A' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#E24B4A', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <Send size={15} style={{ color: '#E24B4A' }} />
        <span>{data.label || 'Despachar Downlink'}</span>
      </div>
      <div style={{ fontSize: 9, marginTop: 2, color: '#6b6a64' }}>
        Comando: {data.command || 'close'}
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#E24B4A', width: 8, height: 8 }} />
    </div>
  );
}

function TimeRangeNode({ data }: any) {
  return (
    <div style={{ background: '#FAEEDA', border: '2px solid #854F0B', borderRadius: 8, padding: '10px 14px', minWidth: 160, color: '#633806', position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#854F0B', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <Clock size={15} style={{ color: '#854F0B' }} />
        <span>{data.label || 'Rango Horario'}</span>
      </div>
      <div style={{ fontSize: 9.5, marginTop: 4, color: 'var(--color-muted)' }}>
        Rango: {data.startTime || '22:00'} - {data.endTime || '06:00'}
      </div>
      <Handle type="source" position={Position.Right} id="Inside" style={{ top: '30%', background: '#1D9E75', width: 7, height: 7 }} />
      <span style={{ position: 'absolute', right: -32, top: '15%', fontSize: 8.5, fontWeight: 700, color: '#1D9E75' }}>Inside</span>
      <Handle type="source" position={Position.Right} id="Outside" style={{ top: '70%', background: '#A32D2D', width: 7, height: 7 }} />
      <span style={{ position: 'absolute', right: -36, top: '55%', fontSize: 8.5, fontWeight: 700, color: '#A32D2D' }}>Outside</span>
    </div>
  );
}

function GeofenceNode({ data }: any) {
  return (
    <div style={{ background: '#FAEEDA', border: '2px solid #854F0B', borderRadius: 8, padding: '10px 14px', minWidth: 160, color: '#633806', position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#854F0B', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <MapPin size={15} style={{ color: '#854F0B' }} />
        <span>{data.label || 'Geocerca GPS'}</span>
      </div>
      <div style={{ fontSize: 9, marginTop: 4, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        R: {data.radius || 5000}m | Lat: {data.latitude || -0.18}
      </div>
      <Handle type="source" position={Position.Right} id="Inside" style={{ top: '30%', background: '#1D9E75', width: 7, height: 7 }} />
      <span style={{ position: 'absolute', right: -32, top: '15%', fontSize: 8.5, fontWeight: 700, color: '#1D9E75' }}>Inside</span>
      <Handle type="source" position={Position.Right} id="Outside" style={{ top: '70%', background: '#A32D2D', width: 7, height: 7 }} />
      <span style={{ position: 'absolute', right: -36, top: '55%', fontSize: 8.5, fontWeight: 700, color: '#A32D2D' }}>Outside</span>
    </div>
  );
}

function SystemAlertNode({ data }: any) {
  return (
    <div style={{ background: '#FCEBEB', border: '2px solid #A32D2D', borderRadius: 8, padding: '10px 14px', minWidth: 155, color: '#A32D2D' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#A32D2D', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 13 }}>
        <AlertOctagon size={15} style={{ color: '#A32D2D' }} />
        <span>{data.label || 'Crear Alerta'}</span>
      </div>
      <div style={{ fontSize: 9, marginTop: 2, color: '#6b6a64', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.message || 'Alerta de sensor'}
      </div>
      <Handle type="source" position={Position.Right} id="Success" style={{ background: '#A32D2D', width: 8, height: 8 }} />
    </div>
  );
}

export default function RuleChainDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [chain, setChain] = useState<RuleChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // Custom nodes map registration
  const nodeTypes = useMemo(() => ({
    input: InputNode,
    inputNode: InputNode,
    filter: FilterNode,
    filterNode: FilterNode,
    saveTelemetry: SaveTelemetryNode,
    saveTimeseries: SaveTelemetryNode,
    saveAttributes: SaveAttributesNode,
    email: EmailNode,
    sendEmail: EmailNode,
    webhook: WebhookNode,
    restCall: WebhookNode,
    rpc: RPCNode,
    rpcCall: RPCNode,
    timeRange: TimeRangeNode,
    timeFilter: TimeRangeNode,
    geofence: GeofenceNode,
    gpsFilter: GeofenceNode,
    createAlert: SystemAlertNode,
    sysAlert: SystemAlertNode
  }), []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRuleChain(id)
      .then((data) => {
        if (data) {
          setChain(data);
          const graph = data.graph || { nodes: [], edges: [] };
          setNodes(graph.nodes || []);
          setEdges(graph.edges || []);
        }
      })
      .catch((err) => {
        console.warn('Error fetching rule chain, using fallback simulation:', err);
        
        // Cargar desde localStorage si existe un respaldo previo de esta simulación
        const localSaved = localStorage.getItem(`rule_chain_local_${id}`);
        let localGraph = null;
        if (localSaved) {
          try {
            localGraph = JSON.parse(localSaved);
          } catch (e) {
            console.error('Error al parsear el grafo guardado localmente:', e);
          }
        }

        // Buscar si existe esta regla en simulated_rule_chains en localStorage
        const storedSimulated = localStorage.getItem('simulated_rule_chains');
        let simulatedName = 'Procesamiento de Agua Principal';
        let simulatedDesc = 'Filtra caudales altos, registra en base de datos e inunda válvulas si hay fugas.';
        let simulatedOrg = undefined;
        let simulatedActive = true;
        
        if (storedSimulated) {
          try {
            const list: RuleChain[] = JSON.parse(storedSimulated);
            const matched = list.find(c => c.id === id);
            if (matched) {
              simulatedName = matched.name;
              simulatedDesc = matched.description || '';
              simulatedOrg = matched.organizationId;
              simulatedActive = matched.active;
            } else if (id === 'rc_bins') {
              simulatedName = 'Flota SmartBins Rival';
              simulatedDesc = 'Enruta telemetría volumétrica y enciende alarmas al superar el 85% de capacidad.';
              simulatedActive = false;
            }
          } catch (e) {
            console.error('Error parsing simulated_rule_chains list:', e);
          }
        } else {
          if (id === 'rc_bins') {
            simulatedName = 'Flota SmartBins Rival';
            simulatedDesc = 'Enruta telemetría volumétrica y enciende alarmas al superar el 85% de capacidad.';
            simulatedActive = false;
          }
        }

        // Fallback Premium Offline
        const mockChain: RuleChain = {
          id: id || 'rc_mock',
          name: simulatedName,
          description: simulatedDesc,
          active: simulatedActive,
          organizationId: simulatedOrg,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          graph: localGraph || {
            nodes: [
              { id: 'n1', type: 'input', position: { x: 100, y: 150 }, data: { label: 'Entrada LoRaWAN' } },
              { id: 'n2', type: 'filter', position: { x: 300, y: 130 }, data: { label: 'Evaluar Fuga', expression: 'payload.flow > 4.5' } },
              { id: 'n3', type: 'saveTelemetry', position: { x: 530, y: 50 }, data: { label: 'Guardar Telemetría' } },
              { id: 'n4', type: 'rpc', position: { x: 530, y: 220 }, data: { label: 'Cerrar Válvula Downlink', command: 'close' } }
            ],
            edges: [
              { id: 'e1', source: 'n1', target: 'n2', animated: true },
              { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'False', label: 'False', animated: true },
              { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'True', label: 'True', animated: true }
            ]
          }
        };
        setChain(mockChain);
        setNodes(mockChain.graph.nodes);
        setEdges(mockChain.graph.edges);
      })
      .finally(() => setLoading(false));
  }, [id, setNodes, setEdges]);

  // Connect handles logic
  const onConnect = useCallback((params: any) => {
    // Add MarkerType to edges for nice looking arrows
    const newEdge = {
      ...params,
      animated: true,
      label: params.sourceHandle !== 'Success' ? params.sourceHandle : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#1a1a18'
      }
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [setEdges]);

  const onNodeClick = (_: any, node: any) => {
    setSelectedNode(node);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
  };

  // Add dynamic nodes
  const addNodeToCanvas = (type: string, label: string) => {
    const newId = `node_${Math.random().toString(36).substring(2, 9)}`;
    const newNode = {
      id: newId,
      type,
      position: { x: 250 + Math.random() * 50, y: 150 + Math.random() * 50 },
      data: {
        label,
        expression: type === 'filter' ? 'payload.flow > 5.0' : undefined,
        to: type === 'email' ? 'admin@rival.com' : undefined,
        subject: type === 'email' ? 'Alerta Crítica IoT' : undefined,
        body: type === 'email' ? 'Dispositivo excedió umbral.' : undefined,
        command: type === 'rpc' ? 'close' : undefined,
        url: type === 'webhook' ? 'https://api.rival.com/alert' : undefined,
        startTime: type === 'timeRange' ? '22:00' : undefined,
        endTime: type === 'timeRange' ? '06:00' : undefined,
        latitude: type === 'geofence' ? -0.1807 : undefined,
        longitude: type === 'geofence' ? -78.4678 : undefined,
        radius: type === 'geofence' ? 5000 : undefined,
        alertType: type === 'createAlert' ? 'leak' : undefined,
        message: type === 'createAlert' ? 'Alerta Crítica: anomalía detectada.' : undefined,
        severity: type === 'createAlert' ? 'critical' : undefined
      }
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
  };

  // Edit selected node properties
  const updateNodeData = (field: string, val: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updatedNode = {
            ...n,
            data: { ...n.data, [field]: val }
          };
          // Sync immediately in right panel selected state
          setSelectedNode(updatedNode);
          return updatedNode;
        }
        return n;
      })
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    if (selectedNode.type === 'input') {
      alert('El nodo de Entrada LoRaWAN no puede ser eliminado.');
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const handleSave = () => {
    if (!chain) return;
    setSaving(true);

    const graphData = { nodes, edges };

    // Guardar respaldo local en localStorage siempre, por seguridad y soporte offline robusto
    localStorage.setItem(`rule_chain_local_${chain.id}`, JSON.stringify(graphData));

    updateRuleChain(chain.id, {
      graph: graphData
    })
      .then(() => {
        alert('Estructura de la Cadena de Reglas guardada exitosamente.');
      })
      .catch((err) => {
        console.warn('API error, simulated local save:', err);
        
        // Guardar también en la lista de simulated_rule_chains
        const storedSimulated = localStorage.getItem('simulated_rule_chains');
        if (storedSimulated) {
          try {
            let list: RuleChain[] = JSON.parse(storedSimulated);
            const idx = list.findIndex(c => c.id === chain.id);
            if (idx !== -1) {
              list[idx].graph = graphData;
              list[idx].updatedAt = new Date().toISOString();
              localStorage.setItem('simulated_rule_chains', JSON.stringify(list));
            } else {
              // Si no existía (era una default de fallback), la agregamos a simulated
              list.push({
                ...chain,
                graph: graphData,
                updatedAt: new Date().toISOString()
              });
              localStorage.setItem('simulated_rule_chains', JSON.stringify(list));
            }
          } catch (e) {
            console.error('Error updating rule chain inside simulated_rule_chains:', e);
          }
        } else {
          localStorage.setItem('simulated_rule_chains', JSON.stringify([{
            ...chain,
            graph: graphData,
            updatedAt: new Date().toISOString()
          }]));
        }

        alert('[Simulación] Cambios del lienzo guardados localmente con éxito.');
      })
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="page" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--color-hint)' }}>
          <RefreshCw size={24} className="animate-spin text-teal-500" style={{ margin: '0 auto 12px' }} />
          <span>Cargando lienzo interactivo...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: 0, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header del Canvas */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--color-border)', background: 'white', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/rule-chains')}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, padding: 0, borderRadius: '50%' }}
            title="Volver a cadenas"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={16} className="text-teal-500" />
              <span>Diseñador: {chain?.name}</span>
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-hint)', margin: 0 }}>
              Arrastra o agrega nodos para construir flujos dirigidos asíncronos.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}
          >
            <Save size={15} />
            <span>{saving ? 'Guardando...' : 'Guardar Flujo'}</span>
          </button>
        </div>
      </div>

      {/* Main Designer Grid */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Panel Izquierdo: Caja de Herramientas (Toolbox) */}
        <div className="no-print custom-scrollbar" style={{ width: 220, background: '#fcfcfc', borderRight: '1px solid var(--color-border)', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, zIndex: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--color-hint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Añadir Elementos
          </div>
          
          <button onClick={() => addNodeToCanvas('filter', 'Filtrar Datos')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#FAEEDA', border: '1px solid #854F0B', color: '#633806', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <ShieldAlert size={14} /> Filtro Condicional
          </button>
          
          <button onClick={() => addNodeToCanvas('saveTelemetry', 'Guardar Telemetría')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#E6F1FB', border: '1px solid #185FA5', color: '#0C447C', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <FileSpreadsheet size={14} /> Guardar Series
          </button>
          
          <button onClick={() => addNodeToCanvas('saveAttributes', 'Guardar Atributos')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#EEEDFE', border: '1px solid #534AB7', color: '#3C3489', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <Radio size={14} /> Guardar Atributos
          </button>
          
          <button onClick={() => addNodeToCanvas('email', 'Enviar Notificación')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#FCEBEB', border: '1px solid #A32D2D', color: '#A32D2D', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <Mail size={14} /> Enviar Email
          </button>
          
          <button onClick={() => addNodeToCanvas('webhook', 'Despacho Webhook')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#F1EFE8', border: '1px solid #6b6a64', color: '#1a1a18', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <Globe size={14} /> Webhook API
          </button>
          
          <button onClick={() => addNodeToCanvas('rpc', 'Downlink Control')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#FCEBEB', border: '1px solid #E24B4A', color: '#E24B4A', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <Send size={14} /> Downlink RPC
          </button>
          
          <button onClick={() => addNodeToCanvas('timeRange', 'Filtrar Horario')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#FAEEDA', border: '1px solid #854F0B', color: '#633806', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <Clock size={14} /> Filtrar Horario
          </button>
          
          <button onClick={() => addNodeToCanvas('geofence', 'Geocerca GPS')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#FAEEDA', border: '1px solid #854F0B', color: '#633806', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <MapPin size={14} /> Geocerca GPS
          </button>
          
          <button onClick={() => addNodeToCanvas('createAlert', 'Crear Alerta')} className="filter-tab" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', width: '100%', borderRadius: 8, background: '#FCEBEB', border: '1px solid #A32D2D', color: '#A32D2D', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 12.5 }}>
            <AlertOctagon size={14} /> Crear Alerta
          </button>

          <div style={{ marginTop: 'auto', borderTop: '0.5px solid var(--color-border)', paddingTop: 14, fontSize: 11, color: 'var(--color-hint)', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
            <HelpCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Haz clic en un elemento para crearlo. Conecta nodos tirando de sus extremos circulares.</span>
          </div>
        </div>

        {/* Centro: React Flow Canvas */}
        <div style={{ flex: 1, height: '100%', background: '#f5f5f5' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            style={{ width: '100%', height: '100%' }}
          >
            <MiniMap style={{ bottom: 12, left: 12 }} zoomable pannable />
            <Controls style={{ bottom: 12, right: 12, display: 'flex', flexDirection: 'row', gap: 4 }} />
            <Background color="#ccc" gap={16} size={1} />
          </ReactFlow>
        </div>

        {/* Panel Derecho: Propiedades del Nodo Seleccionado */}
        {selectedNode && (
          <div className="no-print" style={{ width: 280, background: 'white', borderLeft: '1px solid var(--color-border)', padding: 20, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-hint)', textTransform: 'uppercase' }}>
                Propiedades
              </span>
              <button
                onClick={deleteSelectedNode}
                className="btn-secondary"
                style={{ fontSize: 10, height: 24, padding: '0 8px', borderColor: 'var(--red)', color: 'var(--red)' }}
                title="Eliminar este nodo"
              >
                Eliminar Nodo
              </button>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: 12 }}>Etiqueta Visual</label>
              <input
                className="form-input"
                style={{ height: 34, fontSize: 13 }}
                value={selectedNode.data.label || ''}
                onChange={(e) => updateNodeData('label', e.target.value)}
              />
            </div>

            {/* Configuración específica por tipo de nodo */}
            {selectedNode.type === 'filter' && (
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Expresión JavaScript</span>
                </label>
                <textarea
                  className="form-input"
                  rows={4}
                  style={{ fontSize: 12, fontFamily: 'monospace', minHeight: 90 }}
                  placeholder="payload.temperature > 40"
                  value={selectedNode.data.expression || ''}
                  onChange={(e) => updateNodeData('expression', e.target.value)}
                />
                <span style={{ fontSize: 10, color: 'var(--color-hint)', lineHeight: 1.3, display: 'block', marginTop: 4 }}>
                  Usa variables como `payload.temperature` o `device.devEUI`. Retorna un boolean.
                </span>
              </div>
            )}

            {selectedNode.type === 'email' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Destinatario</label>
                  <input
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="alertas@rival.com"
                    value={selectedNode.data.to || ''}
                    onChange={(e) => updateNodeData('to', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Asunto</label>
                  <input
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="Alerta IoT"
                    value={selectedNode.data.subject || ''}
                    onChange={(e) => updateNodeData('subject', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Cuerpo de Alerta</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    style={{ fontSize: 12.5, minHeight: 70 }}
                    value={selectedNode.data.body || ''}
                    onChange={(e) => updateNodeData('body', e.target.value)}
                  />
                </div>
              </>
            )}

            {selectedNode.type === 'webhook' && (
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 12 }}>Endpoint URL (HTTP POST)</label>
                <input
                  className="form-input"
                  style={{ height: 34, fontSize: 12, fontFamily: 'monospace' }}
                  placeholder="https://api.rival.com/uplink"
                  value={selectedNode.data.url || ''}
                  onChange={(e) => updateNodeData('url', e.target.value)}
                />
              </div>
            )}

            {selectedNode.type === 'rpc' && (
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 12 }}>Comando Downlink</label>
                <select
                  className="form-input"
                  style={{ height: 34, padding: '0 10px', fontSize: 13 }}
                  value={selectedNode.data.command || 'close'}
                  onChange={(e) => updateNodeData('command', e.target.value)}
                >
                  <option value="close">Cerrar Válvula Solenoide</option>
                  <option value="open">Abrir Válvula Solenoide</option>
                </select>
              </div>
            )}

            {selectedNode.type === 'timeRange' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Hora Inicio (HH:MM)</label>
                  <input
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="22:00"
                    value={selectedNode.data.startTime || ''}
                    onChange={(e) => updateNodeData('startTime', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Hora Fin (HH:MM)</label>
                  <input
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="06:00"
                    value={selectedNode.data.endTime || ''}
                    onChange={(e) => updateNodeData('endTime', e.target.value)}
                  />
                </div>
              </>
            )}

            {selectedNode.type === 'geofence' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Latitud Centro</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="-0.1807"
                    value={selectedNode.data.latitude ?? ''}
                    onChange={(e) => updateNodeData('latitude', Number(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Longitud Centro</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="-78.4678"
                    value={selectedNode.data.longitude ?? ''}
                    onChange={(e) => updateNodeData('longitude', Number(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Radio Geocerca (metros)</label>
                  <input
                    type="number"
                    className="form-input"
                    style={{ height: 34, fontSize: 13 }}
                    placeholder="5000"
                    value={selectedNode.data.radius ?? ''}
                    onChange={(e) => updateNodeData('radius', Number(e.target.value))}
                  />
                </div>
              </>
            )}

            {selectedNode.type === 'createAlert' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Tipo de Alerta</label>
                  <select
                    className="form-input"
                    style={{ height: 34, padding: '0 10px', fontSize: 13 }}
                    value={selectedNode.data.alertType || 'leak'}
                    onChange={(e) => updateNodeData('alertType', e.target.value)}
                  >
                    <option value="leak">Fuga de Agua</option>
                    <option value="overflow">Desborde / Llenado Alto</option>
                    <option value="bin_full">Contenedor Lleno</option>
                    <option value="battery">Batería Baja</option>
                    <option value="tamper">Manipulación / Sabotaje</option>
                    <option value="frost">Riesgo de Helada</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Mensaje de la Alerta</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    style={{ fontSize: 12.5, minHeight: 70 }}
                    value={selectedNode.data.message || ''}
                    onChange={(e) => updateNodeData('message', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12 }}>Severidad</label>
                  <select
                    className="form-input"
                    style={{ height: 34, padding: '0 10px', fontSize: 13 }}
                    value={selectedNode.data.severity || 'critical'}
                    onChange={(e) => updateNodeData('severity', e.target.value)}
                  >
                    <option value="critical">Crítica (Rojo)</option>
                    <option value="warning">Advertencia (Naranja)</option>
                    <option value="info">Informativa (Azul)</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
