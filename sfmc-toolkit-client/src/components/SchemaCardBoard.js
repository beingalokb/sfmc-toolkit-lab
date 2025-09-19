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

    if (!fields || fields.length === 0) {
      // Show basic info if no fields
      const recordCount = meta?.recordCount || meta?.records;
      const status = meta?.status;
      if (recordCount || status) {
        return (
          <div className="text-[11px] text-gray-700 space-y-1">
            {recordCount && <div><span className="text-gray-500">Records:</span> {recordCount}</div>}
            {status && <div><span className="text-gray-500">Status:</span> {status}</div>}
          </div>
        );
      }
      return null;
    }
    
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
    const status = meta?.status;
    const lastRun = meta?.lastRun || meta?.lastRunDate;
    
    if (activities.length === 0 && !status && !lastRun) {
      return (
        <div className="text-[11px] text-gray-700">
          <span className="text-gray-500">Automation</span>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        {status && (
          <div className="text-[11px] text-gray-700">
            <span className="text-gray-500">Status:</span> <span className="font-medium">{status}</span>
          </div>
        )}
        {lastRun && (
          <div className="text-[11px] text-gray-700">
            <span className="text-gray-500">Last Run:</span> <span className="font-medium">{new Date(lastRun).toLocaleDateString()}</span>
          </div>
        )}
        {activities.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-700">Activities ({activities.length})</div>
            <ol className="mt-1 space-y-1 text-[11px] text-gray-700 list-decimal list-inside">
              {activities.slice(0, 5).map((a, idx) => (
                <li key={a.id || idx} className="truncate">
                  {(a.stepNumber || idx + 1)}. {a.type || a.activityType || 'Activity'}{a.name ? ` – ${a.name}` : ''}
                </li>
              ))}
              {activities.length > 5 && (
                <li className="text-gray-500">+{activities.length - 5} more…</li>
              )}
            </ol>
          </div>
        )}
      </div>
    );
  };

  const renderQueryBody = (meta) => {
    const target = meta?.targetDE || meta?.targetDe || meta?.destinationName;
    const sources = meta?.sourceDEs || meta?.sources || meta?.tables || [];
    const status = meta?.status;
    
    if (!target && sources.length === 0 && !status) {
      return (
        <div className="text-[11px] text-gray-700">
          <span className="text-gray-500">SQL Query</span>
        </div>
      );
    }
    
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {status && (
          <div>
            <span className="text-gray-500">Status:</span> <span className="font-medium">{status}</span>
          </div>
        )}
        {target && (
          <div>
            <span className="text-gray-500">Target DE:</span> <span className="font-medium">{target}</span>
          </div>
        )}
        {sources && sources.length > 0 && (
          <div>
            <div className="text-gray-500">Source DEs ({sources.length})</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {sources.slice(0, 3).map((s) => (
                <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-green-50 text-green-700 border border-green-100">{s}</span>
              ))}
              {sources.length > 3 && (
                <span className="text-gray-500">+{sources.length - 3} more</span>
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
    const status = meta?.status;
    
    if (entries.length === 0 && activities.length === 0 && !status) {
      return (
        <div className="text-[11px] text-gray-700">
          <span className="text-gray-500">Journey</span>
        </div>
      );
    }
    
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {status && (
          <div>
            <span className="text-gray-500">Status:</span> <span className="font-medium">{status}</span>
          </div>
        )}
        {entries && entries.length > 0 && (
          <div>
            <div className="text-gray-500">Entry Sources ({entries.length})</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {entries.slice(0, 2).map((e, i) => (
                <span key={e?.name || i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700 border border-purple-100">{e?.name || e}</span>
              ))}
              {entries.length > 2 && (
                <span className="text-gray-500">+{entries.length - 2} more</span>
              )}
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
    const status = meta?.status;
    
    if (!email && !classification && !status) {
      return (
        <div className="text-[11px] text-gray-700">
          <span className="text-gray-500">Triggered Send</span>
        </div>
      );
    }
    
    return (
      <div className="text-[11px] text-gray-700 space-y-1">
        {status && (
          <div>
            <span className="text-gray-500">Status:</span> <span className="font-medium">{status}</span>
          </div>
        )}
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
    if (!meta) {
      return (
        <div className="text-[11px] text-gray-700">
          <span className="text-gray-500">No additional details available</span>
        </div>
      );
    }
    
    // pick some common keys to display
    const keys = ['status', 'categoryPath', 'externalKey', 'description'];
    const items = keys.filter(k => meta[k]).map(k => ({ k, v: meta[k] }));
    
    if (items.length === 0) {
      return (
        <div className="text-[11px] text-gray-700">
          <span className="text-gray-500">Object details</span>
        </div>
      );
    }
    
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

    // Always show basic metadata, not just when expanded
    let body = null;
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

    return (
      <div
        key={d.id}
        ref={el => { cardRefs.current[d.id] = el; }}
        className={`bg-white border rounded-md shadow-sm mb-3 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-yellow-400' : 'hover:shadow'} border-gray-200`}
        onClick={() => onSelectNode && onSelectNode(d)}
        style={{ width: '100%' }}
      >
        {/* Header: Type + Name */}
        <div className="px-3 pt-3 pb-2 border-b bg-white rounded-t-md">
          <div className="flex items-center justify-between">
            <span
              className="mr-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
              style={{ backgroundColor: `${color}1A`, color }}
            >
              {typeLabel}
            </span>
            <button
              type="button"
              className="text-[11px] text-indigo-700 hover:text-indigo-900"
              onClick={(e) => { e.stopPropagation(); onExpandNode && onExpandNode(d.id); }}
            >
              Expand dependencies
            </button>
          </div>
          <div className="mt-1 font-semibold text-gray-900 truncate" title={d.label}>{d.label}</div>
          {meta.externalKey && (
            <div className="text-[11px] text-gray-500 truncate" title={meta.externalKey}>{meta.externalKey}</div>
          )}
        </div>

        {/* Body: Metadata */}
        <div className="px-3 py-2">
          {meta.description && !expanded && (
            <div className="text-xs text-gray-600 line-clamp-2">{meta.description}</div>
          )}

          {expanded && (
            <div className="mt-1">
              {!details && (
                <div className="text-xs text-gray-500">Loading details…</div>
              )}
              {details && (
                <div className="space-y-2">
                  {body}

                  {/* Generic metadata bits when expanded */}
                  {renderGenericMeta(details.metadata)}
                </div>
              )}
            </div>
          )}

          {/* Show body even when not expanded for basic info */}
          {!expanded && body && (
            <div className="mt-2">
              {body}
            </div>
          )}
        </div>

        {/* Footer: Audit info */}
        {expanded && (
          <div className="px-3 pb-3">
            {renderAuditFooter(details)}
          </div>
        )}

        {/* Actions */}
        <div className="px-3 pb-3 flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-800"
            onClick={(e) => { e.stopPropagation(); toggleExpand(d.id); }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-auto">
      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-30 bg-white border border-gray-200 rounded shadow-sm">
        <div className="flex">
          <button className="px-2 py-1 text-sm" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}>−</button>
          <div className="px-2 py-1 text-xs text-gray-600 border-l border-r">{Math.round(zoom * 100)}%</div>
          <button className="px-2 py-1 text-sm" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}>+</button>
        </div>
      </div>

      {/* Transform wrapper for zoom/pan sync (pan via scroll) */}
      <div className="relative transform-origin-top-left" style={{ transform: `scale(${zoom})` }}>
        {/* SVG overlay for relationship lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            {markerColors.map(color => (
              <marker
                id={`arrow-${color.replace('#', '')}`}
                key={color}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
                viewBox="0 0 10 6"
              >
                <path d="M0,0 L10,3 L0,6 Z" fill={color} />
              </marker>
            ))}
          </defs>
          {paths.map(p => (
            <g key={p.id}>
              <path
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={2}
                markerEnd={`url(#arrow-${p.color.replace('#', '')})`}
                strokeDasharray={p.dash}
                opacity={0.9}
              />
            </g>
          ))}
        </svg>

        {/* Columns with cards */}
        <div className="relative z-10 flex items-start gap-6 p-6 min-w-max">
          {DISPLAY_TYPES.map(type => (
            <div key={type} className="w-80 flex-shrink-0" ref={el => { columnRefs.current[type] = el; }}>
              <div className="sticky top-0 z-20 bg-gray-50 rounded-t-md border-b px-3 py-2 text-sm font-semibold text-gray-700">
                <div className="flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getTypeColor(type) }} />
                  {type}
                </div>
              </div>
              <div className="pt-2">
                {(grouped[type] || []).map(renderCard)}
                {(grouped[type] || []).length === 0 && (
                  <div className="text-xs text-gray-400 px-3 py-2">No items</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
