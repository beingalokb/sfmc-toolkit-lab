import React, { useState, useRef, useEffect, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

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
  const cyRef = useRef(null);

  const objectTypes = Object.keys(mockObjectData);

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

  // Update graph based on selected objects
  const updateGraph = useCallback(() => {
    const nodes = [];
    const edges = [];

    Object.entries(selectedObjects).forEach(([category, objects]) => {
      Object.entries(objects).forEach(([objectId, isSelected]) => {
        if (isSelected) {
          const objectData = mockObjectData[category].find(obj => obj.id === objectId);
          nodes.push({
            data: {
              id: objectId,
              label: objectData.name,
              type: category,
              metadata: objectData
            },
            style: {
              'background-color': nodeColors[category] || '#6B7280',
              'label': objectData.name,
              'color': '#ffffff',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '12px',
              'width': '120px',
              'height': '40px',
              'shape': 'roundrectangle'
            }
          });
        }
      });
    });

    // Add some sample relationships (edges)
    if (nodes.length > 1) {
      // Example: SQL Query writes to Data Extension
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
            },
            style: {
              'line-color': '#94A3B8',
              'target-arrow-color': '#94A3B8',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'label': 'writes to',
              'font-size': '10px',
              'text-rotation': 'autorotate'
            }
          });
        }
      });

      // Example: Journey uses Data Extension
      const journeyNodes = nodes.filter(n => n.data.type === 'Journeys');
      journeyNodes.forEach((journeyNode, i) => {
        if (deNodes[i]) {
          edges.push({
            data: {
              id: `${journeyNode.data.id}-${deNodes[i].data.id}`,
              source: journeyNode.data.id,
              target: deNodes[i].data.id,
              label: 'uses'
            },
            style: {
              'line-color': '#10B981',
              'target-arrow-color': '#10B981',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'label': 'uses',
              'font-size': '10px',
              'text-rotation': 'autorotate'
            }
          });
        }
      });
    }

    setGraphElements([...nodes, ...edges]);
  }, [selectedObjects]);

  // Handle node click
  const handleNodeClick = useCallback((event) => {
    const node = event.target;
    const nodeData = node.data();
    setSelectedNode(nodeData);
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
                  {mockObjectData[category].map(object => (
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

              {mockMetadata[selectedNode.id] && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Metadata</h4>
                  <div className="space-y-3">
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
                  </div>
                </div>
              )}

              <div>
                <button
                  onClick={() => window.open(mockMetadata[selectedNode.id]?.mcUrl || '#', '_blank')}
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
