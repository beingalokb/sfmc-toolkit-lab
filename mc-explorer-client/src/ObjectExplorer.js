import React, { useState, useEffect } from 'react';
import './ObjectExplorer.css';

const ObjectExplorer = ({ 
  accessToken = null,
  subdomain = null 
}) => {
  const [sfmcObjects, setSfmcObjects] = useState({});
  const [filteredObjects, setFilteredObjects] = useState({});
  const [selectedObject, setSelectedObject] = useState(null);
  const [navigationHistory, setNavigationHistory] = useState([]); // Track navigation history
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Object type configurations
  const objectTypes = [
    { key: 'Data Extensions', label: 'Data Extensions', icon: '📊' },
    { key: 'Automations', label: 'Automations', icon: '🔄' },
    { key: 'Journeys', label: 'Journeys', icon: '🛤️' },
    { key: 'SQL Queries', label: 'Queries', icon: '🔍' },
    { key: 'Triggered Sends', label: 'Triggered Sends', icon: '📧' },
    { key: 'Data Filters', label: 'Data Filters', icon: '🔧' },
    { key: 'File Transfers', label: 'File Transfers', icon: '📁' },
    { key: 'Data Extracts', label: 'Data Extracts', icon: '📤' }
  ];

  // Load SFMC objects
  const loadSFMCObjects = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const storedSubdomain = subdomain || localStorage.getItem('subdomain');
      const storedAccessToken = accessToken || localStorage.getItem('accessToken');
      
      console.log('🔄 [ObjectExplorer] Loading SFMC objects...');

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

      if (data.success) {
        // Store the full schema data for relationship analysis
        const fullSchema = data.schema;
        
        // Extract SFMC objects from the processed schema
        const objects = {};
        
        // Group nodes by category
        fullSchema.nodes.forEach(node => {
          let category = node.category;
          
          // Normalize category names for compatibility
          if (category === 'Filters') category = 'Data Filters';
          
          if (!objects[category]) {
            objects[category] = [];
          }
          
          objects[category].push({
            id: node.id,
            name: node.label,
            type: node.type,
            category: category,
            metadata: node.metadata || {},
            x: node.x,
            y: node.y
          });
        });

        setSfmcObjects(objects);
        setFilteredObjects(objects);
        
        // Store edges for relationship analysis
        window.schemaEdges = fullSchema.edges || [];
        window.schemaNodes = fullSchema.nodes || [];
        
        // Debug logging for category mismatches
        console.log('✅ [ObjectExplorer] SFMC objects loaded:');
        Object.entries(objects).forEach(([category, items]) => {
          console.log(`   ${category}: ${items.length} items`);
          if (items.length > 0) {
            console.log(`     Sample: ${items[0].name} (ID: ${items[0].id})`);
          }
        });
        console.log('✅ [ObjectExplorer] Total categories:', Object.keys(objects).length);
        console.log('✅ [ObjectExplorer] Expected categories:', objectTypes.map(ot => ot.key));
        console.log('✅ [ObjectExplorer] Relationships loaded:', fullSchema.edges?.length || 0, 'edges');
      } else {
        throw new Error(data.error || 'Failed to load SFMC objects');
      }
    } catch (err) {
      console.error('❌ [ObjectExplorer] Failed to load SFMC objects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter objects based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredObjects(sfmcObjects);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const filtered = {};
    
    Object.entries(sfmcObjects).forEach(([category, objects]) => {
      const matchingObjects = objects.filter(obj => {
        const name = (obj.name || '').toLowerCase();
        const type = (obj.type || '').toLowerCase();
        const id = (obj.id || '').toLowerCase();
        const customerKey = (obj.customerKey || '').toLowerCase();
        const description = (obj.description || '').toLowerCase();
        
        return name.includes(searchLower) ||
               type.includes(searchLower) ||
               id.includes(searchLower) ||
               customerKey.includes(searchLower) ||
               description.includes(searchLower);
      });
      
      if (matchingObjects.length > 0) {
        filtered[category] = matchingObjects;
      }
    });
    
    console.log(`🔍 [ObjectExplorer] Search for "${searchTerm}" found:`, 
      Object.entries(filtered).map(([cat, objs]) => `${cat}: ${objs.length}`));
    
    setFilteredObjects(filtered);
  }, [searchTerm, sfmcObjects]);

  // Get relationships for selected object using schema edges
  const getObjectRelationships = (object) => {
    const relationships = [];
    const edges = window.schemaEdges || [];
    const nodes = window.schemaNodes || [];
    
    // Create a map of node IDs to node objects for quick lookup
    const nodeMap = {};
    nodes.forEach(node => {
      nodeMap[node.id] = node;
    });
    
    // Find outgoing relationships (this object -> other objects)
    const outgoingEdges = edges.filter(edge => edge.source === object.id);
    outgoingEdges.forEach(edge => {
      const targetNode = nodeMap[edge.target];
      if (targetNode) {
        relationships.push({
          type: 'outgoing',
          relationship: edge.label || edge.type || 'connects to',
          target: targetNode.label || targetNode.id,
          targetCategory: targetNode.category || targetNode.type,
          description: `${edge.label || edge.type || 'Connected to'}: ${targetNode.label}`,
          targetId: targetNode.id
        });
      }
    });
    
    // Find incoming relationships (other objects -> this object)
    const incomingEdges = edges.filter(edge => edge.target === object.id);
    incomingEdges.forEach(edge => {
      const sourceNode = nodeMap[edge.source];
      if (sourceNode) {
        relationships.push({
          type: 'incoming',
          relationship: edge.label || edge.type || 'connected from',
          target: sourceNode.label || sourceNode.id,
          targetCategory: sourceNode.category || sourceNode.type,
          description: `Used by ${sourceNode.category}: ${sourceNode.label}`,
          targetId: sourceNode.id
        });
      }
    });
    
    // Add metadata-based relationships as fallback
    if (object.metadata) {
      // Automation steps and activities
      if (object.category === 'Automations' && object.metadata.steps) {
        object.metadata.steps.forEach((step, stepIdx) => {
          if (step.activities) {
            step.activities.forEach((activity, actIdx) => {
              relationships.push({
                type: 'contains',
                relationship: 'executes',
                target: activity.name || `Activity ${actIdx + 1}`,
                targetCategory: 'Activity',
                description: `Step ${step.step}: ${activity.objectTypeId || 'Activity'}`,
                targetId: `${object.id}_step_${stepIdx}_activity_${actIdx}`
              });
              
              // Target Data Extensions from activities
              if (activity.targetDataExtensions) {
                activity.targetDataExtensions.forEach(de => {
                  relationships.push({
                    type: 'outgoing',
                    relationship: 'targets',
                    target: de.name,
                    targetCategory: 'Data Extensions',
                    description: `Targets Data Extension: ${de.name}`,
                    targetId: de.id || de.key
                  });
                });
              }
            });
          }
        });
      }
      
      // Journey entry sources
      if (object.category === 'Journeys' && object.metadata.entrySource) {
        if (object.metadata.entrySource.dataExtensionId) {
          relationships.push({
            type: 'incoming',
            relationship: 'entry source',
            target: 'Data Extension',
            targetCategory: 'Data Extensions',
            description: `Entry Source: Data Extension ID ${object.metadata.entrySource.dataExtensionId}`,
            targetId: object.metadata.entrySource.dataExtensionId
          });
        }
      }
      
      // Triggered Send data extensions
      if (object.category === 'Triggered Sends' && object.metadata.dataExtensionId) {
        relationships.push({
          type: 'outgoing',
          relationship: 'uses',
          target: 'Subscriber Data Extension',
          targetCategory: 'Data Extensions',
          description: `Uses Data Extension ID: ${object.metadata.dataExtensionId}`,
          targetId: object.metadata.dataExtensionId
        });
      }

      // Data Extension relationships to automations and journeys
      if (object.category === 'Data Extensions') {
        // Find automations that use this DE
        Object.values(sfmcObjects).flat().forEach(otherObject => {
          if (otherObject.category === 'Automations' && otherObject.metadata?.steps) {
            otherObject.metadata.steps.forEach(step => {
              if (step.activities) {
                step.activities.forEach(activity => {
                  if (activity.targetDataExtensions) {
                    activity.targetDataExtensions.forEach(de => {
                      if (de.name === object.name || de.id === object.id || de.key === object.id) {
                        relationships.push({
                          type: 'incoming',
                          relationship: 'used by automation',
                          target: otherObject.name,
                          targetCategory: 'Automations',
                          description: `Used by Automation: ${otherObject.name}`,
                          targetId: otherObject.id
                        });
                      }
                    });
                  }
                });
              }
            });
          }
          
          // Find journeys that use this DE as entry source
          if (otherObject.category === 'Journeys' && otherObject.metadata?.entrySource?.dataExtensionId === object.id) {
            relationships.push({
              type: 'incoming',
              relationship: 'entry source for journey',
              target: otherObject.name,
              targetCategory: 'Journeys',
              description: `Entry source for Journey: ${otherObject.name}`,
              targetId: otherObject.id
            });
          }
          
          // Find triggered sends that use this DE
          if (otherObject.category === 'Triggered Sends' && otherObject.metadata?.dataExtensionId === object.id) {
            relationships.push({
              type: 'incoming',
              relationship: 'used by triggered send',
              target: otherObject.name,
              targetCategory: 'Triggered Sends',
              description: `Used by Triggered Send: ${otherObject.name}`,
              targetId: otherObject.id
            });
          }
        });
      }

      // Data Filter relationships
      if (object.category === 'Data Filters') {
        // Find automations that use this filter
        Object.values(sfmcObjects).flat().forEach(otherObject => {
          if (otherObject.category === 'Automations' && otherObject.metadata?.steps) {
            otherObject.metadata.steps.forEach(step => {
              if (step.activities) {
                step.activities.forEach(activity => {
                  // Check if activity references this filter
                  if (activity.filterDefinitionId === object.id || 
                      activity.filterName === object.name ||
                      (activity.properties && activity.properties.filterDefinitionId === object.id)) {
                    relationships.push({
                      type: 'incoming',
                      relationship: 'used by automation',
                      target: otherObject.name,
                      targetCategory: 'Automations',
                      description: `Filter used by Automation: ${otherObject.name}`,
                      targetId: otherObject.id
                    });
                  }
                });
              }
            });
          }
          
          // Find journeys that use this filter
          if (otherObject.category === 'Journeys' && otherObject.metadata?.goals) {
            otherObject.metadata.goals.forEach(goal => {
              if (goal.filterDefinitionId === object.id || goal.filterName === object.name) {
                relationships.push({
                  type: 'incoming',
                  relationship: 'used by journey',
                  target: otherObject.name,
                  targetCategory: 'Journeys',
                  description: `Filter used by Journey: ${otherObject.name}`,
                  targetId: otherObject.id
                });
              }
            });
          }
        });
        
        // Check if this filter is based on a Data Extension
        if (object.metadata?.dataSourceId || object.metadata?.dataExtensionId) {
          const sourceDE = Object.values(sfmcObjects).flat().find(de => 
            de.category === 'Data Extensions' && 
            (de.id === object.metadata.dataSourceId || de.id === object.metadata.dataExtensionId)
          );
          if (sourceDE) {
            relationships.push({
              type: 'outgoing',
              relationship: 'filters data from',
              target: sourceDE.name,
              targetCategory: 'Data Extensions',
              description: `Filters data from Data Extension: ${sourceDE.name}`,
              targetId: sourceDE.id
            });
          }
        }
      }

      // SQL Query relationships
      if (object.category === 'SQL Queries') {
        // Find source Data Extensions from SQL parsing
        if (object.metadata?.sourceDataExtensions) {
          object.metadata.sourceDataExtensions.forEach(sourceDEName => {
            const sourceDE = Object.values(sfmcObjects).flat().find(de => 
              de.category === 'Data Extensions' && 
              (de.name === sourceDEName || de.metadata?.name === sourceDEName)
            );
            
            if (sourceDE) {
              relationships.push({
                type: 'incoming',
                relationship: 'reads from',
                target: sourceDE.name,
                targetCategory: 'Data Extensions',
                description: `Query reads data from: ${sourceDE.name}`,
                targetId: sourceDE.id
              });
            } else {
              // Add system tables or unmatched tables
              relationships.push({
                type: 'incoming',
                relationship: 'reads from',
                target: sourceDEName,
                targetCategory: sourceDEName.startsWith('_') ? 'System Table' : 'Data Extensions',
                description: `Query reads data from: ${sourceDEName}`,
                targetId: null // No clickable link for system tables
              });
            }
          });
        }

        // Find target Data Extension
        if (object.metadata?.targetDataExtensionName) {
          const targetDE = Object.values(sfmcObjects).flat().find(de => 
            de.category === 'Data Extensions' && 
            (de.name === object.metadata.targetDataExtensionName || de.metadata?.name === object.metadata.targetDataExtensionName)
          );
          
          if (targetDE) {
            relationships.push({
              type: 'outgoing',
              relationship: 'writes to',
              target: targetDE.name,
              targetCategory: 'Data Extensions',
              description: `Query writes data to: ${targetDE.name}`,
              targetId: targetDE.id
            });
          }
        }

        // Find automations that use this query
        Object.values(sfmcObjects).flat().forEach(otherObject => {
          if (otherObject.category === 'Automations' && otherObject.metadata?.steps) {
            otherObject.metadata.steps.forEach(step => {
              if (step.activities) {
                step.activities.forEach(activity => {
                  if (activity.name === object.name || activity.queryDefinitionId === object.id) {
                    relationships.push({
                      type: 'incoming',
                      relationship: 'executed by automation',
                      target: otherObject.name,
                      targetCategory: 'Automations',
                      description: `Query executed by Automation: ${otherObject.name}`,
                      targetId: otherObject.id
                    });
                  }
                });
              }
            });
          }
        });
      }
    }
    
    // Remove duplicates based on target and relationship type
    const uniqueRelationships = relationships.filter((rel, index, self) => 
      index === self.findIndex(r => r.target === rel.target && r.relationship === rel.relationship)
    );
    
    return uniqueRelationships;
  };

  return (
    <div className="object-explorer">
      {/* Header */}
      <div className="explorer-header">
        <h2>📋 SFMC Object Explorer</h2>
        <div className="header-buttons">
          <button 
            onClick={loadSFMCObjects} 
            disabled={loading}
            className="load-button"
          >
            {loading ? '🔄 Loading...' : '🔄 Load SFMC Objects'}
          </button>
          <button 
            onClick={() => {
              console.log('🔍 [Debug] Current SFMC Objects:', sfmcObjects);
              console.log('🔍 [Debug] Schema Edges:', window.schemaEdges);
              console.log('🔍 [Debug] Schema Nodes:', window.schemaNodes);
              alert('Debug info logged to console. Check Developer Tools > Console');
            }}
            className="debug-button"
            title="Log debug information to console"
          >
            🐛 Debug
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ Error: {error}
        </div>
      )}

      <div className="explorer-content">
        {/* Left Panel - Object Tree */}
        <div className="left-panel">
          <div className="search-section">
            <input
              type="text"
              placeholder="🔍 Search objects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="object-tree">
            {objectTypes.map(objectType => {
              const objects = filteredObjects[objectType.key] || [];
              const totalCount = sfmcObjects[objectType.key]?.length || 0;
              
              return (
                <div key={objectType.key} className="object-category">
                  <div className="category-header">
                    <span className="category-icon">{objectType.icon}</span>
                    <span className="category-label">{objectType.label}</span>
                    <span className="category-count">
                      ({searchTerm ? objects.length : totalCount})
                    </span>
                  </div>
                  
                  <div className="object-list">
                    {objects.map(object => (
                      <div
                        key={object.id}
                        className={`object-item ${selectedObject?.id === object.id ? 'selected' : ''}`}
                        onClick={() => {
                          // Clear navigation history when selecting from left panel
                          setNavigationHistory([]);
                          setSelectedObject(object);
                        }}
                      >
                        <div className="object-name">{object.name}</div>
                        <div className="object-id">{object.id}</div>
                      </div>
                    ))}
                    
                    {objects.length === 0 && totalCount > 0 && searchTerm && (
                      <div className="no-matches">No matches found</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Object Details */}
        <div className="right-panel">
          {selectedObject ? (
            <div className="object-details">
              {/* Navigation Breadcrumbs */}
              {navigationHistory.length > 0 && (
                <div className="navigation-breadcrumbs">
                  <div className="breadcrumb-trail">
                    {navigationHistory.map((historyItem, index) => (
                      <span key={index}>
                        <button 
                          className="breadcrumb-link"
                          onClick={() => {
                            // Go back to this point in history
                            const newHistory = navigationHistory.slice(0, index);
                            setNavigationHistory(newHistory);
                            setSelectedObject(historyItem);
                          }}
                        >
                          {historyItem.name}
                        </button>
                        <span className="breadcrumb-separator"> → </span>
                      </span>
                    ))}
                    <span className="current-object">{selectedObject.name}</span>
                  </div>
                  <button 
                    className="back-button"
                    onClick={() => {
                      if (navigationHistory.length > 0) {
                        const previous = navigationHistory[navigationHistory.length - 1];
                        setNavigationHistory(prev => prev.slice(0, -1));
                        setSelectedObject(previous);
                      }
                    }}
                  >
                    ← Back
                  </button>
                </div>
              )}

              {/* Header Card */}
              <div className="detail-card header-card">
                <div className="card-header">
                  <h3>{selectedObject.name}</h3>
                  <span className="object-type-badge">{selectedObject.type}</span>
                </div>
                <div className="card-subtitle">{selectedObject.category}</div>
                <div className="object-id">ID: {selectedObject.id}</div>
              </div>

              {/* Quick Stats Card */}
              <div className="detail-card stats-card">
                <div className="card-header">
                  <h4>📊 Quick Stats</h4>
                </div>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{getObjectRelationships(selectedObject).length}</span>
                    <span className="stat-label">Relationships</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{Object.keys(selectedObject.metadata || {}).length}</span>
                    <span className="stat-label">Properties</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{selectedObject.category}</span>
                    <span className="stat-label">Type</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">
                      {getObjectRelationships(selectedObject).filter(r => r.type === 'incoming').length}
                    </span>
                    <span className="stat-label">Used By</span>
                  </div>
                </div>
              </div>

              {/* Relationships Card */}
              {(() => {
                const relationships = getObjectRelationships(selectedObject);
                return (
                  <div className="detail-card relationships-card">
                    <div className="card-header">
                      <h4>🔗 Related Objects</h4>
                      <span className="relationship-count">{relationships.length}</span>
                    </div>
                    {relationships.length > 0 ? (
                      <div className="relationships-grid">
                        {relationships.map((rel, idx) => (
                          <div 
                            key={idx} 
                            className={`relationship-card ${rel.type}`}
                            onClick={() => {
                              // Try to find and select the related object
                              const relatedObject = Object.values(sfmcObjects).flat().find(obj => 
                                obj.id === rel.targetId || obj.name === rel.target
                              );
                              if (relatedObject) {
                                // Add current object to navigation history
                                setNavigationHistory(prev => [...prev, selectedObject]);
                                setSelectedObject(relatedObject);
                              }
                            }}
                            style={{ cursor: rel.targetId ? 'pointer' : 'default' }}
                          >
                            <div className="relationship-header">
                              <span className="relationship-type-badge">{rel.relationship}</span>
                              <span className="target-category">{rel.targetCategory}</span>
                            </div>
                            <div className="relationship-target">
                              {rel.target}
                              {rel.targetId && <span className="click-hint"> 👆 Click to view</span>}
                            </div>
                            <div className="relationship-description">{rel.description}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-relationships">
                        <p>🔍 No direct relationships found</p>
                        <p className="hint">This object may be independent or relationships may not be detected yet.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Basic Information Card */}
              <div className="detail-card info-card">
                <div className="card-header">
                  <h4>� Basic Information</h4>
                </div>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Name:</label>
                    <span>{selectedObject.name}</span>
                  </div>
                  <div className="info-item">
                    <label>Type:</label>
                    <span>{selectedObject.type}</span>
                  </div>
                  <div className="info-item">
                    <label>Category:</label>
                    <span>{selectedObject.category}</span>
                  </div>
                  <div className="info-item">
                    <label>ID:</label>
                    <span className="mono">{selectedObject.id}</span>
                  </div>
                </div>
              </div>

              {/* Metadata Card */}
              {selectedObject.metadata && Object.keys(selectedObject.metadata).filter(key => 
                !['sfmcLinked', 'createdFromSFMC', 'steps', 'activities', 'targetDataExtensions', 'entrySource'].includes(key)
              ).length > 0 && (
                <div className="detail-card metadata-card">
                  <div className="card-header">
                    <h4>� Properties</h4>
                  </div>
                  <div className="metadata-grid">
                    {Object.entries(selectedObject.metadata)
                      .filter(([key]) => !['sfmcLinked', 'createdFromSFMC', 'steps', 'activities', 'targetDataExtensions', 'entrySource'].includes(key))
                      .map(([key, value]) => (
                        <div key={key} className="metadata-item">
                          <label>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</label>
                          <span className={typeof value === 'string' && value.length > 50 ? 'long-text' : ''}>
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <div className="no-selection-content">
                <h3>👈 Select an object</h3>
                <p>Click on any object in the left panel to view its details and relationships.</p>
                
                {Object.keys(sfmcObjects).length === 0 && !loading && (
                  <p>Click "Load SFMC Objects" to get started.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ObjectExplorer;
