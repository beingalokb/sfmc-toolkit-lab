/**
 * MC Explorer - Metadata Crawler
 * Efficient three-layer schema builder implementation
 * 
 * Layer 1: Collect metadata 
 * Layer 2: Build dictionaries (GUID → Name, Path, BU)
 * Layer 3: Map relationships (edges) between DEs, Automations, SQLs, Journeys
 */

const axios = require('axios');
const xml2js = require('xml2js');

class MetadataCrawler {
  constructor(accessToken, subdomain) {
    this.accessToken = accessToken;
    this.subdomain = subdomain;
    this.soapEndpoint = `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`;
    this.restEndpoint = `https://${subdomain}.rest.marketingcloudapis.com`;
    
    // Dictionaries for fast lookups
    this.DEs = new Map(); // ObjectID → DE details
    this.Folders = new Map(); // ID → Folder details  
    this.Automations = new Map(); // Id → Automation details
    this.Journeys = new Map(); // Id → Journey details
    this.TriggeredSends = new Map(); // CustomerKey → TriggeredSend details
    this.SQLActivities = new Map(); // Activity ID → SQL Activity details
    this.ImportActivities = new Map(); // Activity ID → Import Activity details
    this.FilterActivities = new Map(); // Activity ID → Filter Activity details
    
    // Relationship edges
    this.edges = [];
    
    // Performance tracking and retry configuration
    this.stats = {
      startTime: null,
      endTime: null,
      apiCalls: 0,
      errorCount: 0,
      retries: 0
    };
    
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      batchSize: 100,
      timeout: 45000
    };
    
    console.log('🔧 [MetadataCrawler v2.0] Initialized for subdomain:', subdomain);
  }

  /**
   * 🛠 Step 1: Collect metadata 
   */
  async collectDataExtensions() {
    console.log('📊 [Step 1] Collecting Data Extension metadata...');
    
    try {
      const soapEnvelope = `
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
          <s:Header>
            <fueloauth>${this.accessToken}</fueloauth>
          </s:Header>
          <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>DataExtension</ObjectType>
                <Properties>ObjectID</Properties>
                <Properties>CustomerKey</Properties>
                <Properties>Name</Properties>
                <Properties>CategoryID</Properties>
                <Properties>IsSendable</Properties>
                <Properties>CreatedDate</Properties>
                <Properties>ModifiedDate</Properties>
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </s:Body>
        </s:Envelope>
      `;

      const response = await this.makeAPICall(this.soapEndpoint, {
        data: soapEnvelope,
        headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'Retrieve' }
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      
      if (!results) {
        console.log('⚠️ [Step 1] No Data Extensions found');
        return;
      }

      const dataExtensions = Array.isArray(results) ? results : [results];
      
      // Store in dictionary: DEs[de.ObjectID] = { id, key, name, folder, isSendable }
      dataExtensions.forEach(de => {
        if (de.ObjectID) {
          this.DEs.set(de.ObjectID, {
            id: de.ObjectID,
            key: de.CustomerKey || '',
            name: de.Name || 'Unnamed DE',
            folder: de.CategoryID || '',
            isSendable: de.IsSendable === 'true',
            createdDate: de.CreatedDate || '',
            modifiedDate: de.ModifiedDate || ''
          });
        }
      });

      console.log(`✅ [Step 1] Collected ${this.DEs.size} Data Extensions`);
    } catch (error) {
      console.error('❌ [Step 1] Error collecting Data Extensions:', error.message);
      throw error;
    }
  }

  /**
   * 📁 Step 1.5: Collect Folders for path building
   */
  async collectFolders() {
    console.log('📁 [Step 1.5] Collecting Folders for path building...');
    
    try {
      const soapEnvelope = `
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <s:Header>
            <fueloauth>${this.accessToken}</fueloauth>
          </s:Header>
          <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>DataFolder</ObjectType>
                <Properties>ID</Properties>
                <Properties>Name</Properties>
                <Properties>ParentFolder.ID</Properties>
                <Properties>ContentType</Properties>
                <Filter xsi:type="SimpleFilterPart">
                  <Property>IsActive</Property>
                  <SimpleOperator>equals</SimpleOperator>
                  <Value>true</Value>
                </Filter>
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </s:Body>
        </s:Envelope>
      `;

      const response = await this.makeAPICall(this.soapEndpoint, {
        data: soapEnvelope,
        headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'Retrieve' }
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      
      if (!results) {
        console.log('⚠️ [Step 1.5] No Folders found');
        return;
      }

      const folders = Array.isArray(results) ? results : [results];
      
      // Store in dictionary: Folders[ID] = { id, name, parentId, contentType }
      folders.forEach(folder => {
        if (folder.ID) {
          this.Folders.set(folder.ID, {
            id: folder.ID,
            name: folder.Name || 'Unnamed Folder',
            parentId: folder.ParentFolder?.ID || '0',
            contentType: folder.ContentType || ''
          });
        }
      });

      console.log(`✅ [Step 1.5] Collected ${this.Folders.size} Folders`);
    } catch (error) {
      console.error('❌ [Step 1.5] Error collecting Folders:', error.message);
      throw error;
    }
  }

  /**
   * 🔄 Step 2: Collect Automation + Activity details via REST
   */
  async collectAutomations() {
    console.log('🔄 [Step 2] Collecting Automations + Activities...');
    
    try {
      // Get all automations
      const automationsResponse = await this.makeAPICall(
        `${this.restEndpoint}/automation/v1/automations`, 
        { headers: { 'Authorization': `Bearer ${this.accessToken}` } },
        'GET'
      );

      const automations = automationsResponse.data?.items || [];
      console.log(`📋 [Step 2] Found ${automations.length} automations`);

      for (const automation of automations) {
        // Store automation in dictionary
        this.Automations.set(automation.id, {
          id: automation.id,
          name: automation.name || 'Unnamed Automation',
          status: automation.status || 'Unknown',
          categoryId: automation.categoryId || '',
          createdDate: automation.createdDate || '',
          modifiedDate: automation.modifiedDate || '',
          activities: []
        });

        // Collect SQL Query Activities for this automation
        await this.collectSQLActivities(automation.id);
        
        // Collect Import/Filter Activities for this automation  
        await this.collectImportFilterActivities(automation.id);
      }

      console.log(`✅ [Step 2] Collected ${this.Automations.size} Automations with activities`);
    } catch (error) {
      console.error('❌ [Step 2] Error collecting Automations:', error.message);
      throw error;
    }
  }

  /**
   * 🔍 Step 2a: Collect SQL Query Activities
   */
  async collectSQLActivities(automationId) {
    try {
      // Get SQL queries for this automation
      const queriesResponse = await axios.get(`${this.restEndpoint}/automation/v1/queries?automationId=${automationId}`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
        timeout: 15000
      });

      const queries = queriesResponse.data?.items || [];
      
      if (queries.length === 0) {
        return;
      }

      console.log(`🔍 [Step 2a] Found ${queries.length} SQL activities for automation ${automationId}`);

      const automation = this.Automations.get(automationId);
      
      queries.forEach(query => {
        const sqlActivity = {
          id: query.queryDefinitionId || query.id,
          name: query.name || 'Unnamed Query',
          type: 'SQL',
          targetId: query.targetDataExtensionId || query.targetId,
          queryText: query.queryText || '',
          createdDate: query.createdDate || '',
          modifiedDate: query.modifiedDate || ''
        };

        automation.activities.push(sqlActivity);

        // Create relationship: Automation → SQL Activity
        this.edges.push({
          source: automationId,
          target: sqlActivity.id,
          type: 'contains',
          label: 'contains'
        });

        // Create relationship: SQL Activity → Target DE (if targetId exists)
        if (sqlActivity.targetId && this.DEs.has(sqlActivity.targetId)) {
          this.edges.push({
            source: sqlActivity.id,
            target: sqlActivity.targetId,
            type: 'targets',
            label: 'writes to'
          });
        }

        // Parse QueryText for source DEs (FROM clauses)
        this.parseQueryTextForSources(sqlActivity);
      });

    } catch (error) {
      console.warn(`⚠️ [Step 2a] Could not fetch SQL activities for automation ${automationId}:`, error.message);
    }
  }

  /**
   * 📥 Step 2b: Collect Import/Filter Activities via SOAP
   */
  async collectImportFilterActivities(automationId) {
    try {
      // Get Import Definitions
      await this.collectImportDefinitions(automationId);
      
      // Get Filter Activities
      await this.collectFilterActivities(automationId);
      
    } catch (error) {
      console.warn(`⚠️ [Step 2b] Could not fetch Import/Filter activities for automation ${automationId}:`, error.message);
    }
  }

  /**
   * 📥 Collect Import Definitions via SOAP
   */
  async collectImportDefinitions(automationId) {
    try {
      const soapEnvelope = `
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
          <s:Header>
            <fueloauth>${this.accessToken}</fueloauth>
          </s:Header>
          <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>ImportDefinition</ObjectType>
                <Properties>ObjectID</Properties>
                <Properties>CustomerKey</Properties>
                <Properties>Name</Properties>
                <Properties>DestinationObject.ObjectID</Properties>
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </s:Body>
        </s:Envelope>
      `;

      const response = await axios.post(this.soapEndpoint, soapEnvelope, {
        headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'Retrieve' },
        timeout: 15000
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      
      if (results) {
        const imports = Array.isArray(results) ? results : [results];
        const automation = this.Automations.get(automationId);
        
        imports.forEach(importDef => {
          const importActivity = {
            id: importDef.ObjectID || importDef.CustomerKey,
            name: importDef.Name || 'Unnamed Import',
            type: 'Import',
            destinationObjectId: importDef.DestinationObject?.ObjectID
          };

          automation.activities.push(importActivity);

          // Create relationships
          this.edges.push({
            source: automationId,
            target: importActivity.id,
            type: 'contains',
            label: 'contains'
          });

          if (importActivity.destinationObjectId && this.DEs.has(importActivity.destinationObjectId)) {
            this.edges.push({
              source: importActivity.id,
              target: importActivity.destinationObjectId,
              type: 'imports',
              label: 'imports to'
            });
          }
        });
      }

    } catch (error) {
      console.warn(`⚠️ Could not fetch Import Definitions for automation ${automationId}:`, error.message);
    }
  }

  /**
   * 🔽 Collect Filter Activities via SOAP
   */
  async collectFilterActivities(automationId) {
    try {
      const soapEnvelope = `
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
          <s:Header>
            <fueloauth>${this.accessToken}</fueloauth>
          </s:Header>
          <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>FilterActivity</ObjectType>
                <Properties>ObjectID</Properties>
                <Properties>Name</Properties>
                <Properties>DataSourceObjectID</Properties>
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </s:Body>
        </s:Envelope>
      `;

      const response = await axios.post(this.soapEndpoint, soapEnvelope, {
        headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'Retrieve' },
        timeout: 15000
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      
      if (results) {
        const filters = Array.isArray(results) ? results : [results];
        const automation = this.Automations.get(automationId);
        
        filters.forEach(filter => {
          const filterActivity = {
            id: filter.ObjectID,
            name: filter.Name || 'Unnamed Filter',
            type: 'Filter',
            dataSourceObjectId: filter.DataSourceObjectID
          };

          automation.activities.push(filterActivity);

          // Create relationships
          this.edges.push({
            source: automationId,
            target: filterActivity.id,
            type: 'contains',
            label: 'contains'
          });

          if (filterActivity.dataSourceObjectId && this.DEs.has(filterActivity.dataSourceObjectId)) {
            this.edges.push({
              source: filterActivity.dataSourceObjectId,
              target: filterActivity.id,
              type: 'filters_from',
              label: 'filters from'
            });
          }
        });
      }

    } catch (error) {
      console.warn(`⚠️ Could not fetch Filter Activities for automation ${automationId}:`, error.message);
    }
  }

  /**
   * 🚀 Step 3: Collect Journey details via REST
   */
  async collectJourneys() {
    console.log('🚀 [Step 3] Collecting Journeys...');
    
    try {
      const journeysResponse = await axios.get(`${this.restEndpoint}/interaction/v1/interactions`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
        timeout: 30000
      });

      const journeys = journeysResponse.data?.items || [];
      console.log(`🚀 [Step 3] Found ${journeys.length} journeys`);

      journeys.forEach(journey => {
        // Store journey in dictionary
        this.Journeys.set(journey.id, {
          id: journey.id,
          name: journey.name || 'Unnamed Journey',
          status: journey.status || 'Unknown',
          version: journey.version || 1,
          categoryId: journey.categoryId || '',
          createdDate: journey.createdDate || '',
          modifiedDate: journey.modifiedDate || '',
          entryEvents: []
        });

        // Parse entry events for DE relationships
        this.parseJourneyEntryEvents(journey);
      });

      console.log(`✅ [Step 3] Collected ${this.Journeys.size} Journeys`);
    } catch (error) {
      console.error('❌ [Step 3] Error collecting Journeys:', error.message);
      throw error;
    }
  }

  /**
   * 🎯 Parse Journey Entry Events for DE relationships
   */
  parseJourneyEntryEvents(journey) {
    try {
      // Check triggers and entryEvents arrays
      const entryEvents = journey.triggers || journey.entryEvents || [];
      
      entryEvents.forEach(entry => {
        // Look for dataExtensionId in various locations
        const dataExtensionId = entry.arguments?.dataExtensionId || 
                               entry.dataExtensionId || 
                               entry.metaData?.dataExtensionId;

        if (dataExtensionId && this.DEs.has(dataExtensionId)) {
          this.edges.push({
            source: journey.id,
            target: dataExtensionId,
            type: 'entrySource',
            label: 'entry source'
          });
          
          console.log(`🎯 [Journey Entry] ${journey.name} → ${this.DEs.get(dataExtensionId).name}`);
        }

        // Also check for dataExtensionName if ID lookup fails
        if (!dataExtensionId && entry.arguments?.dataExtensionName) {
          const deName = entry.arguments.dataExtensionName;
          const matchingDE = Array.from(this.DEs.values()).find(de => de.name === deName);
          if (matchingDE) {
            this.edges.push({
              source: journey.id,
              target: matchingDE.id,
              type: 'entrySource',
              label: 'entry source'
            });
            
            console.log(`🎯 [Journey Entry by Name] ${journey.name} → ${matchingDE.name}`);
          }
        }
      });

    } catch (error) {
      console.warn(`⚠️ Could not parse entry events for journey ${journey.name}:`, error.message);
    }
  }

  /**
   * 📧 Step 4: Collect Triggered Sends via SOAP
   */
  async collectTriggeredSends() {
    console.log('📧 [Step 4] Collecting Triggered Sends...');
    
    try {
      const soapEnvelope = `
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
          <s:Header>
            <fueloauth>${this.accessToken}</fueloauth>
          </s:Header>
          <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>TriggeredSendDefinition</ObjectType>
                <Properties>CustomerKey</Properties>
                <Properties>Name</Properties>
                <Properties>Email.ID</Properties>
                <Properties>SendClassification</Properties>
                <Properties>CreatedDate</Properties>
                <Properties>DataExtensionObjectID</Properties>
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </s:Body>
        </s:Envelope>
      `;

      const response = await axios.post(this.soapEndpoint, soapEnvelope, {
        headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'Retrieve' },
        timeout: 30000
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      
      if (!results) {
        console.log('⚠️ [Step 4] No Triggered Sends found');
        return;
      }

      const triggeredSends = Array.isArray(results) ? results : [results];
      
      triggeredSends.forEach(ts => {
        if (ts.CustomerKey) {
          this.TriggeredSends.set(ts.CustomerKey, {
            id: ts.CustomerKey,
            name: ts.Name || 'Unnamed Triggered Send',
            emailId: ts.Email?.ID,
            sendClassification: ts.SendClassification || '',
            createdDate: ts.CreatedDate || '',
            dataExtensionObjectId: ts.DataExtensionObjectID
          });

          // Create relationship to DE if linked
          if (ts.DataExtensionObjectID && this.DEs.has(ts.DataExtensionObjectID)) {
            this.edges.push({
              source: ts.CustomerKey,
              target: ts.DataExtensionObjectID,
              type: 'uses',
              label: 'uses data from'
            });
          }
        }
      });

      console.log(`✅ [Step 4] Collected ${this.TriggeredSends.size} Triggered Sends`);
    } catch (error) {
      console.error('❌ [Step 4] Error collecting Triggered Sends:', error.message);
      throw error;
    }
  }

  /**
   * 📊 Get comprehensive crawl statistics and performance metrics
   */
  getCrawlStatistics() {
    const duration = this.stats.endTime ? (this.stats.endTime - this.stats.startTime) / 1000 : 0;
    
    return {
      performance: {
        durationSeconds: duration,
        apiCalls: this.stats.apiCalls,
        errorCount: this.stats.errorCount,
        retries: this.stats.retries,
        successRate: this.stats.apiCalls > 0 ? 
          ((this.stats.apiCalls - this.stats.errorCount) / this.stats.apiCalls * 100).toFixed(2) + '%' : 'N/A'
      },
      collections: {
        dataExtensions: this.DEs.size,
        folders: this.Folders.size,
        automations: this.Automations.size,
        journeys: this.Journeys.size,
        triggeredSends: this.TriggeredSends.size,
        sqlActivities: this.SQLActivities.size,
        importActivities: this.ImportActivities.size,
        filterActivities: this.FilterActivities.size
      },
      relationships: {
        totalEdges: this.edges.length,
        edgeTypes: this.getEdgeTypeDistribution()
      },
      efficiency: {
        avgTimePerAPICall: this.stats.apiCalls > 0 ? (duration / this.stats.apiCalls).toFixed(3) + 's' : 'N/A',
        objectsPerSecond: duration > 0 ? Math.round((this.DEs.size + this.Automations.size + this.Journeys.size) / duration) : 0
      }
    };
  }

  /**
   * 📈 Get distribution of edge types for analytics
   */
  getEdgeTypeDistribution() {
    const distribution = {};
    this.edges.forEach(edge => {
      distribution[edge.type] = (distribution[edge.type] || 0) + 1;
    });
    return distribution;
  }

  /**
   * 🧹 Validate and clean metadata for consistency
   */
  validateAndCleanMetadata() {
    console.log('🧹 [Validation] Cleaning and validating metadata...');
    
    let cleanedCount = 0;
    
    // Clean DE names and keys
    this.DEs.forEach((de, id) => {
      if (!de.name || de.name.trim() === '') {
        de.name = de.key || `Unnamed_DE_${id}`;
        cleanedCount++;
      }
      de.name = de.name.trim();
      de.key = (de.key || '').trim();
    });
    
    // Remove invalid edges (where source or target doesn't exist)
    const validEdges = this.edges.filter(edge => {
      const sourceExists = this.nodeExists(edge.source);
      const targetExists = this.nodeExists(edge.target);
      
      if (!sourceExists || !targetExists) {
        console.log(`🗑️ [Validation] Removing invalid edge: ${edge.source} -> ${edge.target}`);
        return false;
      }
      return true;
    });
    
    const removedEdges = this.edges.length - validEdges.length;
    this.edges = validEdges;
    
    console.log(`✅ [Validation] Cleaned ${cleanedCount} objects, removed ${removedEdges} invalid edges`);
  }

  /**
   * 🔍 Check if a node exists in any of our collections
   */
  nodeExists(nodeId) {
    // Remove prefixes to get the actual ID
    const cleanId = nodeId.replace(/^(de_|auto_|journey_|ts_|activity_|node_)/, '');
    
    return this.DEs.has(cleanId) || 
           this.Automations.has(cleanId) || 
           this.Journeys.has(cleanId) || 
           this.TriggeredSends.has(cleanId) ||
           this.SQLActivities.has(cleanId) ||
           this.ImportActivities.has(cleanId) ||
           this.FilterActivities.has(cleanId);
  }

  /**
   * 🔄 Enhanced API call with retry logic
   */
  async makeAPICall(url, options, method = 'POST', retryCount = 0) {
    this.stats.apiCalls++;
    
    try {
      const response = method === 'GET' 
        ? await axios.get(url, { ...options, timeout: this.config.timeout })
        : await axios.post(url, options.data, { 
            headers: options.headers, 
            timeout: this.config.timeout 
          });
      
      return response;
    } catch (error) {
      this.stats.errorCount++;
      
      if (retryCount < this.config.maxRetries && this.shouldRetry(error)) {
        this.stats.retries++;
        console.log(`🔄 [Retry ${retryCount + 1}/${this.config.maxRetries}] ${error.message}`);
        
        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.makeAPICall(url, options, method, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * 🔍 Determine if error should trigger a retry
   */
  shouldRetry(error) {
    if (!error.response) return true; // Network errors
    
    const status = error.response.status;
    return status === 429 || // Rate limiting
           status === 502 || // Bad Gateway
           status === 503 || // Service Unavailable
           status === 504;   // Gateway Timeout
  }

  /**
   * 📊 Enhanced SQL parsing with improved patterns
   */
  parseQueryTextForSources(sqlActivity) {
    try {
      const queryText = sqlActivity.queryText;
      if (!queryText) return;
      
      const normalizedQuery = queryText.toLowerCase();
      
      // Enhanced regex patterns for various SQL constructs
      const patterns = [
        // Standard FROM clauses
        /(?:from|join)\s+\[?([a-zA-Z_][a-zA-Z0-9_]*)\]?(?:\s+as\s+\w+)?/gi,
        // Quoted table names
        /(?:from|join)\s+"([^"]+)"(?:\s+as\s+\w+)?/gi,
        /(?:from|join)\s+'([^']+)'(?:\s+as\s+\w+)?/gi,
        // Bracketed table names (common in SFMC)
        /(?:from|join)\s+\[([^\]]+)\](?:\s+as\s+\w+)?/gi,
        // Schema.table patterns
        /(?:from|join)\s+(\w+\.\w+)(?:\s+as\s+\w+)?/gi,
        // CTE references
        /with\s+(\w+)\s+as\s*\(/gi
      ];

      const foundSources = new Set();

      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(normalizedQuery)) !== null) {
          const tableName = match[1].trim();
          
          // Skip common SQL keywords and functions
          if (this.isCommonSQLKeyword(tableName)) continue;
          
          foundSources.add(tableName);
        }
      });

      // Look up DEs and create relationships
      foundSources.forEach(sourceName => {
        const matchingDE = Array.from(this.DEs.values()).find(de => 
          de.name.toLowerCase() === sourceName ||
          de.key.toLowerCase() === sourceName ||
          de.name.toLowerCase().includes(sourceName) ||
          sourceName.includes(de.name.toLowerCase())
        );

        if (matchingDE) {
          this.edges.push({
            source: matchingDE.id,
            target: sqlActivity.id,
            type: 'uses',
            label: 'reads from'
          });
          
          console.log(`🔍 [SQL Parse] Query "${sqlActivity.name}" reads from DE "${matchingDE.name}"`);
        }
      });

    } catch (error) {
      console.warn(`⚠️ Could not parse SQL text for query ${sqlActivity.name}:`, error.message);
    }
  }

  /**
   * 🚫 Filter out common SQL keywords that shouldn't be treated as table names
   */
  isCommonSQLKeyword(word) {
    const keywords = [
      'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer',
      'on', 'and', 'or', 'not', 'null', 'as', 'case', 'when', 'then', 'else',
      'end', 'union', 'group', 'by', 'order', 'having', 'distinct', 'top',
      'limit', 'offset', 'count', 'sum', 'avg', 'min', 'max', 'cast', 'convert'
    ];
    
    return keywords.includes(word.toLowerCase());
  }

  /**
   * 📁 Build folder paths for all objects
   */
  buildFolderPaths() {
    console.log('📁 [Paths] Building folder paths...');
    
    // Build folder path recursively
    const buildPath = (folderId) => {
      if (!folderId || folderId === '0') return '';
      
      const folder = this.Folders.get(folderId);
      if (!folder) return '';
      
      const parentPath = buildPath(folder.parentId);
      return parentPath ? `${parentPath}/${folder.name}` : folder.name;
    };

    // Add paths to DEs
    this.DEs.forEach(de => {
      de.path = buildPath(de.folder);
    });

    // Add paths to Automations
    this.Automations.forEach(automation => {
      automation.path = buildPath(automation.categoryId);
    });

    // Add paths to Journeys
    this.Journeys.forEach(journey => {
      journey.path = buildPath(journey.categoryId);
    });

    console.log('✅ [Paths] Folder paths built');
  }

  /**
   * 🚀 Main crawler method - executes all steps
   */
  async crawlMetadata() {
    console.log('🚀 [MetadataCrawler v2.0] Starting comprehensive metadata crawl...');
    
    this.stats.startTime = Date.now();
    
    try {
      // Step 1: Collect foundational data
      console.log('🏗️ [Phase 1] Collecting foundational metadata...');
      await this.collectFolders();
      await this.collectDataExtensions();
      
      // Step 2: Collect automation ecosystem
      console.log('🤖 [Phase 2] Collecting automation ecosystem...');
      await this.collectAutomations();
      
      // Step 3: Collect journey ecosystem
      console.log('🛣️ [Phase 3] Collecting journey ecosystem...');
      await this.collectJourneys();
      
      // Step 4: Collect triggered sends
      console.log('📧 [Phase 4] Collecting triggered sends...');
      await this.collectTriggeredSends();
      
      // Step 5: Build folder paths
      console.log('📁 [Phase 5] Building folder paths...');
      this.buildFolderPaths();
      
      // Step 6: Validation and cleanup
      console.log('🧹 [Phase 6] Validating and cleaning metadata...');
      this.validateAndCleanMetadata();
      
      this.stats.endTime = Date.now();
      const duration = (this.stats.endTime - this.stats.startTime) / 1000;
      
      // Get comprehensive statistics
      const stats = this.getCrawlStatistics();
      
      console.log('🎉 [MetadataCrawler v2.0] Crawl completed successfully!');
      console.log(`📊 [Summary] ${stats.collections.dataExtensions} DEs, ${stats.collections.automations} Automations, ${stats.collections.journeys} Journeys, ${stats.collections.triggeredSends} Triggered Sends`);
      console.log(`🔗 [Relationships] ${stats.relationships.totalEdges} relationships discovered`);
      console.log(`⏱️ [Performance] Completed in ${duration}s with ${stats.performance.successRate} success rate`);
      console.log(`📈 [Efficiency] ${stats.efficiency.objectsPerSecond} objects/sec, ${stats.performance.apiCalls} API calls`);
      
      return this.generateSchemaOutput();
      
    } catch (error) {
      this.stats.endTime = Date.now();
      console.error('❌ [MetadataCrawler] Crawl failed:', error.message);
      console.error('📊 [Error Stats]', this.getCrawlStatistics());
      throw error;
    }
  }

  /**
   * 📤 Generate final schema output for consumption
   */
  generateSchemaOutput() {
    const nodes = [];
    const edges = [];

    // Convert DEs to nodes
    this.DEs.forEach(de => {
      nodes.push({
        id: `de_${de.id}`,
        label: de.name,
        type: 'DataExtension',
        data: {
          name: de.name,
          key: de.key,
          path: de.path,
          isSendable: de.isSendable,
          createdDate: de.createdDate,
          modifiedDate: de.modifiedDate
        }
      });
    });

    // Convert Automations to nodes
    this.Automations.forEach(automation => {
      nodes.push({
        id: `auto_${automation.id}`,
        label: automation.name,
        type: 'Automation',
        data: {
          name: automation.name,
          status: automation.status,
          path: automation.path,
          createdDate: automation.createdDate,
          modifiedDate: automation.modifiedDate,
          activityCount: automation.activities.length
        }
      });

      // Add activity nodes
      automation.activities.forEach(activity => {
        nodes.push({
          id: `activity_${activity.id}`,
          label: activity.name,
          type: activity.type,
          data: {
            name: activity.name,
            type: activity.type,
            automationId: automation.id,
            createdDate: activity.createdDate,
            modifiedDate: activity.modifiedDate
          }
        });
      });
    });

    // Convert Journeys to nodes
    this.Journeys.forEach(journey => {
      nodes.push({
        id: `journey_${journey.id}`,
        label: journey.name,
        type: 'Journey',
        data: {
          name: journey.name,
          status: journey.status,
          version: journey.version,
          path: journey.path,
          createdDate: journey.createdDate,
          modifiedDate: journey.modifiedDate
        }
      });
    });

    // Convert Triggered Sends to nodes
    this.TriggeredSends.forEach(ts => {
      nodes.push({
        id: `ts_${ts.id}`,
        label: ts.name,
        type: 'TriggeredSend',
        data: {
          name: ts.name,
          customerKey: ts.id,
          emailId: ts.emailId,
          sendClassification: ts.sendClassification,
          createdDate: ts.createdDate
        }
      });
    });

    // Convert edges with proper prefixes
    this.edges.forEach(edge => {
      const sourceId = this.addNodePrefix(edge.source);
      const targetId = this.addNodePrefix(edge.target);
      
      edges.push({
        id: `${sourceId}_${targetId}`,
        source: sourceId,
        target: targetId,
        type: edge.type,
        label: edge.label
      });
    });

    return {
      nodes,
      edges,
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        dataExtensions: this.DEs.size,
        automations: this.Automations.size,
        journeys: this.Journeys.size,
        triggeredSends: this.TriggeredSends.size,
        crawledAt: new Date().toISOString(),
        crawlerVersion: '2.0',
        performance: this.getCrawlStatistics()
      }
    };
  }

  /**
   * 🏷️ Add appropriate node prefix based on content
   */
  addNodePrefix(nodeId) {
    // Skip if already has a prefix
    if (nodeId.includes('_')) {
      return nodeId;
    }

    // Determine prefix based on which dictionary contains the ID
    if (this.DEs.has(nodeId)) {
      return `de_${nodeId}`;
    } else if (this.Automations.has(nodeId)) {
      return `auto_${nodeId}`;
    } else if (this.Journeys.has(nodeId)) {
      return `journey_${nodeId}`;
    } else if (this.TriggeredSends.has(nodeId)) {
      return `ts_${nodeId}`;
    } else {
      // Check if it's an activity by searching through automation activities
      for (const automation of this.Automations.values()) {
        if (automation.activities.some(activity => activity.id === nodeId)) {
          return `activity_${nodeId}`;
        }
      }
      
      // Default fallback
      return `node_${nodeId}`;
    }
  }
}

module.exports = MetadataCrawler;
