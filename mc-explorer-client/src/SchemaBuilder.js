import React, { useState, useRef, useEffect, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

// API functions for backend integration
const fetchGraphData = async (type = null, keys = null, mode = 'overview') => {
  try {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (keys) params.append('keys', keys);
    if (mode) params.append('mode', mode);
    
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

const fetchObjects = async (mode = 'mock') => {
  try {
    const response = await fetch(`/objects?mode=${mode}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching objects:', error);
    throw error;
  }
};

// Mock data for the sidebar
const mockObjectData = {
  'Data Extensions': [
    { id: 'de-1', name: 'Customer_Master_DE', externalKey: 'customer_master_001' },
    { id: 'de-2', name: 'Email_Preferences_DE', externalKey: 'email_prefs_001' },
    { id: 'de-3', name: 'Purchase_History_DE', externalKey: 'purchase_hist_001' },
    { id: 'de-4', name: 'Journey_Activity_DE', externalKey: 'journey_activity_001' },
    { id: 'de-5', name: 'Campaign_Results_DE', externalKey: 'campaign_results_001' }
  ],
  'Automations': [
    { id: 'auto-1', name: 'Daily_Data_Import', description: 'Import customer data daily' },
    { id: 'auto-2', name: 'Email_Cleanup_Process', description: 'Clean bounced emails' },
    { id: 'auto-3', name: 'Journey_Data_Sync', description: 'Sync journey completion data' }
  ],
  'Journeys': [
    { id: 'journey-1', name: 'Welcome_Series', status: 'Active' },
    { id: 'journey-2', name: 'Abandonment_Recovery', status: 'Active' },
    { id: 'journey-3', name: 'Birthday_Campaign', status: 'Paused' }
  ],
  'SQL Queries': [
    { id: 'sql-1', name: 'Customer_Segmentation_Query', queryType: 'Data Extension Activity' },
    { id: 'sql-2', name: 'Email_Performance_Report', queryType: 'Send Job Activity' },
    { id: 'sql-3', name: 'Journey_Attribution_Query', queryType: 'Journey Builder Activity' }
  ],
  'Triggered Sends': [
    { id: 'ts-1', name: 'Password_Reset_Email', status: 'Active' },
    { id: 'ts-2', name: 'Order_Confirmation', status: 'Active' },
    { id: 'ts-3', name: 'Weekly_Newsletter', status: 'Paused' }
  ],
  'Filters': [
    { id: 'filter-1', name: 'Active_Subscribers_Filter', description: 'Subscribers with active status' },
    { id: 'filter-2', name: 'High_Value_Customers', description: 'Customers with >$1000 lifetime value' }
  ],
  'File Transfers': [
    { id: 'ft-1', name: 'Daily_Customer_Export', destination: 'SFTP Server' },
    { id: 'ft-2', name: 'Campaign_Data_Import', source: 'External API' }
  ],
  'Data Extracts': [
    { id: 'extract-1', name: 'Monthly_Performance_Extract', schedule: 'Monthly' },
    { id: 'extract-2', name: 'Customer_Export_Extract', schedule: 'Daily' }
  ]
};

// Mock metadata for detail drawer
const mockMetadata = {
  'de-1': {
    name: 'Customer_Master_DE',
    externalKey: 'customer_master_001',
    lastModified: '2024-08-25T10:30:00Z',
    recordCount: 45672,
    fields: ['EmailAddress', 'FirstName', 'LastName', 'CustomerID', 'JoinDate'],
    mcUrl: 'https://mc.exacttarget.com/cloud/#app/DataExtensions/Details/12345'
  },
  'de-2': {
    name: 'Email_Preferences_DE',
    externalKey: 'email_prefs_001',
    lastModified: '2024-08-24T15:45:00Z',
    recordCount: 23890,
    fields: ['EmailAddress', 'NewsletterOpt', 'PromoOpt', 'Frequency'],
    mcUrl: 'https://mc.exacttarget.com/cloud/#app/DataExtensions/Details/12346'
  },
  // Add more metadata as needed...
};

const SchemaBuilder = () => {
  const [selectedObjects, setSelectedObjects] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [graphElements, setGraphElements] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Backend integration state
  const [dataSource, setDataSource] = useState('mock'); // 'mock' or 'api'
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  
  // Objects data state
  const [objectData, setObjectData] = useState(mockObjectData);
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [objectsError, setObjectsError] = useState(null);
  
  const cyRef = useRef(null);

  const objectTypes = Object.keys(objectData);

  // Node colors by type
  const nodeColors = {
    'Data Extensions': '#3B82F6', // blue
    'SQL Queries': '#8B5CF6', // purple
    'Automations': '#6B7280', // gray
    'Journeys': '#10B981', // green
    'Triggered Sends': '#F59E0B', // orange
    'File Transfers': '#14B8A6', // teal
    'Data Extracts': '#14B8A6', // teal
    'Filters': '#EF4444' // red
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

  // Load objects data from API or mock
  const loadObjectsData = useCallback(async () => {
    if (dataSource === 'api') {
      setObjectsLoading(true);
      setObjectsError(null);
      try {
        const data = await fetchObjects('live');
        setObjectData(data);
        console.log('✅ [Objects] Loaded from API:', Object.keys(data).map(key => `${key}: ${data[key].length}`));
      } catch (error) {
        setObjectsError(error.message);
        console.error('❌ [Objects] API Error:', error);
        // Fall back to mock data on error
        setObjectData(mockObjectData);
      } finally {
        setObjectsLoading(false);
      }
    } else {
      // Mock mode - use hardcoded data
      setObjectData(mockObjectData);
      setObjectsError(null);
      console.log('🎭 [Objects] Using mock data');
    }
  }, [dataSource]);

  // Load graph data from API or mock
  const loadGraphData = useCallback(async () => {
    if (dataSource === 'api') {
      setApiLoading(true);
      setApiError(null);
      try {
        const data = await fetchGraphData();
        return data;
      } catch (error) {
        setApiError(error.message);
        return { nodes: [], edges: [] };
      } finally {
        setApiLoading(false);
      }
    } else {
      // Return mock data in the same format as API
      return generateMockGraphFromSelectedObjects();
    }
  }, [dataSource, selectedObjects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate mock graph data based on selected objects (existing logic)
  const generateMockGraphFromSelectedObjects = () => {
    const nodes = [];
    const edges = [];

    Object.entries(selectedObjects).forEach(([category, objects]) => {
      Object.entries(objects).forEach(([objectId, isSelected]) => {
        if (isSelected) {
          const objData = objectData[category].find(obj => obj.id === objectId);
          nodes.push({
            data: {
              id: objectId,
              label: objData.name,
              type: category,
              metadata: objData
            }
          });
        }
      });
    });

    // Add sample relationships (existing edge logic)
    if (nodes.length > 1) {
      const sqlNodes = nodes.filter(n => n.data.type === 'SQL Queries');
      const deNodes = nodes.filter(n => n.data.type === 'Data Extensions');
      
      sqlNodes.forEach((sqlNode, i) => {
        if (deNodes[i]) {
          edges.push({
            data: {
              id: `${sqlNode.data.id}-${deNodes[i].data.id}`,
              source: sqlNode.data.id,
              target: deNodes[i].data.id,
              label: 'writes to'
            }
          });
        }
      });

      const journeyNodes = nodes.filter(n => n.data.type === 'Journeys');
      journeyNodes.forEach((journeyNode, i) => {
        if (deNodes[i]) {
          edges.push({
            data: {
              id: `${journeyNode.data.id}-${deNodes[i].data.id}`,
              source: journeyNode.data.id,
              target: deNodes[i].data.id,
              label: 'uses'
            }
          });
        }
      });
    }

    return { nodes, edges };
  };

  // Update graph based on selected objects (modified to handle both data sources)
  const updateGraph = useCallback(async () => {
    if (dataSource === 'mock' && Object.keys(selectedObjects).length === 0) {
      setGraphElements([]);
      return;
    }

    const graphData = await loadGraphData();
    
    // Apply styling to nodes and edges
    const styledNodes = graphData.nodes.map(node => ({
      ...node,
      style: {
        'background-color': nodeColors[node.data.type] || '#6B7280',
        'label': node.data.label,
        'color': '#ffffff',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'width': '120px',
        'height': '40px',
        'shape': 'roundrectangle'
      }
    }));

    const styledEdges = graphData.edges.map(edge => ({
      ...edge,
      style: {
        'line-color': edge.data.label === 'writes to' ? '#94A3B8' : '#10B981',
        'target-arrow-color': edge.data.label === 'writes to' ? '#94A3B8' : '#10B981',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': edge.data.label,
        'font-size': '10px',
        'text-rotation': 'autorotate'
      }
    }));

    setGraphElements([...styledNodes, ...styledEdges]);
  }, [dataSource, selectedObjects, loadGraphData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle node click
  const handleNodeClick = useCallback(async (event) => {
    const node = event.target;
    const nodeData = node.data();
    
    if (dataSource === 'api') {
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
    } else {
      // Use mock data
      setSelectedNode(nodeData);
    }
    
    setDrawerOpen(true);
  }, [dataSource]);

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
    animationDuration: 500,
    nodeDimensionsIncludeLabels: true,
    fit: true,
    padding: 30,
    componentSpacing: 100,
    nodeOverlap: 20,
    idealEdgeLength: 100,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000
  };

  useEffect(() => {
    updateGraph();
  }, [selectedObjects, updateGraph]);

  // Reload graph when data source changes
  useEffect(() => {
    updateGraph();
  }, [dataSource, updateGraph]);

  // Load objects when data source changes
  useEffect(() => {
    loadObjectsData();
  }, [dataSource, loadObjectsData]);

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
          
          {/* Data Source Toggle */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Data Source:</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setDataSource('mock')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  dataSource === 'mock' 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Mock
              </button>
              <button
                onClick={() => setDataSource('api')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  dataSource === 'api' 
                    ? 'bg-green-100 text-green-800 border border-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                API
              </button>
            </div>
          </div>
          
          {/* API Status */}
          {dataSource === 'api' && (
            <div className="mt-2">
              {(apiLoading || objectsLoading) && (
                <div className="flex items-center text-xs text-blue-600">
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
                  Connected to API
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 space-y-2">
          {objectTypes.map(category => (
            <div key={category} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">{category}</span>
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
                  {objectData[category].map(object => (
                    <label key={object.id} className="flex items-center space-x-3 py-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedObjects[category]?.[object.id] || false}
                        onChange={(e) => handleObjectSelect(category, object.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
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
          {graphElements.length > 0 ? (
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
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No objects selected</h3>
                <p className="text-gray-600">Select objects from the sidebar to visualize their relationships</p>
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

              {/* Metadata section - show API details if available, otherwise fall back to mock */}
              {(selectedNode.apiDetails || mockMetadata[selectedNode.id]) && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Metadata
                    {selectedNode.apiDetails && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Live API Data
                      </span>
                    )}
                  </h4>
                  <div className="space-y-3">
                    {selectedNode.apiDetails ? (
                      // API Data
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
                    ) : (
                      // Mock Data (existing logic)
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Last Modified</label>
                          <p className="text-sm text-gray-900">
                            {new Date(mockMetadata[selectedNode.id].lastModified).toLocaleString()}
                          </p>
                        </div>
                        {mockMetadata[selectedNode.id].recordCount && (
                          <div>
                            <label className="text-sm font-medium text-gray-700">Record Count</label>
                            <p className="text-sm text-gray-900">
                              {mockMetadata[selectedNode.id].recordCount.toLocaleString()}
                            </p>
                          </div>
                        )}
                        {mockMetadata[selectedNode.id].fields && (
                          <div>
                            <label className="text-sm font-medium text-gray-700">Fields</label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {mockMetadata[selectedNode.id].fields.map(field => (
                                <span key={field} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <button
                  onClick={() => {
                    const url = selectedNode.apiDetails?.metadata?.mcUrl || 
                               mockMetadata[selectedNode.id]?.mcUrl || 
                               '#';
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
