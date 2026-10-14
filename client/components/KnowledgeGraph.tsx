import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import { ArrowRight, Network, Search, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { GraphData } from '../../shared/contracts';
import { api } from '../api';

const colors: Record<string, string> = {
  person: '#c7def7',
  organization: '#cae5d9',
  account: '#f2d6ae',
  amount: '#eadcf4',
  location: '#f5d4cf',
};
export default function KnowledgeGraph({
  onSelectEmail,
  refreshKey,
}: {
  onSelectEmail: (id: string) => void;
  refreshKey: string;
}) {
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  useEffect(() => {
    let alive = true;
    api<GraphData>('/graph')
      .then((d) => {
        if (alive) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  const { nodes, edges } = useMemo(() => {
    const connected = new Set(
      data.edges
        .filter((e) => e.source === selected || e.target === selected)
        .flatMap((e) => [e.source, e.target]),
    );
    // Arrange connected components in a grid; shared email identifiers join components.
    const adjacency = new Map(data.nodes.map((n) => [n.id, new Set<string>()]));
    for (const e of data.edges) {
      adjacency.get(e.source)?.add(e.target);
      adjacency.get(e.target)?.add(e.source);
    }
    const seen = new Set<string>();
    const components: string[][] = [];
    for (const n of data.nodes) {
      if (seen.has(n.id)) continue;
      const queue = [n.id],
        group: string[] = [];
      seen.add(n.id);
      while (queue.length) {
        const id = queue.shift()!;
        group.push(id);
        for (const neighbor of adjacency.get(id) ?? [])
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
      }
      components.push(group);
    }
    const positions = new Map<string, { x: number; y: number }>();
    components
      .sort((a, b) => b.length - a.length)
      .forEach((group, i) => {
        const radius = Math.max(160, group.length * 34);
        group.forEach((id, j) =>
          positions.set(id, {
            x: (i % 3) * 820 + Math.cos((j / group.length) * Math.PI * 2) * radius,
            y: Math.floor(i / 3) * 760 + Math.sin((j / group.length) * Math.PI * 2) * radius,
          }),
        );
      });
    const nodes: Node[] = data.nodes.map((n) => ({
      id: n.id,
      position: positions.get(n.id)!,
      data: {
        label: (
          <div className="graph-node">
            <span>{n.type}</span>
            <strong>{n.name}</strong>
            <small>
              {n.emailIds.length} message{n.emailIds.length === 1 ? '' : 's'}
            </small>
          </div>
        ),
      },
      style: {
        background: colors[n.type],
        border: n.id === selected ? '2px solid #163e35' : '1px solid #00000018',
        width: 190,
        opacity: selected && n.id !== selected && !connected.has(n.id) ? 0.3 : 1,
      },
      ariaLabel: `${n.type}: ${n.name}`,
    }));
    // Parallel relationships share one visual edge; the inspector retains every source assertion.
    const grouped = new Map<string, GraphData['edges']>();
    for (const edge of data.edges) {
      const key = `${edge.source}:${edge.target}`;
      grouped.set(key, [...(grouped.get(key) ?? []), edge]);
    }
    const edges: Edge[] = [...grouped.entries()].map(([id, group]) => {
      const e = group[0];
      return {
        id,
        source: e.source,
        target: e.target,
        label: group.length > 1 ? `${group.length} relationships` : e.type.replaceAll('_', ' '),
        markerEnd: { type: MarkerType.ArrowClosed, color: '#7e9290' },
        style: {
          stroke: '#7e9290',
          opacity: selected && e.source !== selected && e.target !== selected ? 0.15 : 1,
        },
        labelStyle: { fontSize: 10 },
        labelBgStyle: { fill: '#f8faf7' },
      };
    });
    return { nodes, edges };
  }, [data, selected]);
  useEffect(() => {
    if (!flow || !selected) return;
    const node = flow.getNode(selected);
    if (node)
      void flow.setCenter(node.position.x + 95, node.position.y + 45, {
        zoom: 1,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
      });
  }, [selected, flow]);
  const entity = data.nodes.find((n) => n.id === selected);
  const relationships = data.edges.filter((e) => e.source === selected || e.target === selected);
  return (
    <section className="graph-workspace">
      <div className="graph-toolbar">
        <div>
          <Network size={18} />
          <strong>Knowledge graph</strong>
          <span>
            {nodes.length} entities · {data.edges.length} relationships
          </span>
        </div>
        <p>Scroll to zoom · Drag to pan · Select a node</p>
      </div>
      {error && (
        <p role="alert" className="error-notice">
          {error}
        </p>
      )}
      {nodes.length ? (
        <div className="graph-layout">
          <div className="graph-canvas">
            <ReactFlow
              onInit={setFlow}
              nodes={nodes}
              edges={edges}
              onNodeClick={(_e, n) => setSelected(n.id)}
              onPaneClick={() => setSelected(null)}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              minZoom={0.1}
              maxZoom={2}
              fitViewOptions={{ padding: 0.15 }}
            >
              <Background color="#cdd8d2" gap={22} />
              <Controls showInteractive={false} />
              <MiniMap nodeColor={(n) => String(n.style?.background)} pannable zoomable />
            </ReactFlow>
            <div className="graph-legend">
              {Object.entries(colors).map(([name, color]) => (
                <span key={name}>
                  <i style={{ background: color }} />
                  {name}
                </span>
              ))}
            </div>
          </div>
          <aside className="graph-inspector">
            {entity ? (
              <>
                <div className="section-heading">
                  <span className={`entity-type type-${entity.type}`}>{entity.type}</span>
                  <button
                    className="icon-button"
                    aria-label="Clear selected entity"
                    onClick={() => setSelected(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <h2>{entity.name}</h2>
                <p className="muted">
                  Connected through {entity.emailIds.length} message
                  {entity.emailIds.length === 1 ? '' : 's'}.
                </p>
                <h3>Source messages</h3>
                {entity.emailIds.map((id) => (
                  <button className="graph-email-link" key={id} onClick={() => onSelectEmail(id)}>
                    {id.startsWith('E0') ? `Message ${id}` : `Message ${id.slice(0, 8)}`}
                    <ArrowRight size={14} />
                  </button>
                ))}
                <h3>Connections</h3>
                {relationships.length ? (
                  relationships.map((rel) => (
                    <div className="graph-connection" key={rel.id}>
                      <strong>
                        {
                          data.nodes.find(
                            (n) => n.id === (rel.source === selected ? rel.target : rel.source),
                          )?.name
                        }
                      </strong>
                      <span>{rel.type.replaceAll('_', ' ')}</span>
                      <blockquote>{rel.evidence.quote}</blockquote>
                      <button className="text-button" onClick={() => onSelectEmail(rel.emailId)}>
                        View source <ArrowRight size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">No supported relationships.</p>
                )}
              </>
            ) : (
              <>
                <span className="eyebrow">EXPLORE THE EVIDENCE</span>
                <h2>Every connection has a source.</h2>
                <p className="muted">
                  Select a node to see its relationships and open the original messages.
                </p>
                <div className="search-box">
                  <Search size={15} />
                  <input
                    aria-label="Find an entity"
                    placeholder="Find an entity…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="graph-entity-list">
                  {data.nodes
                    .filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
                    .map((n) => (
                      <button key={n.id} onClick={() => setSelected(n.id)}>
                        <span className="entity-type">{n.type}</span>
                        {n.name}
                      </button>
                    ))}
                </div>
              </>
            )}
          </aside>
        </div>
      ) : (
        <div className="empty-inline graph-empty">
          <Network size={38} />
          <h2>Your network starts with a message.</h2>
          <p>Once messages are analyzed, their entities and relationships appear here.</p>
        </div>
      )}
      <div className="graph-note">
        Shared email addresses connect messages. Names and partial account numbers are kept separate
        to avoid false matches.
      </div>
    </section>
  );
}
