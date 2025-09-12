import React, { useState, useEffect } from 'react';
import './ObjectExplorer.css';

const ObjectExplorer = ({ 
  accessToken = null,
  subdomain = null 
}) => {
  const [sfmcObjects, setSfmcObjects] = useState({});
  const [filteredObjects, setFilteredObjects] = useState({});
  const [selectedObject, setSelectedObject] = useState(null);
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
    { key: 'Filters', label: 'Filters', icon: '🔧' },
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
        // Extract SFMC objects from the processed schema
        const objects = {};
        
        // Group nodes by category
        data.schema.nodes.forEach(node => {
          if (!objects[node.category]) {
            objects[node.category] = [];
          }
          
          objects[node.category].push({
            id: node.id,
            name: node.label,
            type: node.type,
            category: node.category,
            metadata: node.metadata || {}
          });
        });

        setSfmcObjects(objects);
        setFilteredObjects(objects);
        console.log('✅ [ObjectExplorer] SFMC objects loaded:', Object.keys(objects).map(k => `${k}: ${objects[k].length}`));
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

    const filtered = {};
    Object.entries(sfmcObjects).forEach(([category, objects]) => {
      const matchingObjects = objects.filter(obj => 
        obj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (matchingObjects.length > 0) {
        filtered[category] = matchingObjects;
      }
    });
    
    setFilteredObjects(filtered);
  }, [searchTerm, sfmcObjects]);

  // Get relationships for selected object
  const getObjectRelationships = (object) => {
    const relationships = [];
    
    if (object.metadata) {
      // Add specific relationship logic based on object type
      if (object.category === 'Automations' && object.metadata.steps) {
        object.metadata.steps.forEach(step => {
          if (step.activities) {
            step.activities.forEach(activity => {
              relationships.push({
                type: 'executes',
                target: activity.name || 'Activity',
                description: `Executes ${activity.type || 'activity'} in Step ${step.step}`
              });
            });
          }
        });
      }
      
      if (object.metadata.targetDataExtensions) {
        object.metadata.targetDataExtensions.forEach(de => {
          relationships.push({
            type: 'targets',
            target: de.name,
            description: `Targets Data Extension: ${de.name}`
          });
        });
      }
      
      if (object.metadata.dataExtensionId && object.category === 'Triggered Sends') {
        relationships.push({
          type: 'uses',
          target: 'Data Extension',
          description: `Uses Data Extension ID: ${object.metadata.dataExtensionId}`
        });
      }
    }
    
    return relationships;
  };

  return (
    <div className="object-explorer">
      {/* Header */}
      <div className="explorer-header">
        <h2>📋 SFMC Object Explorer</h2>
        <button 
          onClick={loadSFMCObjects} 
          disabled={loading}
          className="load-button"
        >
          {loading ? '🔄 Loading...' : '🔄 Load SFMC Objects'}
        </button>
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
                        onClick={() => setSelectedObject(object)}
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
              <div className="detail-header">
                <h3>{selectedObject.name}</h3>
                <span className="object-type-badge">{selectedObject.type}</span>
              </div>

              <div className="detail-section">
                <h4>📋 Basic Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>ID:</label>
                    <span>{selectedObject.id}</span>
                  </div>
                  <div className="detail-item">
                    <label>Type:</label>
                    <span>{selectedObject.type}</span>
                  </div>
                  <div className="detail-item">
                    <label>Category:</label>
                    <span>{selectedObject.category}</span>
                  </div>
                </div>
              </div>

              {selectedObject.metadata && Object.keys(selectedObject.metadata).length > 0 && (
                <div className="detail-section">
                  <h4>📊 Metadata</h4>
                  <div className="detail-grid">
                    {Object.entries(selectedObject.metadata).map(([key, value]) => {
                      if (key === 'sfmcLinked' || key === 'createdFromSFMC') return null;
                      
                      return (
                        <div key={key} className="detail-item">
                          <label>{key}:</label>
                          <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(() => {
                const relationships = getObjectRelationships(selectedObject);
                return relationships.length > 0 && (
                  <div className="detail-section">
                    <h4>🔗 Relationships</h4>
                    <div className="relationships-list">
                      {relationships.map((rel, idx) => (
                        <div key={idx} className="relationship-item">
                          <span className="relationship-type">{rel.type}</span>
                          <span className="relationship-target">{rel.target}</span>
                          <div className="relationship-description">{rel.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
