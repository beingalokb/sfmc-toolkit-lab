import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';

// Card-based Schema Board that renders object cards grouped by type
// and draws relationship lines between them using an SVG overlay.
// Expects nodes in Cytoscape-like format: { data: { id, label, type, category, metadata } }
// Expects edges in Cytoscape-like format: { data: { id, source, target, type, label } }

const DISPLAY_TYPES = [
  'Automations',
  'Journeys',
  'SQL Queries',
  'Data Extensions',
  'Filters',
  'Triggered Sends',
  'File Transfers',
  'Data Extracts'
];

const typeOrderIndex = DISPLAY_TYPES.reduce((acc, t, i) => { acc[t] = i; return acc; }, {});

const defaultEdgeColors = {
  'writes_to': '#10B981',
  'reads_from': '#3B82F6',
  'imports_to_de': '#F97316',
  'updates_de': '#84CC16',
  'contains_query': '#6B7280',
  'contains_filter': '#06B6D4',
  'executes_query': '#8B5CF6',
  'triggers_automation': '#EC4899',
  'journey_entry_source': '#8B5CF6',
  'uses_in_decision': '#EAB308',
  'subscriber_source': '#EF4444',
  'sends_email': '#EC4899',
  'filters_de': '#06B6D4',
  'provides_data_to': '#06B6D4',
  'default': '#94A3B8'
};

const relationshipLevel = (type) => {
  const direct = ['writes_to', 'reads_from', 'imports_to_de', 'updates_de', 'journey_entry_source'];
  const indirect = ['contains_query', 'executes_query', 'triggers_automation'];
  const metadata = ['filters_de', 'uses_in_decision', 'provides_data_to'];
  if (direct.includes(type)) return 'direct';
  if (indirect.includes(type)) return 'indirect';
  if (metadata.includes(type)) return 'metadata';
  return 'unknown';
};

export default function SchemaCardBoard({
  nodes = [],
  edges = [],
  selectedNodeId,
  onSelectNode,
  onExpandNode,
  getTypeColor, // function(type) => color
  fetchDetails // function(id) => Promise
}) {
  const containerRef = useRef(null);
  const columnRefs = useRef({});
  const cardRefs = useRef({});
  const [paths, setPaths] = useState([]);
  const [markerColors, setMarkerColors] = useState([]);
  const [expandedCards, setExpandedCards] = useState({});
  const [detailsCache, setDetailsCache] = useState({});
  const [zoom, setZoom] = useState(1);
  const [fieldLimitById, setFieldLimitById] = useState({});

  // Filter nodes to display only supported types
  const displayNodes = useMemo(() => {
    return nodes.filter(n => {
      const t = n?.data?.type || n?.data?.category;
      return DISPLAY_TYPES.includes(t);
    });
  }, [nodes]);

  // Group nodes by type for column rendering
  const grouped = useMemo(() => {
    const g = {};
    DISPLAY_TYPES.forEach(t => g[t] = []);
    for (const n of displayNodes) {
      const t = n?.data?.type || n?.data?.category || 'Other';
      if (!g[t]) g[t] = [];
      g[t].push(n);
    }
    // sort by label
    for (const t of Object.keys(g)) {
      g[t].sort((a, b) => (a?.data?.label || '').localeCompare(b?.data?.label || ''));
    }
    return g;
  }, [displayNodes]);

  // Build a quick index for card columns
  const columnIndexByType = useMemo(() => typeOrderIndex, []);

  // Build a map of visible node ids
  const visibleIds = useMemo(() => new Set(displayNodes.map(n => n?.data?.id).filter(Boolean)), [displayNodes]);

  // Filter edges where both ends are visible
  const displayEdges = useMemo(() => {
    return edges
      .map(e => e?.data ? e : { data: e })
      .filter(e => visibleIds.has(e.data.source) && visibleIds.has(e.data.target));
  }, [edges, visibleIds]);

  // Measure all card positions relative to container
  const measurePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { cards: {}, containerRect: null };
    const cRect = container.getBoundingClientRect();
    const positions = {};
    for (const [id, el] of Object.entries(cardRefs.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      positions[id] = {
        x: r.left - cRect.left + container.scrollLeft,
        y: r.top - cRect.top + container.scrollTop,
        w: r.width,
        h: r.height
      };
    }
    return { cards: positions, containerRect: cRect };
  }, []);

  // Compute SVG paths between cards
  const recomputePaths = useCallback(() => {
    const { cards } = measurePositions();
    const newPaths = [];
    const colors = new Set();

    displayEdges.forEach(edge => {
      const src = cards[edge.data.source];
      const tgt = cards[edge.data.target];
      if (!src || !tgt) return;

      const srcType = (nodes.find(n => n.data.id === edge.data.source)?.data?.type) || 'Other';
      const tgtType = (nodes.find(n => n.data.id === edge.data.target)?.data?.type) || 'Other';

      const srcCol = columnIndexByType[srcType] ?? 0;
      const tgtCol = columnIndexByType[tgtType] ?? 0;

      // Choose anchor points: right-middle if going left->right, else left-middle
      const from = {
        x: srcCol <= tgtCol ? (src.x + src.w) : src.x,
        y: src.y + src.h / 2
      };
      const to = {
        x: srcCol <= tgtCol ? tgt.x : (tgt.x + tgt.w),
        y: tgt.y + tgt.h / 2
      };

      const dx = Math.max(60, Math.abs(to.x - from.x) * 0.35);
      const c1x = from.x + (srcCol <= tgtCol ? dx : -dx);
      const c2x = to.x - (srcCol <= tgtCol ? dx : -dx);

      const d = `M ${from.x},${from.y} C ${c1x},${from.y} ${c2x},${to.y} ${to.x},${to.y}`;

      // Prefer backend-provided relationStyle; fallback to local type-based classification
      const relationStyle = edge.data.relationStyle || relationshipLevel(edge.data.type);
      const color = defaultEdgeColors[edge.data.type] || defaultEdgeColors.default;
      colors.add(color);

      let dash = '';
      if (relationStyle === 'workflow' || relationStyle === 'indirect') {
        dash = '6,4'; // dashed
      } else if (relationStyle === 'metadata') {
        dash = '2,4'; // dotted
      }

      newPaths.push({
        id: edge.data.id,
        d,
        color,
        dash,
        label: edge.data.label,
        to
      });
    });

    setPaths(newPaths);
    setMarkerColors(Array.from(colors));
  }, [displayEdges, measurePositions, nodes, columnIndexByType]);

  // Recompute on mount and when layout changes
  useEffect(() => {
    recomputePaths();
  }, [recomputePaths]);

  // Handle resize and scroll
  useEffect(() => {
    const onResize = () => recomputePaths();
    const onScroll = () => recomputePaths();
    window.addEventListener('resize', onResize);
    const el = containerRef.current;
    if (el) el.addEventListener('scroll', onScroll, { passive: true });
    // small async to wait for layout settle
    const t = setTimeout(recomputePaths, 50);
    return () => {
      window.removeEventListener('resize', onResize);
      if (el) el.removeEventListener('scroll', onScroll);
      clearTimeout(t);
    };
  }, [recomputePaths]);

  const toggleExpand = async (id) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    if (!detailsCache[id]) {
      try {
        const details = await fetchDetails(id);
        setDetailsCache(prev => ({ ...prev, [id]: details }));
      } catch (e) {
        // ignore
      }
    }
  };

  // Helper to render audit footer
  const renderAuditFooter = (details) => {
    if (!details) return null;
    const md = details.metadata || details || {};

    const createdBy = md.createdByName || md.createdBy || md.CreatedBy || md.owner || null;
    const createdDate = md.createdDate || md.CreatedDate || null;
    const modifiedBy = md.modifiedByName || md.modifiedBy || md.ModifiedBy || null;
    const lastModified = md.lastModified || md.LastModified || md.modifiedDate || null;
    const lastRun = md.lastRun || md.lastRunDate || md.LastRun || md.lastExecution || null;

    if (!createdBy && !modifiedBy && !lastRun && !createdDate && !lastModified) return null;

    const fmt = (d) => {
      try { return d ? new Date(d).toLocaleString() : null; } catch { return d; }
    };

    return (
      <div className="mt-3 pt-2 border-t text-[11px] text-gray-600 grid grid-cols-3 gap-2">
        {createdBy && (
          <div>
            <div className="text-gray-400">Created By</div>
            <div className="truncate">{createdBy}</div>
            {createdDate && <div className="text-gray-400 mt-0.5">{fmt(createdDate)}</div>}
          </div>
        )}
        {modifiedBy && (
          <div>
            <div className="text-gray-400">Modified By</div>
            <div className="truncate">{modifiedBy}</div>
            {lastModified && <div className="text-gray-400 mt-0.5">{fmt(lastModified)}</div>}
          </div>
        )}
        {lastRun && (
          <div>
            <div className="text-gray-400">Last Run</div>
            <div className="truncate">{fmt(lastRun)}</div>
          </div>
        )}
      </div>
    );
  };

  // Per-type body renderers
  const renderDEBody = (meta, expanded, id) => {
    const fields = meta?.fields || meta?.fieldNames || [];
    const limit = fieldLimitById[id] || 20;

    if (!fields || fields.length === 0) return null;
    const show = fields.slice(0, limit);

    return (
      <div>
        <div className="text-xs font-medium text-gray-700">Fields ({fields.length})</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {show.map((f) => (
            <span key={f} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-100">{f}</span>
          ))}
          {fields.length > limit && (
            <button
              className="text-[11px] text-indigo-600 ml-1"
              onClick={(e) => {
                e.stopPropagation();
                setFieldLimitById(prev => ({ ...prev, [id]: (prev[id] || 20) + 30 }));
              }}
            >
              Show more fields
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderAutomationBody = (meta) => {
    const activities = meta?.activities || meta?.steps || [];
    if (!activities || activities.length === 0) return null;
    return (
      <div>
        <div className="text-xs font-medium text-gray-700">Activities ({activities.length})</div>
        <ol className="mt-1 space-y-1 text-[11px] text-gray-700 list-decimal list-inside">
          {activities.slice(0, 20).map((a, idx) => (
            <li key={a.id || idx} className="truncate">
              {(a.stepNumber || idx + 1)}. {a.type || a.activityType || 'Activity'}{a.name ? ` – ${a.name}` : ''}
            </li>
          ))}
          {activities.length > 20 && (
            <li className="text-gray-500">+{activities.length - 20} more…</li>
          )}
        </ol>
      </div>
    );
  };

  const renderQueryBody = (meta) => {
    const target = meta?.targetDE || meta?.targetDe || meta?.destinationName;
    const sources = meta?.sourceDEs || meta?.sources || meta?.tables || [];
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {target && (
          <div>
            <span className="text-gray-500">Target DE:</span> <span className="font-medium">{target}</span>
          </div>
        )}
        {sources && sources.length > 0 && (
          <div>
            <div className="text-gray-500">Source DEs</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {sources.slice(0, 10).map((s) => (
                <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-green-50 text-green-700 border border-green-100">{s}</span>
              ))}
              {sources.length > 10 && (
                <span className="text-gray-500">+{sources.length - 10} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderJourneyBody = (meta) => {
    const entries = meta?.entrySources || meta?.entry || [];
    const activities = meta?.activities || [];
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {entries && entries.length > 0 && (
          <div>
            <div className="text-gray-500">Entry Sources</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {entries.slice(0, 8).map((e, i) => (
                <span key={e?.name || i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700 border border-purple-100">{e?.name || e}</span>
              ))}
            </div>
          </div>
        )}
        {activities && activities.length > 0 && (
          <div className="text-gray-500">Activities: <span className="font-medium">{activities.length}</span></div>
        )}
      </div>
    );
  };

  const renderSendBody = (meta) => {
    const classification = meta?.sendClassification || meta?.classification || null;
    const email = meta?.emailName || meta?.email || null;
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {email && (
          <div>
            <span className="text-gray-500">Email:</span> <span className="font-medium">{email}</span>
          </div>
        )}
        {classification && (
          <div>
            <span className="text-gray-500">Classification:</span> <span className="font-medium">{classification}</span>
          </div>
        )}
      </div>
    );
  };

  const renderFileBody = (meta, type) => {
    const path = meta?.filePath || meta?.directory || meta?.sourceLocation || meta?.destinationLocation || null;
    const pattern = meta?.filePattern || meta?.fileName || null;
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {path && (
          <div>
            <span className="text-gray-500">Path:</span> <span className="font-medium">{path}</span>
          </div>
        )}
        {pattern && (
          <div>
            <span className="text-gray-500">File:</span> <span className="font-medium">{pattern}</span>
          </div>
        )}
        {type === 'Data Extracts' && meta?.extractType && (
          <div>
            <span className="text-gray-500">Extract Type:</span> <span className="font-medium">{meta.extractType}</span>
          </div>
        )}
      </div>
    );
  };

  const renderGenericMeta = (meta) => {
    if (!meta) return null;
    // pick some common keys to display
    const keys = ['status', 'categoryPath', 'externalKey', 'description'];
    const items = keys.filter(k => meta[k]).map(k => ({ k, v: meta[k] }));
    if (items.length === 0) return null;
    return (
      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-700">
        {items.map(({ k, v }) => (
          <div key={k}>
            <div className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
            <div className="truncate font-medium" title={String(v)}>{String(v)}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderCard = (node) => {
    const d = node.data;
    const isSelected = d.id === selectedNodeId;
    const typeLabel = d.type || d.category;
    const color = getTypeColor(typeLabel) || '#6B7280';
    const expanded = !!expandedCards[d.id];
    const details = detailsCache[d.id];

    const meta = d.metadata || {};

    // Decide body renderer based on type
    let body = null;
    if (expanded) {
      if (typeLabel === 'Data Extensions') {
        body = renderDEBody(details?.metadata || meta, expanded, d.id);
      } else if (typeLabel === 'Automations') {
        body = renderAutomationBody(details?.metadata || meta);
      } else if (typeLabel === 'SQL Queries') {
        body = renderQueryBody(details?.metadata || meta);
      } else if (typeLabel === 'Journeys') {
        body = renderJourneyBody(details?.metadata || meta);
      } else if (typeLabel === 'Triggered Sends') {
        body = renderSendBody(details?.metadata || meta);
      } else if (typeLabel === 'File Transfers' || typeLabel === 'Data Extracts') {
        body = renderFileBody(details?.metadata || meta, typeLabel);
      } else {
        body = renderGenericMeta(details?.metadata || meta);
      }
    }

    return (
      <div
        ref={el => { if (el) cardRefs.current[d.id] = el; }}
        className={`relative group rounded-lg border bg-white shadow-sm overflow-hidden cursor-pointer transition-all
          ${isSelected ? 'ring-2 ring-indigo-500' : 'hover:ring-1 hover:ring-gray-300'}
        `}
        onClick={() => onSelectNode(d.id)}
        onDoubleClick={(e) => { e.stopPropagation(); toggleExpand(d.id); }}
        style={{ zoom: `${zoom}%` }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium truncate" style={{ color }}>
              {d.label || d.id}
            </div>
            {d.type && (
              <div className="text-[11px] font-medium uppercase rounded-full px-2 py-0.5"
                style={{ backgroundColor: `${color}10`, color }}>
                {d.type}
              </div>
            )}
          </div>

          {body && (
            <div className="mt-2">
              {body}
            </div>
          )}
        </div>

        {/* Expand/collapse chevron */}
        <div className="absolute top-4 right-4 text-gray-400">
          {expanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M6 18L18 6" />
            </svg>
          )}
        </div>

        {/* Audit footer */}
        {expanded && (
          <div className="p-4 pt-0">
            {renderAuditFooter(details)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full" ref={containerRef}>
      {/* Columns for each type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DISPLAY_TYPES.map(type => (
          <div key={type} className="space-y-4">
            {/* Type header */}
            <div className="text-xs font-semibold text-gray-500 uppercase">{type}</div>

            {/* Node cards */}
            {grouped[type].map(node => (
              <div key={node.data.id} className="relative">
                {renderCard(node)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* SVG overlay for paths */}
      <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: -1 }}>
        <defs>
          {markerColors.map((color, i) => (
            <marker key={i} id={`arrow-${i}`} markerWidth="10" markerHeight="10" refX="5" refY="2.5" orient="auto">
              <polygon points="0,0 0,5 5,2.5" fill={color} />
            </marker>
          ))}
        </defs>
        <g>
          {paths.map((p, i) => (
            <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth="2"
              strokeDasharray={p.dash} markerEnd={`url(#arrow-${i})`} />
          ))}
        </g>
      </svg>
    </div>
  );
}
