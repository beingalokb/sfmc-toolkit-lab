import React, { useState, useRef, useEffect, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

// API functions for backend integration
const fetchGraphData = async (selectedObjects = {}) => {
  try {
    const params = new URLSearchParams();
    
    // Send selected objects as JSON string
    if (Object.keys(selectedObjects).length > 0) {
      params.append('selectedObjects', JSON.stringify(selectedObjects));
    }
    
    const response = await fetch(`/graph?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching graph data:', error);
    throw error;
  }
};

const fetchNodeDetails = async (nodeId) => {
  try {
    const response = await fetch(`/graph/node/${nodeId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching node details:', error);
    throw error;
  }
};

const fetchObjects = async () => {
  try {
    const response = await fetch('/objects');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching objects:', error);
    throw error;
  }
};

const SchemaBuilder = () => {
  const [selectedObjects, setSelectedObjects] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [graphElements, setGraphElements] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // API state
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  
  // Objects data state
  const [objectData, setObjectData] = useState({});
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [objectsError, setObjectsError] = useState(null);
  
  // Search functionality
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredObjectData, setFilteredObjectData] = useState({});
  
  const cyRef = useRef(null);

  // Filter objects based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredObjectData(objectData);
      return;
    }
    
    const filtered = {};
    const searchLower = searchTerm.toLowerCase();
    
    Object.entries(objectData).forEach(([category, objects]) => {
      const filteredObjects = objects.filter(obj => 
        obj.name.toLowerCase().includes(searchLower) ||
        obj.description?.toLowerCase().includes(searchLower) ||
        obj.externalKey?.toLowerCase().includes(searchLower)
      );
      
      if (filteredObjects.length > 0) {
        filtered[category] = filteredObjects;
      }
    });
    
    setFilteredObjectData(filtered);
  }, [objectData, searchTerm]);

  const objectTypes = Object.keys(filteredObjectData);

  // Check if any objects are selected
  const hasSelectedObjects = Object.values(selectedObjects).some(categoryObj => 
    Object.values(categoryObj || {}).some(selected => selected)
  );

  // Color mapping for different object types (following your specification)
const OBJECT_TYPE_COLORS = {
  'Data Extensions': '#3B82F6',    // 🟦 Blue
  'SQL Queries': '#10B981',       // 🟩 Green  
  'Automations': '#F97316',       // 🟧 Orange
  'Journeys': '#8B5CF6',          // 🟪 Purple
  'Triggered Sends': '#EF4444',   // 🟥 Red
  'File Transfers': '#EAB308',    // 🟨 Yellow
  'Data Extracts': '#A16207',     // 🟫 Brown
  'Filters': '#06B6D4'            // 🟦 Cyan (keeping as distinguishable blue)
};

// Get color for object type
const getObjectTypeColor = (category) => {
  return OBJECT_TYPE_COLORS[category] || '#6B7280'; // Default gray
};

// Node colors mapping for graph styling (consistent with OBJECT_TYPE_COLORS)
const nodeColors = OBJECT_TYPE_COLORS;

// Get type from category for consistency
const getTypeFromCategory = (category) => {
  const mapping = {
    'Data Extensions': 'DataExtension',
    'SQL Queries': 'Query',
    'Automations': 'Automation',
    'Journeys': 'Journey',
    'Triggered Sends': 'TriggeredSend',
    'Filters': 'Filter',
    'File Transfers': 'FileTransfer',
    'Data Extracts': 'DataExtract'
  };
  return mapping[category] || category;
};

// Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Handle object selection
  const handleObjectSelect = (category, objectId, isSelected) => {
    setSelectedObjects(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [objectId]: isSelected
      }
    }));

    // Update graph when objects are selected/deselected
    updateGraph();
  };

  // Load objects data from API
  const loadObjectsData = useCallback(async () => {
    setObjectsLoading(true);
    setObjectsError(null);
    try {
      const data = await fetchObjects();
      setObjectData(data);
      console.log('✅ [Objects] Loaded from API:', Object.keys(data).map(key => `${key}: ${data[key].length}`));
    } catch (error) {
      setObjectsError(error.message);
      console.error('❌ [Objects] API Error:', error);
      // Set empty object data on error
      setObjectData({});
    } finally {
      setObjectsLoading(false);
    }
  }, []);

  // Load graph data from API
  const loadGraphData = useCallback(async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const data = await fetchGraphData(selectedObjects);
      return data;
    } catch (error) {
      setApiError(error.message);
      return { nodes: [], edges: [] };
    } finally {
      setApiLoading(false);
    }
  }, [selectedObjects]);

  // Update graph based on selected objects
  const updateGraph = useCallback(async () => {
    const graphData = await loadGraphData();
    
    // Apply styling to nodes and edges with better directional flow
    const styledNodes = graphData.nodes.map(node => {
      const isRelated = node.data.metadata?.isRelated === true;
      const baseColor = nodeColors[node.data.category] || nodeColors[node.data.type] || '#6B7280';
      
      return {
        ...node,
        style: {
          'background-color': isRelated ? `${baseColor}80` : baseColor, // 50% opacity for related objects
          'label': node.data.label,
          'color': '#ffffff',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-weight': isRelated ? 'normal' : 'bold',
          'width': '140px',
          'height': '50px',
          'shape': 'roundrectangle',
          'border-width': isRelated ? '1px' : '2px',
          'border-color': isRelated ? baseColor : '#ffffff',
          'border-style': isRelated ? 'dashed' : 'solid',
          'text-wrap': 'wrap',
          'text-max-width': '120px',
          'opacity': isRelated ? 0.8 : 1.0
        }
      };
    });

    // Enhanced edge styling with directional flow and relationship-specific colors
    const styledEdges = graphData.edges.map(edge => {
      const relationshipColors = {
        'writes_to': '#10B981',           // Green for data writes
        'reads_from': '#3B82F6',         // Blue for data reads
        'imports_to_de': '#F97316',      // Orange for data imports
        'journey_entry_source': '#8B5CF6', // Purple for journey entries
        'contains_query': '#6B7280',     // Gray for containment
        'uses_in_decision': '#EAB308',   // Yellow for decision logic
        'subscriber_source': '#EF4444',  // Red for email sources
        'sends_email': '#EC4899',        // Pink for email sends
        'provides_data_to': '#06B6D4',   // Cyan for data flow
        'updates_de': '#84CC16',         // Lime for updates
        'default': '#94A3B8'             // Default gray
      };
      
      const edgeColor = relationshipColors[edge.data.type] || relationshipColors.default;
      
      return {
        ...edge,
        style: {
          'line-color': edgeColor,
          'target-arrow-color': edgeColor,
          'target-arrow-shape': 'triangle',
          'target-arrow-size': '12px',
          'curve-style': 'bezier',
          'label': edge.data.label,
          'font-size': '10px',
          'font-weight': '600',
          'text-rotation': 'autorotate',
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.9,
          'text-background-padding': '3px',
          'text-border-color': edgeColor,
          'text-border-width': '1px',
          'text-border-opacity': 0.3,
          'width': '3px',
          'opacity': 0.8
        }
      };
    });

    setGraphElements([...styledNodes, ...styledEdges]);
  }, [selectedObjects, loadGraphData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle node click
  const handleNodeClick = useCallback(async (event) => {
    const node = event.target;
    const nodeData = node.data();
    
    // Fetch detailed node information from API
    try {
      const nodeDetails = await fetchNodeDetails(nodeData.id);
      setSelectedNode({
        ...nodeData,
        apiDetails: nodeDetails
      });
    } catch (error) {
      console.error('Error fetching node details:', error);
      // Fall back to basic node data
      setSelectedNode(nodeData);
    }
    
    setDrawerOpen(true);
  }, []);

  // Cytoscape layout and style
  const cytoscapeStylesheet = [
    {
      selector: 'node',
      style: {
        'width': 120,
        'height': 40,
        'shape': 'roundrectangle',
        'background-color': '#6B7280',
        'label': 'data(label)',
        'color': '#ffffff',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'font-weight': 'bold',
        'text-wrap': 'wrap',
        'text-max-width': '100px'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#94A3B8',
        'target-arrow-color': '#94A3B8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '10px',
        'text-rotation': 'autorotate',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.8,
        'text-background-padding': '2px'
      }
    }
  ];

  const layout = {
    name: 'cose',
    animate: true,
    animationDuration: 1000,
    animationEasing: 'ease-out',
    nodeDimensionsIncludeLabels: true,
    fit: true,
    padding: 50,
    componentSpacing: 150,
    nodeOverlap: 30,
    idealEdgeLength: 120,
    edgeElasticity: 200,
    nestingFactor: 12,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
    nodeRepulsion: function(node) { return 400000; }
  };

  useEffect(() => {
    updateGraph();
  }, [selectedObjects, updateGraph]);

  // Load objects on mount
  useEffect(() => {
    loadObjectsData();
  }, [loadObjectsData]);

  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.on('tap', 'node', handleNodeClick);
      return () => {
        if (cyRef.current) {
          cyRef.current.removeListener('tap', 'node', handleNodeClick);
        }
      };
    }
  }, [handleNodeClick]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Schema Objects</h2>
          <p className="text-sm text-gray-600">Select objects to visualize relationships</p>
          
          {/* Search Bar */}
          <div className="mt-3 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search objects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {searchTerm && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          
          {/* Search Results Summary */}
          {searchTerm && (
            <div className="mt-2 text-xs text-gray-500">
              {Object.keys(filteredObjectData).length === 0 ? (
                <span>No objects match "{searchTerm}"</span>
              ) : (
                <span>
                  {Object.values(filteredObjectData).reduce((sum, objects) => sum + objects.length, 0)} objects 
                  in {Object.keys(filteredObjectData).length} categories match "{searchTerm}"
                </span>
              )}
            </div>
          )}
          
          {/* API Status */}
          <div className="mt-3">
            {(apiLoading || objectsLoading) && (
              <div className="flex items-center text-xs text-blue-600">
                <svg className="animate-spin -ml-1 mr-2 h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 008-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {objectsLoading ? 'Loading objects...' : 'Loading from API...'}
              </div>
            )}
            {(apiError || objectsError) && (
              <div className="text-xs text-red-600 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                API Error: {apiError || objectsError}
              </div>
            )}
            {!apiLoading && !apiError && !objectsLoading && !objectsError && (
              <div className="text-xs text-green-600 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Connected to SFMC API
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 space-y-2">
          {objectTypes.map(category => (
            <div key={category} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getObjectTypeColor(category) }}
                  ></div>
                  <span className="font-medium text-gray-900">{category}</span>
                </div>
                <svg
                  className={`w-5 h-5 transform transition-transform ${
                    expandedCategories[category] ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {expandedCategories[category] && (
                <div className="px-4 pb-4 space-y-2">
                  {filteredObjectData[category].map(object => (
                    <label key={object.id} className="flex items-center space-x-3 py-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedObjects[category]?.[object.id] || false}
                        onChange={(e) => handleObjectSelect(category, object.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getObjectTypeColor(category) }}
                      ></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {object.name}
                        </div>
                        {object.externalKey && (
                          <div className="text-xs text-gray-500 truncate">
                            {object.externalKey}
                          </div>
                        )}
                        {object.description && (
                          <div className="text-xs text-gray-500 truncate">
                            {object.description}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Center Graph Canvas */}
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          {hasSelectedObjects ? (
            <CytoscapeComponent
              elements={graphElements}
              style={{ width: '100%', height: '100%' }}
              stylesheet={cytoscapeStylesheet}
              layout={layout}
              cy={(cy) => { cyRef.current = cy; }}
              boxSelectionEnabled={false}
              autounselectify={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md mx-auto">
                <svg className="w-20 h-20 mx-auto text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Welcome to Schema Builder</h3>
                <p className="text-gray-600 mb-4">
                  Visualize relationships between your Salesforce Marketing Cloud assets
                </p>
                <div className="text-sm text-gray-500 space-y-2">
                  <p className="flex items-center justify-center space-x-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span>🟦 Data Extensions are the foundation of your data flow</span>
                  </p>
                  <p className="flex items-center justify-center space-x-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span>🟩 SQL Queries read from and write to Data Extensions</span>
                  </p>
                  <p className="flex items-center justify-center space-x-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    <span>🟪 Journeys use Data Extensions for entry and decisions</span>
                  </p>
                  <p className="flex items-center justify-center space-x-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                    <span>🟧 Automations orchestrate data flows and activities</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Detail Drawer */}
      <div className={`fixed inset-y-0 right-0 z-50 w-96 bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Object Details</h3>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {selectedNode && (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Basic Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Name</label>
                    <p className="text-sm text-gray-900">{selectedNode.label}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Type</label>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${nodeColors[selectedNode.type]}20`, color: nodeColors[selectedNode.type] }}>
                      {selectedNode.type}
                    </span>
                  </div>
                  {selectedNode.metadata?.externalKey && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">External Key</label>
                      <p className="text-sm text-gray-900 font-mono">{selectedNode.metadata.externalKey}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata section - show API details if available */}
              {selectedNode.apiDetails && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Metadata
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Live API Data
                    </span>
                  </h4>
                  <div className="space-y-3">
                    {/* API Data */}
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Status</label>
                        <p className="text-sm text-gray-900">{selectedNode.apiDetails.status}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Last Modified</label>
                        <p className="text-sm text-gray-900">
                          {new Date(selectedNode.apiDetails.lastModified).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Created Date</label>
                        <p className="text-sm text-gray-900">
                          {new Date(selectedNode.apiDetails.createdDate).toLocaleString()}
                        </p>
                      </div>
                      {selectedNode.apiDetails.metadata?.recordCount && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Record Count</label>
                          <p className="text-sm text-gray-900">
                            {selectedNode.apiDetails.metadata.recordCount.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {selectedNode.apiDetails.metadata?.description && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Description</label>
                          <p className="text-sm text-gray-900">{selectedNode.apiDetails.metadata.description}</p>
                        </div>
                      )}
                      {selectedNode.apiDetails.metadata?.fields && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Fields</label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedNode.apiDetails.metadata.fields.map(field => (
                              <span key={field} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  </div>
                </div>
              )}
              {!selectedNode.apiDetails && (
                <div className="text-sm text-gray-500 italic">
                  No additional details available
                </div>
              )}

              <div>
                <button
                  onClick={() => {
                    const url = selectedNode.apiDetails?.metadata?.mcUrl || '#';
                    window.open(url, '_blank');
                  }}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open in Marketing Cloud
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay for drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-25"
          onClick={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
};

export default SchemaBuilder;
