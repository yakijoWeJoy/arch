import dagre from '@dagrejs/dagre';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useState } from 'react';
import { deriveGraph, type DerivedEdge, type Layer, type Level } from '../../shared/derive';
import { useModel } from '../api';
import { COMPONENT_KIND_ICON, COMPONENT_KIND_LABEL } from '../labels';
import { interfaceLabel, type ComponentKind } from '../../shared/schema';

const NODE_W = 190;
const NODE_H = 56;

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

export function MapPage() {
  const { model } = useModel();
  const [level, setLevel] = useState<Level>('container');
  const [layer, setLayer] = useState<Layer>('logical');
  const [scenarioId, setScenarioId] = useState('');
  const [picked, setPicked] = useState<DerivedEdge | null>(null);

  const graph = useMemo(
    () => (model ? deriveGraph(model, { level, layer, scenarioIds: scenarioId ? [scenarioId] : undefined }) : null),
    [model, level, layer, scenarioId],
  );

  const { nodes, edges } = useMemo(() => {
    if (!graph || !model) return { nodes: [], edges: [] };
    const systemName = (id: string | null) => model.systems.find((s) => s.id === id)?.name;
    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.labels.length > 2 ? `${e.labels.slice(0, 2).join(', ')} +${e.labels.length - 2}` : e.labels.join(', '),
      animated: e.async,
      style: { strokeDasharray: e.async ? '6 4' : undefined, strokeWidth: 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed },
      labelStyle: { fontSize: 11, direction: 'ltr' },
      labelBgStyle: { fill: 'var(--bg)', fillOpacity: 0.9 },
      data: e as unknown as Record<string, unknown>,
    }));
    const rfNodes: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div className="map-node-inner" dir="ltr">
            <div className="map-node-title">
              {level === 'container' ? COMPONENT_KIND_ICON[n.kind as ComponentKind] : '▣'} {n.name}
            </div>
            <div className="map-node-sub">
              {level === 'container' ? `${COMPONENT_KIND_LABEL[n.kind as ComponentKind]} · ${systemName(n.systemId) ?? ''}` : n.external ? 'מערכת חיצונית' : 'מערכת'}
            </div>
          </div>
        ),
      },
      className: `map-node kind-${n.kind} ${n.external ? 'ext' : ''}`,
      style: { width: NODE_W, height: NODE_H },
      sourcePosition: 'right' as Node['sourcePosition'],
      targetPosition: 'left' as Node['targetPosition'],
    }));
    return { nodes: layout(rfNodes, rfEdges), edges: rfEdges };
  }, [graph, model, level]);

  if (!model || !graph) return null;
  const sc = (id: string) => model.scenarios.find((s) => s.id === id);

  return (
    <div className="page map-page">
      <div className="toolbar">
        <h2>מפת קשרים</h2>
        <span className="muted">נגזרת אוטומטית מ-{model.scenarios.reduce((n, s) => n + s.steps.length, 0)} צעדים</span>
        <span className="grow" />
        <div className="seg">
          <button className={level === 'system' ? 'on' : ''} onClick={() => setLevel('system')}>
            רמת מערכת
          </button>
          <button className={level === 'container' ? 'on' : ''} onClick={() => setLevel('container')}>
            רמת רכיב
          </button>
        </div>
        <div className="seg">
          <button className={layer === 'logical' ? 'on' : ''} onClick={() => setLayer('logical')}>
            לוגי
          </button>
          <button className={layer === 'deployment' ? 'on' : ''} onClick={() => setLayer('deployment')} title="מציג מעבר דרך F5">
            פריסה (F5)
          </button>
        </div>
        <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
          <option value="">כל התרחישים</option>
          {model.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="map-body">
        <div className="map-canvas" dir="ltr">
          {nodes.length === 0 ? (
            <div className="empty-diagram">אין עדיין קשרים — הוסף צעדים לתרחישים</div>
          ) : (
            <ReactFlow
              key={`${level}-${layer}-${scenarioId}`}
              nodes={nodes}
              edges={edges}
              fitView
              nodesConnectable={false}
              onEdgeClick={(_, e) => setPicked(e.data as unknown as DerivedEdge)}
              onNodeDoubleClick={(_, n) => {
                if (level === 'container') window.location.hash = `#/catalog/component/${n.id}`;
                else window.location.hash = `#/catalog/system/${n.id}`;
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
        </div>
        {picked && (
          <aside className="map-side">
            <div className="inspector-head">
              <h3>קשר</h3>
              <span className="grow" />
              <button className="icon-btn" onClick={() => setPicked(null)}>
                ✕
              </button>
            </div>
            <p dir="ltr" className="edge-title">
              {graph.nodes.find((n) => n.id === picked.from)?.name} → {graph.nodes.find((n) => n.id === picked.to)?.name}
            </p>
            <h4>ממשקים</h4>
            <ul className="plain" dir="ltr">
              {picked.interfaceIds.map((iid) => {
                const i = model.interfaces.find((x) => x.id === iid);
                return (
                  <li key={iid}>
                    <a href={`#/catalog/interface/${iid}`}>{i ? interfaceLabel(i) : iid}</a>
                  </li>
                );
              })}
            </ul>
            <h4>תרחישים</h4>
            <ul className="plain">
              {picked.scenarioIds.map((sid) => (
                <li key={sid}>
                  <a href={`#/scenarios/${sid}`}>{sc(sid)?.name}</a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      <div className="legend">
        <span>
          <i className="lg solid" /> קריאה סינכרונית
        </span>
        <span>
          <i className="lg dashed" /> הודעה בתור (אסינכרוני)
        </span>
        <span className="muted">לחיצה על קשר — פרטים · לחיצה כפולה על רכיב — כרטיס בקטלוג</span>
      </div>
    </div>
  );
}
