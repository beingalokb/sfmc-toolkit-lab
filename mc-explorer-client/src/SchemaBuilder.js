import React, { useState, useCallback, useRef } from 'react';
import './SchemaBuilder.css';

const SchemaBuilder = ({ 
  onSchemaChange, 
  initialSchema = null, 
  sfmcObjects = {}, 
  accessToken = null,
  subdomain = null 
}) => {
  const [schema, setSchema] = useState(initialSchema || { nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [isAddingEdge, setIsAddingEdge] = useState(false);
  const [edgeStart, setEdgeStart] = useState(null);
  const canvasRef = useRef(null);
  const [canvasDimensions] = useState({ width: 1000, height: 700 });

  const handleSchemaChange = useCallback((newSchema) => {
    setSchema(newSchema);
    if (onSchemaChange) onSchemaChange(newSchema);
  }, [onSchemaChange]);

  // --- Call backend to process SFMC relationships ---
  const loadFromSFMC = async () => {
    try {
      const storedSubdomain = subdomain || localStorage.getItem('subdomain');
      const storedAccessToken = accessToken || localStorage.getItem('accessToken');
      
      console.log('🔄 [Frontend] Calling schema/process with credentials:', { 
        hasToken: !!storedAccessToken, 
        tokenLength: storedAccessToken ? storedAccessToken.length : 0,
        subdomain: storedSubdomain || 'not found' 
      });

      const response = await fetch('/api/schema/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          schema: { nodes: [], edges: [] },
          accessToken: storedAccessToken,
          subdomain: storedSubdomain
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      console.log('📥 [Frontend] Backend response:', { 
        success: data.success, 
        nodes: data.schema?.nodes?.length || 0, 
        edges: data.schema?.edges?.length || 0,
        error: data.error 
      });

      if (data.success) {
        console.log('✅ [Frontend] Schema loaded successfully:', { 
          nodes: data.schema.nodes.length, 
          edges: data.schema.edges.length 
        });
        handleSchemaChange(data.schema);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('❌ [Frontend] Load from SFMC failed:', err);
      alert('Failed to load SFMC schema. Check console.');
    }
  };

  // --- Add / Delete functions (manual override mode) ---
  const addNode = (x, y, type, label) => {
    const newNode = {
      id: `node_${Date.now()}`,
      type,
      label: label || `New ${type}`,
      x, y,
      category: type,
      metadata: { isCustom: true, createdAt: new Date().toISOString() }
    };
    handleSchemaChange({ ...schema, nodes: [...schema.nodes, newNode] });
    setIsAddingNode(false);
  };

  const addEdge = (sourceId, targetId, label) => {
    const newEdge = {
      id: `edge_${Date.now()}`,
      source: sourceId,
      target: targetId,
      label: label || 'connects to',
      type: 'custom',
      metadata: { isCustom: true, createdAt: new Date().toISOString() }
    };
    handleSchemaChange({ ...schema, edges: [...schema.edges, newEdge] });
    setIsAddingEdge(false);
    setEdgeStart(null);
  };

  const deleteNode = (nodeId) => {
    handleSchemaChange({
      nodes: schema.nodes.filter(n => n.id !== nodeId),
      edges: schema.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    });
    setSelectedNode(null);
  };

  const deleteEdge = (edgeId) => {
    handleSchemaChange({ ...schema, edges: schema.edges.filter(e => e.id !== edgeId) });
  };

  // --- Canvas interactions ---
  const handleCanvasClick = (event) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (isAddingNode) {
      const type = prompt('Enter node type (Data Extensions, Automations, Queries, etc.):');
      const label = prompt('Enter node label:');
      if (type && label) addNode(x, y, type, label);
    }
    setSelectedNode(null);
  };

  const handleNodeClick = (node, event) => {
    event.stopPropagation();
    if (isAddingEdge) {
      if (!edgeStart) setEdgeStart(node);
      else if (edgeStart.id !== node.id) {
        const label = prompt('Enter edge label:');
        if (label) addEdge(edgeStart.id, node.id, label);
      }
    } else {
      setSelectedNode(node);
    }
  };

  // --- Export / Import ---
  const exportSchema = () => {
    const dataStr = JSON.stringify(schema, null, 2);
    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    link.download = 'schema.json';
    link.click();
  };

  const importSchema = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        handleSchemaChange(JSON.parse(e.target.result));
      } catch (err) {
        alert(`Error importing schema: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // --- JSX Render ---
  return (
    <div className="schema-builder">
      <div className="schema-toolbar">
        <button onClick={() => { setIsAddingNode(!isAddingNode); setIsAddingEdge(false); }}>Add Node</button>
        <button onClick={() => { setIsAddingEdge(!isAddingEdge); setIsAddingNode(false); }}>Add Edge</button>
        <button onClick={loadFromSFMC}>Load from SFMC</button>
        <button onClick={exportSchema}>Export</button>
        <input type="file" accept=".json" id="import-input" onChange={importSchema} style={{ display: 'none' }} />
        <button onClick={() => document.getElementById('import-input').click()}>Import</button>
        <button onClick={() => handleSchemaChange({ nodes: [], edges: [] })}>Clear All</button>
      </div>

      <div className="schema-canvas-container">
        <svg 
          ref={canvasRef}
          className="schema-canvas"
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          onClick={handleCanvasClick}
        >
          {/* Edges */}
          {schema.edges.map(edge => {
            const s = schema.nodes.find(n => n.id === edge.source);
            const t = schema.nodes.find(n => n.id === edge.target);
            if (!s || !t) return null;
            
            // Safe coordinates with fallback to grid layout
            const sIdx = schema.nodes.findIndex(n => n.id === s.id);
            const tIdx = schema.nodes.findIndex(n => n.id === t.id);
            const safeS = {
              x: s.x ?? (50 + (sIdx % 10) * 150),
              y: s.y ?? (50 + Math.floor(sIdx / 10) * 100)
            };
            const safeT = {
              x: t.x ?? (50 + (tIdx % 10) * 150), 
              y: t.y ?? (50 + Math.floor(tIdx / 10) * 100)
            };
            
            return (
              <g key={edge.id}>
                <line
                  x1={safeS.x + 60} y1={safeS.y + 25}
                  x2={safeT.x + 60} y2={safeT.y + 25}
                  stroke="#666" strokeWidth="2" markerEnd="url(#arrowhead)"
                />
                <text
                  x={(safeS.x + safeT.x) / 2 + 60}
                  y={(safeS.y + safeT.y) / 2 + 20}
                  fill="#333" fontSize="11" textAnchor="middle"
                >
                  {edge.label}
                </text>
                <circle
                  cx={(safeS.x + safeT.x) / 2 + 60}
                  cy={(safeS.y + safeT.y) / 2 + 25}
                  r="6"
                  fill="red" opacity="0.7"
                  onClick={() => deleteEdge(edge.id)}
                >
                  <title>Delete edge</title>
                </circle>
              </g>
            );
          })}

          {/* Nodes */}
          {schema.nodes.map((node, idx) => {
            // Safe coordinates with fallback to grid layout
            const x = node.x ?? (50 + (idx % 10) * 150);
            const y = node.y ?? (50 + Math.floor(idx / 10) * 100);
            
            return (
              <g key={node.id}>
                <rect
                  x={x} y={y}
                  width="120" height="50"
                  fill={selectedNode?.id === node.id ? '#e3f2fd' : '#f5f5f5'}
                  stroke={selectedNode?.id === node.id ? '#2196f3' : '#ccc'}
                  strokeWidth="2" rx="6"
                  onClick={(e) => handleNodeClick(node, e)}
                />
                <text x={x + 60} y={y + 25} textAnchor="middle" dominantBaseline="middle" fontSize="12">
                  {node.label.length > 20 ? node.label.substring(0, 20) + '…' : node.label}
                </text>
                <text x={x + 60} y={y + 42} textAnchor="middle" fontSize="9" fill="#666">
                  {node.type}
                </text>
              </g>
            );
          })}

          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
            </marker>
          </defs>
        </svg>
      </div>

      {selectedNode && (
        <div className="node-properties">
          <h3>Node Properties</h3>
          <p><strong>ID:</strong> {selectedNode.id}</p>
          <p><strong>Type:</strong> {selectedNode.type}</p>
          <p><strong>Label:</strong> {selectedNode.label}</p>
          <button onClick={() => deleteNode(selectedNode.id)}>Delete Node</button>
        </div>
      )}

      <div className="schema-stats">
        <p>Nodes: {schema.nodes.length}</p>
        <p>Edges: {schema.edges.length}</p>
        {isAddingNode && <p>Click on canvas to add node</p>}
        {isAddingEdge && !edgeStart && <p>Click on source node</p>}
        {isAddingEdge && edgeStart && <p>Click on target node</p>}
      </div>
    </div>
  );
};

export default SchemaBuilder;
