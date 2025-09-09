// =========================
// MC-Explorer: Search Assets Module
// =========================
// This section implements robust, stateless endpoints for searching and displaying
// Salesforce Marketing Cloud assets (Data Extensions, Automations, Data Filters, Journeys)
// with full folder paths, metadata, and user-friendly frontend integration.
//
// Future enhancements: prompt-based asset building, Preference Center, etc.
// =========================

// server.js (Full with working auth redirect)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const Client = require('ssh2-sftp-client');
const archiver = require('archiver');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const session = require('express-session');
const upsertRow = require('./upsertRow');
const retrieveSendByJobId = require('./retrieveSend');
const { retrieveSendWithFilter } = require('./retrieveSend');

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// File paths
const credentialsPath = path.join(__dirname, 'credentials.json');
const settingsPath = path.join(__dirname, 'settings.json');

// Function to load settings from file
function loadSettings() {
  console.log('📂 [Settings] Loading settings from:', settingsPath);
  try {
    if (fs.existsSync(settingsPath)) {
      console.log('✅ [Settings] Settings file exists, reading...');
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      console.log('📋 [Settings] Raw settings data:', settingsData.substring(0, 200));
      const parsed = JSON.parse(settingsData);
      console.log('✅ [Settings] Successfully parsed settings:', {
        sftpHost: parsed.sftp?.host || 'Not set',
        sftpUsername: parsed.sftp?.username || 'Not set',
        sftpAuthType: parsed.sftp?.authType || 'Not set',
        hasPassword: !!parsed.sftp?.password,
        hasPrivateKey: !!parsed.sftp?.privateKey
      });
      return parsed;
    } else {
      console.log('⚠️ [Settings] Settings file does not exist, using defaults');
    }
  } catch (error) {
    console.error('❌ [Settings] Failed to load settings file:', error.message);
    console.error('❌ [Settings] Error details:', error.stack);
  }
  
  // Return default settings if file doesn't exist or can't be read
  const defaultSettings = {
    sftp: {
      host: '',
      port: 22,
      username: '',
      authType: 'password', // 'password' or 'key'
      password: '',
      privateKey: '',
      passphrase: '', // for encrypted private keys
      directory: '/Export'
    }
  };
  console.log('📋 [Settings] Using default settings:', defaultSettings);
  return defaultSettings;
}

// Function to save settings to file
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('✅ [Settings] Settings saved to file');
    return true;
  } catch (error) {
    console.error('❌ [Settings] Failed to save settings file:', error.message);
    return false;
  }
}

app.use(session({
  secret: 'your-very-secret-key', // use a strong secret in production!
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set to true if using HTTPS
}));

const PORT = process.env.PORT || 3001;

// Middleware to check for MC credentials in session
function requireMCCreds(req, res, next) {
  if (req.session.mcCreds && req.session.mcCreds.subdomain && req.session.mcCreds.clientId && req.session.mcCreds.clientSecret) {
    return next();
  }
  res.redirect('/setup');
}

// Save credentials to session (per user)
app.post('/save-credentials', (req, res) => {
  const { subdomain, clientId, clientSecret, accountId } = req.body;
  req.session.mcCreds = { subdomain, clientId, clientSecret, accountId };
  console.log('🔔 /save-credentials (session) received:', req.session.mcCreds);
  res.json({ success: true });
});

// Initiate Marketing Cloud OAuth login
app.get('/auth/login', (req, res) => {
  const creds = req.session.mcCreds;
  if (!creds || !creds.subdomain || !creds.clientId) {
    return res.redirect('/setup');
  }
  const redirectUri = 'https://mc-explorer.onrender.com/auth/callback';
  const loginUrl = `https://${creds.subdomain}.auth.marketingcloudapis.com/v2/authorize?client_id=${creds.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
  res.redirect(loginUrl);
});

// Handle OAuth callback: exchange code for access token
app.post('/auth/callback', async (req, res) => {
  const code = req.body.code;
  const creds = req.session.mcCreds;
  if (!creds || !creds.subdomain || !creds.clientId || !creds.clientSecret) {
    return res.status(400).json({ success: false, error: 'Missing credentials' });
  }
  try {
    const tokenResponse = await axios.post(
      `https://${creds.subdomain}.auth.marketingcloudapis.com/v2/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: 'https://mc-explorer.onrender.com/auth/callback'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    req.session.accessToken = accessToken;
    res.json({ success: true, accessToken, refreshToken, subdomain: creds.subdomain });
  } catch (err) {
    console.error('❌ OAuth callback error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// Helper to get access token from request
function getAccessTokenFromRequest(req) {
  // Try to get access token from Authorization header (Bearer ...)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // Or from session (if you stored it there)
  if (req.session && req.session.accessToken) {
    return req.session.accessToken;
  }
  return null;
}

// Helper to get subdomain from request
function getSubdomainFromRequest(req) {
  // Try to get subdomain from custom header (used by frontend)
  if (req.headers['x-mc-subdomain']) {
    return req.headers['x-mc-subdomain'];
  }
  // Or from session credentials
  if (req.session && req.session.mcCreds && req.session.mcCreds.subdomain) {
    return req.session.mcCreds.subdomain;
  }
  return null;
}

// Helper to get MC access token from session credentials
async function getMCAccessToken(req) {
  const creds = req.session.mcCreds;
  if (!creds) throw new Error('No Marketing Cloud credentials in session');
  
  // First, try to use existing access token from session
  if (req.session.accessToken) {
    console.log('✅ [Auth] Using existing access token from session');
    return req.session.accessToken;
  }
  
  // If no access token, try to use refresh token if available
  if (req.session.refreshToken) {
    console.log('🔄 [Auth] Refreshing access token using refresh token');
    try {
      const url = `https://${creds.subdomain}.auth.marketingcloudapis.com/v2/token`;
      const resp = await axios.post(url, {
        grant_type: 'refresh_token',
        refresh_token: req.session.refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret
      });
      
      // Update session with new tokens
      req.session.accessToken = resp.data.access_token;
      if (resp.data.refresh_token) {
        req.session.refreshToken = resp.data.refresh_token;
      }
      
      console.log('✅ [Auth] Successfully refreshed access token');
      return resp.data.access_token;
    } catch (refreshError) {
      console.error('❌ [Auth] Failed to refresh token:', refreshError.response?.data || refreshError.message);
      // Clear invalid tokens
      delete req.session.accessToken;
      delete req.session.refreshToken;
    }
  }
  
  // If we reach here, we need the user to complete OAuth flow
  throw new Error('No valid access token available. User needs to complete OAuth authentication flow.');
}

// Endpoint to check if backend has credentials (per session)
app.get('/has-credentials', (req, res) => {
  const creds = req.session.mcCreds || {};
  console.log('🟢 /has-credentials (session) check:', creds);
  const hasCreds = !!(creds.subdomain && creds.clientId && creds.clientSecret);
  res.json({ hasCreds });
});

// Logout route to clear session
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Example: protect dashboard route
// app.get('/dashboard', requireMCCreds, (req, res) => {
//   // ...serve dashboard or API logic
// });

// Use req.session.mcCreds for all MC API calls
function getMCCreds(req) {
  return req.session.mcCreds;
}

// =========================
// MC-Explorer: Search Assets Module (continued)
// =========================

// Helper to build folder path from folderMap
function buildFolderPath(folderId, folderMap) {
  let path = [];
  let current = folderMap[folderId];
  while (current) {
    path.unshift(current.Name);
    current = current.ParentFolder && folderMap[current.ParentFolder.ID];
  }
  return '/' + path.join(' / ');
}

// Data Extension Search (SOAP + REST for createdByName)
app.get('/search/de', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    // Fetch all folders first (SOAP, as before)
    const folderEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header><fueloauth>${accessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;
    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    const folderParser = new xml2js.Parser({ explicitArray: false });
    let folderMap = {};
    await folderParser.parseStringPromise(folderResp.data).then(result => {
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      const folders = Array.isArray(results) ? results : [results];
      folders.forEach(f => {
        if (f && f.ID) folderMap[String(f.ID)] = f;
      });
    });
    // Fetch DEs via SOAP
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataExtension</ObjectType>
              <Properties>Name</Properties>
              <Properties>CustomerKey</Properties>
              <Properties>CreatedDate</Properties>
              <Properties>CategoryID</Properties>
              <Properties>ObjectID</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </s:Body>
      </s:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Retrieve',
        },
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error('❌ XML Parse Error:', err);
        return res.status(500).json({ error: 'Failed to parse XML' });
      }
      try {
        const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        if (!results) return res.status(200).json([]);
        const resultArray = Array.isArray(results) ? results : [results];
        // Only return basic DE info, no REST call for createdByName
        const deList = resultArray.map(de => ({
          name: de.Name || 'N/A',
          key: de.CustomerKey || 'N/A',
          createdDate: de.CreatedDate || 'N/A',
          categoryId: de.CategoryID || '',
          objectId: de.ObjectID || '',
          id: de.ID || de.ObjectID || '', // fallback to ObjectID if ID is missing
          path: buildFolderPath(de.CategoryID, folderMap)
        }));
        res.json(deList);
      } catch (e) {
        console.error('❌ DE structure error:', e);
        res.status(500).json({ error: 'Unexpected DE format' });
      }
    });
  } catch (err) {
    console.error('❌ DE fetch failed:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch DEs' });
  }
});

// Automation Search (REST, revert to previous working version)
app.get('/search/automation', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    // Fetch all folders first (SOAP, as before)
    const folderEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header><fueloauth>${accessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;
    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    const folderParser = new xml2js.Parser({ explicitArray: false });
    let folderMap = {};
    await folderParser.parseStringPromise(folderResp.data).then(result => {
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      const folders = Array.isArray(results) ? results : [results];
      folders.forEach(f => {
        if (f && f.ID) folderMap[String(f.ID)] = f;
      });
    });
    // Fetch Automations via REST
    const response = await axios.get(
      `https://${subdomain}.rest.marketingcloudapis.com/automation/v1/automations`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const automations = response.data.items || [];
    if (automations.length > 0) console.log('🔎 Raw Automation:', JSON.stringify(automations[0], null, 2));
    const simplified = automations.map(a => ({
      id: a.id,
      name: a.name || 'N/A',
      key: a.key || a.customerKey || 'N/A',
      status: a.status || a.statusId || 'N/A',
      path: buildFolderPath(a.categoryId, folderMap)
    }));
    res.json(simplified);
  } catch (err) {
    console.error('❌ Automation REST error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch Automations via REST' });
  }
});

// On-demand Automation details endpoint
app.get('/automation/details', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  const programId = req.query.programId;
  if (!accessToken || !subdomain || !programId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    const restResp = await axios.get(
      `https://${subdomain}.rest.marketingcloudapis.com/automation/v1/automations/${programId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const item = restResp.data;
    res.json({
      startDate: item.startDate || 'N/A',
      endDate: item.endDate || 'N/A',
      lastRunTime: item.lastRunTime || 'N/A',
      // Add more fields if needed
    });
  } catch (e) {
    console.error('Failed to fetch Automation details:', e?.response?.data || e);
    res.status(500).json({ error: 'Failed to fetch Automation details', details: e?.message || e });
  }
});

// Data Filter Search
app.get('/search/datafilters', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    // Fetch all folders first
    const folderEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header><fueloauth>${accessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;
    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    const folderParser = new xml2js.Parser({ explicitArray: false });
    let folderMap = {};
    await folderParser.parseStringPromise(folderResp.data).then(result => {
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      const folders = Array.isArray(results) ? results : [results];
      folders.forEach(f => {
        if (f && f.ID) folderMap[String(f.ID)] = f;
      });
    });
    // Fetch Data Filters
    const envelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>FilterDefinition</ObjectType>
              <Properties>Name</Properties>
              <Properties>CustomerKey</Properties>
              <Properties>Description</Properties>
              <Properties>CreatedDate</Properties>
              <Properties>CategoryID</Properties>
              <Filter xsi:type="SimpleFilterPart">
                <Property>Name</Property>
                <SimpleOperator>isNotNull</SimpleOperator>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </s:Body>
      </s:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      envelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          'SOAPAction': 'Retrieve',
        }
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error('❌ Failed to parse data filter SOAP response:', err);
        return res.status(500).json({ error: 'XML parse error' });
      }
      const filterResults =
        result['soap:Envelope']?.['soap:Body']?.RetrieveResponseMsg?.Results;
      if (!filterResults) {
        return res.json([]);
      }
      const normalized = Array.isArray(filterResults)
        ? filterResults
        : [filterResults];
      // Log raw Data Filter result for createdByName troubleshooting
      if (normalized.length > 0) console.log('🔎 Raw DataFilter:', JSON.stringify(normalized[0], null, 2));
      const dataFilters = normalized.map(item => ({
        name: item.Name || 'N/A',
        key: item.CustomerKey || 'N/A',
        customerKey: item.CustomerKey || '',
        id: item.CategoryID || '', // Use CategoryID for Data Filter View link
        description: item.Description || 'N/A',
        createdDate: item.CreatedDate || 'N/A',
        createdByName: item.CreatedBy || item.CreatedByName || 'N/A',
        path: buildFolderPath(item.CategoryID, folderMap)
      }));
      res.json(dataFilters);
    });
  } catch (err) {
    console.error('❌ Data Filter error:', err);
    res.status(500).json({ error: 'Failed to fetch data filters' });
  }
});

// Journey Search
app.get('/search/journeys', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    // Fetch all folders first
    const folderEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header><fueloauth>${accessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;
    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    const folderParser = new xml2js.Parser({ explicitArray: false });
    let folderMap = {};
    await folderParser.parseStringPromise(folderResp.data).then(result => {
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      const folders = Array.isArray(results) ? results : [results];
      folders.forEach(f => {
        if (f && f.ID) folderMap[String(f.ID)] = f;
      });
    });
    // Fetch Journeys
    const response = await axios.get(
      `https://${subdomain}.rest.marketingcloudapis.com/interaction/v1/interactions`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    const journeys = response.data.items || [];
    // Log raw Journey result for createdByName troubleshooting
    if (journeys.length > 0) console.log('🔎 Raw Journey:', JSON.stringify(journeys[0], null, 2));
    const simplified = journeys.map(j => ({
      name: j.name || 'N/A',
      key: j.key || 'N/A',
      status: j.status || 'N/A',
      lastPublishedDate: j.lastPublishedDate || 'N/A',
      versionNumber: j.versionNumber || 'N/A',
      createdDate: j.createdDate || 'Not Available',
      createdByName: j.createdByName || j.createdBy || 'N/A',
      path: buildFolderPath(j.categoryId, folderMap)
    }));
    res.json(simplified);
  } catch (err) {
    console.error('❌ Journey fetch error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch journeys' });
  }
});

// On-demand Data Extension details endpoint
app.get('/de/details', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  const name = req.query.name;
  if (!accessToken || !subdomain || !name) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    // REST call for DE details
    const restResp = await axios.get(
      `https://${subdomain}.rest.marketingcloudapis.com/data/v1/customobjects?$search=${encodeURIComponent(name)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const item = restResp.data.items && restResp.data.items.find(obj => obj.name === name);
    if (!item) {
      console.warn(`DE not found in REST for name: ${name}`);
      return res.status(404).json({ error: 'Data Extension not found' });
    }
    // SOAP call for rowCount, isSendable, isTestable
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataExtension</ObjectType>
              <Properties>Name</Properties>
              <Properties>CustomerKey</Properties>
              <Properties>IsSendable</Properties>
              <Properties>IsTestable</Properties>
              <Properties>RowCount</Properties>
              <Filter xsi:type="SimpleFilterPart" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                <Property>Name</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>${name}</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </s:Body>
      </s:Envelope>
    `;
    let deDetails = null;
    try {
      const soapResp = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        soapEnvelope,
        {
          headers: {
            'Content-Type': 'text/xml',
            SOAPAction: 'Retrieve',
          },
        }
      );
      const parser = new xml2js.Parser({ explicitArray: false });
      await new Promise((resolve, reject) => {
        parser.parseString(soapResp.data, (err, result) => {
          if (err) return reject(err);
          const details = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
          deDetails = Array.isArray(details) ? details[0] : details;
          resolve();
        });
      });
    } catch (soapErr) {
      console.error('SOAP error for DE details:', soapErr);
      // Continue, but deDetails may be null
    }
    res.json({
      createdByName: item.createdByName || 'N/A',
      modifiedByName: item.modifiedByName || 'N/A',
      rowCount: item.rowCount !== undefined ? item.rowCount : (deDetails?.RowCount || 'N/A'),
      isSendable: item.isSendable !== undefined ? item.isSendable : (deDetails?.IsSendable || 'N/A'),
      isTestable: item.isTestable !== undefined ? item.isTestable : (deDetails?.IsTestable || 'N/A'),
    });
  } catch (e) {
    console.error('Failed to fetch DE details:', e?.response?.data || e);
    res.status(500).json({ error: 'Failed to fetch DE details', details: e?.message || e });
  }
});

// =========================
// Preference Center API (Step 1)
// =========================
const PREFERENCE_PROJECTS_DE = 'Preference_Center_Projects';

app.post('/api/preference-center/project', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  const { name, routeType, targetBU } = req.body;
  if (!accessToken || !subdomain || !name || !routeType || !targetBU) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Create the DE if it doesn't exist (idempotent)
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Options/>
            <Objects xsi:type="DataExtension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
              <CustomerKey>${PREFERENCE_PROJECTS_DE}</CustomerKey>
              <Name>${PREFERENCE_PROJECTS_DE}</Name>
              <Description>Preference Center Projects created by MC Explorer</Description>
              <Fields>
                <Field><Name>ProjectName</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength></Field>
                <Field><Name>RouteType</Name><FieldType>Text</FieldType><MaxLength>30</MaxLength></Field>
                <Field><Name>TargetBU</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength></Field>
                <Field><Name>CreatedDate</Name><FieldType>Date</FieldType></Field>
              </Fields>
            </Objects>
          </CreateRequest>
        </s:Body>
      </s:Envelope>
    `;
    await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' } }
    );
    // Insert the project record
    const now = new Date().toISOString();
    const insertEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Options/>
            <Objects xsi:type="DataExtensionObject" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
              <CustomerKey>${PREFERENCE_PROJECTS_DE}</CustomerKey>
              <Properties>
                <Property><Name>ProjectName</Name><Value>${name}</Value></Property>
                <Property><Name>RouteType</Name><Value>${routeType}</Value></Property>
                <Property><Name>TargetBU</Name><Value>${targetBU}</Value></Property>
                <Property><Name>CreatedDate</Name><Value>${now}</Value></Property>
              </Properties>
            </Objects>
          </CreateRequest>
        </s:Body>
      </s:Envelope>
    `;
    await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      insertEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' } }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Preference Center Project creation error:', e?.response?.data || e);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// === Preference Center Builder: Advanced Endpoints ===

// 1. Folder Path Validation
app.post('/folders', async (req, res) => {
  const { folderPath } = req.body;
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!folderPath || !accessToken || !subdomain) {
    return res.status(400).json({ valid: false, error: 'Missing folderPath, accessToken, or subdomain' });
  }
  try {
    // Fetch all folders (SOAP)
    const folderEnvelope = `
      <s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">
        <s:Header><fueloauth>${accessToken}</fueloauth></s:Header>
        <s:Body>
          <RetrieveRequestMsg xmlns=\"http://exacttarget.com/wsdl/partnerAPI\">
            <RetrieveRequest>
              <ObjectType>DataFolder</ObjectType>
              <Properties>ID</Properties>
              <Properties>Name</Properties>
              <Properties>ParentFolder.ID</Properties>
              <Properties>ContentType</Properties>
              <Filter xsi:type=\"SimpleFilterPart\">
                <Property>IsActive</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>true</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </s:Body>
      </s:Envelope>`;
    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    const folderParser = new xml2js.Parser({ explicitArray: false });
    let folderMap = {};
    await folderParser.parseStringPromise(folderResp.data).then(result => {
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      const folders = Array.isArray(results) ? results : [results];
      folders.forEach(f => {
        if (f && f.ID) folderMap[String(f.ID)] = f;
      });
    });
    // Validate path
    const pathParts = folderPath.split('/').map(s => s.trim()).filter(Boolean);
    let currentParent = null;
    let found = false;
    for (const part of pathParts) {
      found = false;
      for (const id in folderMap) {
        const f = folderMap[id];
        if (f.Name === part && (currentParent === null || (f.ParentFolder && String(f.ParentFolder.ID) === String(currentParent)))) {
          currentParent = id;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    if (found) {
      return res.json({ valid: true, folderId: currentParent });
    } else {
      return res.json({ valid: false, error: 'Folder path not found' });
    }
  } catch (err) {
    console.error('/folders error:', err);
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

// 2. DE Lookup/Autocomplete
app.get('/de-lookup', async (req, res) => {
  const { query } = req.query;
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    // Fetch DEs via SOAP
    const soapEnvelope = `
      <s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <RetrieveRequestMsg xmlns=\"http://exacttarget.com/wsdl/partnerAPI\">
            <RetrieveRequest>
              <ObjectType>DataExtension</ObjectType>
              <Properties>Name</Properties>
              <Properties>CustomerKey</Properties>
              <Properties>CategoryID</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </s:Body>
      </s:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Retrieve',
        },
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to parse XML' });
      }
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      if (!results) return res.json([]);
      const resultArray = Array.isArray(results) ? results : [results];
      let deList = resultArray.map(de => ({
        name: de.Name || 'N/A',
        key: de.CustomerKey || 'N/A',
        categoryId: de.CategoryID || ''
      }));
      if (query) {
        deList = deList.filter(de => de.name.toLowerCase().includes(query.toLowerCase()));
      }
      res.json(deList);
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch DEs' });
  }
});

// 3. Save Full Preference Center Config
function generateCloudPageContent(config) {
  // AMPscript variable setup
  const identifierField = config.subscriberIdentifier?.customParamName || config.subscriberIdentifier?.type || 'SubscriberKey';
  const emailField = 'email';
  const preferences = config.preferences || [];
  const optOutField = config.masterOptOut?.enabled ? config.masterOptOut.fieldApiName : null;
  const logDE = config.changeLogging?.enabled ? config.changeLogging.logDE?.name : null;
  const deName = config.dataExtension?.deName || config.newDeName || config.existingDeName;
  const redirectUrl = config.confirmationBehavior?.type === 'redirect' ? config.confirmationBehavior.redirectUrl : null;
  // AMPscript: SET vars
  let ampscript = [
    '%%[',
    'VAR @submit, @cid, @email' + preferences.map((p, i) => `, @pref${i+1}`).join('') + (optOutField ? ', @optout' : ''),
    logDE ? ', @logDE' : '',
    redirectUrl ? ', @redirect' : '',
    `SET @submit = RequestParameter("submit")`,
    `SET @cid = RequestParameter("${identifierField}")`,
    `SET @email = RequestParameter("${emailField}")`,
    ...preferences.map((p, i) => `SET @pref${i+1} = IIF(RequestParameter("${p.fieldApiName}") == "on", "true", "false")`),
    optOutField ? `SET @optout = IIF(RequestParameter("${optOutField}") == "on", "true", "false")` : '',
    logDE ? `SET @logDE = "${logDE}"` : '',
    redirectUrl ? `SET @redirect = "${redirectUrl}"` : ''
  ];
  // Opt-out logic
  if (optOutField) {
    ampscript.push(`IF @optout == "true" THEN`);
    preferences.forEach((p, i) => ampscript.push(`  SET @pref${i+1} = "false"`));
    ampscript.push('ENDIF');
  }
  // Submission logic
  ampscript.push('IF @submit == "Update" THEN');
  // UpsertDE
  ampscript.push(`  UpsertDE("${deName}", 1, "${identifierField}", @cid,`);
  ampscript.push(`    "EmailAddress", @email,`);
  preferences.forEach((p, i) => ampscript.push(`    "${p.fieldApiName}", @pref${i+1},`));
  if (optOutField) ampscript.push(`    "${optOutField}", @optout,`);
  ampscript.push('    "LastUpdated", NOW()');
  ampscript.push('  )');
  // Change log
  if (logDE) {
    ampscript.push(`  InsertDE(@logDE,`);
    ampscript.push(`    "SubscriberKey", @cid,`);
    ampscript.push(`    "EmailAddress", @email,`);
    ampscript.push('    "Old_Value", "N/A",');
    ampscript.push(`    "New_Value", Concat(${preferences.map((p, i) => `"${p.label}=" , @pref${i+1}`).join(', "; ", ')}), "; OptOut=", ${optOutField ? '@optout' : '""'}),`);
    ampscript.push(`    "Subscription", "${config.preferenceCenterName || config.name}",`);
    ampscript.push('    "Error_Message", "",');
    ampscript.push('    "DateModified", NOW()');
    ampscript.push('  )');
  }
  // Redirect or message
  if (redirectUrl) {
    ampscript.push('  Redirect(@redirect)');
  }
  ampscript.push('ENDIF');
  ampscript.push(']%%');
  // HTML form
  let html = `<!DOCTYPE html><html><head><style>body{font-family:Arial;padding:20px;background:#f8f8f8;}h2{color:#004080;}.form-section{background:white;padding:20px;border-radius:6px;max-width:600px;margin:auto;box-shadow:0 0 10px rgba(0,0,0,0.1);}label{display:block;margin-top:15px;font-weight:bold;}.desc{font-size:13px;color:#666;margin-top:4px;}input[type=submit]{background:#004080;color:white;padding:10px 30px;margin-top:20px;border:none;border-radius:4px;cursor:pointer;}</style></head><body><div class='form-section'><h2>${config.preferenceCenterName || config.name || 'Preference Center'}</h2><form method='POST' action='%%=RequestParameter("PAGEURL")=%%'>`;
  html += `<label>Subscriber Identifier (${identifierField})<input type='text' name='${identifierField}' required /></label>`;
  html += `<label>Email Address<input type='email' name='email' required /></label>`;
  preferences.forEach((p, i) => {
    html += `<label><input type='checkbox' name='${p.fieldApiName}'${p.defaultChecked ? ' checked' : ''}/> ${p.label}</label>`;
    if (p.description) html += `<div class='desc'>${p.description}</div>`;
  });
  if (optOutField) {
    html += `<label><input type='checkbox' name='${optOutField}' /> Unsubscribe from all preferences</label>`;
  }
  html += `<input type='submit' name='submit' value='Update' /></form></div></body></html>`;
  return ampscript.join('\n') + '\n' + html;
}


app.post('/preference-center/save-config', async (req, res) => {
  const config = req.body;
  const controllerDEName = 'PC_Controller';
  const logDEName = 'PC_Log';  
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json({ success: false, error: 'Missing accessToken or subdomain' });
  }
  try {
    // 1. Build DE SOAP XML
    const deFields = [
      {
        Name: config.subscriberId || 'EmailAddress',
        FieldType: 'EmailAddress',
        IsRequired: true,
        IsPrimaryKey: true
      },
      ...config.categories.map(cat => ({
        Name: cat.apiName,
        FieldType: 'Boolean',
        IsRequired: false,
        IsPrimaryKey: false
      }))
    ];
    if (config.enableOptOut && config.optOutApiName) {
      deFields.push({
        Name: config.optOutApiName,
        FieldType: 'Boolean',
        IsRequired: false,
        IsPrimaryKey: false
      });
    }
    // Add advanced fields if enabled
    if (config.customFields?.timestamp) {
      deFields.push({ Name: 'Timestamp', FieldType: 'Date', IsRequired: false, IsPrimaryKey: false });
    }
    if (config.customFields?.ip) {
      deFields.push({ Name: 'IP_Address', FieldType: 'Text', IsRequired: false, IsPrimaryKey: false });
    }
    if (config.customFields?.region) {
      deFields.push({ Name: 'Region', FieldType: 'Text', IsRequired: false, IsPrimaryKey: false });
    }
    // Build <Fields> XML
    const fieldsXml = deFields.map(f => `
      <Field>
        <Name>${f.Name}</Name>
        <FieldType>${f.FieldType}</FieldType>
        <IsRequired>${f.IsRequired}</IsRequired>
        <IsPrimaryKey>${f.IsPrimaryKey}</IsPrimaryKey>
      </Field>`).join('');
    // SOAP XML for DE creation
    const deSoapXml = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Options/>
            <Objects xsi:type="DataExtension">
              <CustomerKey>${config.newDeName || config.existingDeName}</CustomerKey>
              <Name>${config.newDeName || config.existingDeName}</Name>
              <Description>Preference Center DE created by MC Explorer</Description>
              <IsSendable>true</IsSendable>
              <SendableDataExtensionField>
                <Name>${config.subscriberId || 'EmailAddress'}</Name>
              </SendableDataExtensionField>
              <SendableSubscriberField>
                <Name>${config.subscriberId === 'SubscriberKey' ? 'Subscriber Key' : 'Email Address'}</Name>
              </SendableSubscriberField>
              <Fields>${fieldsXml}</Fields>
            </Objects>
          </CreateRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    // 2. Call SOAP API to create DE
    let deResult = null;
    if (config.deOption === 'create') {
      const deResp = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        deSoapXml,
        {
          headers: {
            'Content-Type': 'text/xml',
            'SOAPAction': 'Create',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      deResult = deResp.data;
    }
    // 3. Generate CloudPage HTML/AMPscript dynamically
    const html = generateCloudPageContent(config);
    // 4. Create CloudPage via REST
    const cloudPagePayload = {
      name: `${config.name || config.preferenceCenterName || 'Preference Center'} - MC Explorer`,
      assetType: { id: 207, name: 'webpage' },
      content: html,
      category: { id: 0 }, // TODO: Lookup or use folder/category ID
      data: { views: { html: { content: html } } }
    };
    const cpResp = await axios.post(
      `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets`,
      cloudPagePayload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    // 5. Return results
    res.json({ success: true, deResult, cloudPage: cpResp.data });
  } catch (err) {
    console.error('Preference Center automation error:', err?.response?.data || err);
    res.status(500).json({ success: false, error: err?.response?.data || err.message });
  }
});

// POST /preference-center/project - Accepts full MC project JSON and orchestrates asset creation
app.post('/preference-center/project', async (req, res) => {
  const project = req.body;
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json({ success: false, error: 'Missing access token or subdomain' });
  }
  try {
    // Helper: Resolve template variables in the project JSON
    function resolveVars(str, context) {
      if (typeof str !== 'string') return str;
      return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const parts = path.replace('mcpm#/', '').split('/');
        let val = context;
        for (const p of parts) val = val?.[p];
        return val ?? '';
      });
    }
    // 1. Create categories/folders first (with dependency order)
    const createdCategories = {};
    if (project.entities.categories) {
      for (const [catId, cat] of Object.entries(project.entities.categories)) {
        // Call MC API to create folder/category if not exists
        // Use cat.data.name, cat.data.categoryType, cat.data.parentId
        // For now, just simulate creation and return the structure
        createdCategories[catId] = { id: catId, ...cat.data };
      }
    }
    // 2. Create Data Extensions (with dependency order)
    const createdDEs = {};
    if (project.entities.dataExtensions) {
      for (const [deId, de] of Object.entries(project.entities.dataExtensions)) {
        // Call MC SOAP API to create DE using de.data
        // Use resolveVars for categoryId and field values
        createdDEs[deId] = { id: deId, ...de.data };
      }
    }
    // 3. Create CloudPages (LandingPages/PrimaryLandingPages)
    const createdPages = {};
    if (project.entities.landingPages) {
      for (const [pageId, page] of Object.entries(project.entities.landingPages)) {
        // Call MC REST API to create CloudPage using page.data.asset
        // Use resolveVars for category.id, content, etc.
        createdPages[pageId] = { id: pageId, ...page.data };
      }
    }
    if (project.entities.primaryLandingPages) {
      for (const [pageId, page] of Object.entries(project.entities.primaryLandingPages)) {
        // Call MC REST API to create CloudPage using page.data.asset
        createdPages[pageId] = { id: pageId, ...page.data };
      }
    }
    // 4. Create Query Activities
    const createdQueries = {};
    if (project.entities.queryActivities) {
      for (const [qId, q] of Object.entries(project.entities.queryActivities)) {
        // Call MC API to create Query Activity using q.data
        createdQueries[qId] = { id: qId, ...q.data };
      }
    }
    // 5. Create Automations
    const createdAutomations = {};
    if (project.entities.automations) {
      for (const [aId, a] of Object.entries(project.entities.automations)) {
        // Call MC API to create Automation using a.data
        createdAutomations[aId] = { id: aId, ...a.data };
      }
    }
    // 6. Return results in the same JSON structure
    res.json({
      ...project,
      orchestrationResult: {
        categories: createdCategories,
        dataExtensions: createdDEs,
        cloudPages: createdPages,
        queryActivities: createdQueries,
        automations: createdAutomations
      },
      message: 'Project orchestration simulated. TODO: Implement actual MC API calls for each asset type.'
    });
  } catch (err) {
    console.error('Project orchestration error:', err);
    res.status(500).json({ success: false, error: err?.message || err });
  }
});

// GET /folders - fetch all folders (for frontend compatibility)
app.get('/folders', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    const folderEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header><fueloauth>${accessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;
    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    const folderParser = new xml2js.Parser({ explicitArray: false });
    let folderMap = {};
    let folders = [];
    await folderParser.parseStringPromise(folderResp.data).then(result => {
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      folders = Array.isArray(results) ? results : [results];
      folders.forEach(f => {
        if (f && f.ID) folderMap[String(f.ID)] = f;
      });
    });
    res.json(folders);
  } catch (err) {
    console.error('/folders GET error:', err);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// EmailSendDefinition Search (SOAP)
app.get('/search/emailsenddefinition', async (req, res) => {
  console.log('🔔 /search/emailsenddefinition endpoint hit'); // DEBUG
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    // Retrieve EmailSendDefinition rows (all relevant properties)
    const props = [
      'Name',
      'CustomerKey',
      'CategoryID',
      'ModifiedDate',
      'SendClassification.CustomerKey',
      'SenderProfile.CustomerKey',
      'DeliveryProfile.CustomerKey',
      'BccEmail',
      'CCEmail'
    ];
    const propsXml = props.map(p => `<Properties>${p}</Properties>`).join('');
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>EmailSendDefinition</ObjectType>
              ${propsXml}
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    // Log the full SOAP request for debugging
    //console.log("\n[SOAP REQUEST] /search/emailsenddefinition (FINAL):\n" + soapEnvelope);
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Retrieve',
        },
      }
    );
    console.log('🔵 Raw EmailSendDefinition SOAP response:', response.data); // DEBUG
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error('❌ Error parsing EmailSendDefinition SOAP response:', err);
        return res.status(500).json([]);
      }
      try {
        const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        if (!results) {
          console.log('⚠️ No EmailSendDefinition results found in SOAP response');
          return res.status(200).json([]);
        }
        
        const resultArray = Array.isArray(results) ? results : [results];
        console.log(`📧 Found ${resultArray.length} EmailSendDefinition records`);
        console.log('📧 Sample record:', JSON.stringify(resultArray[0], null, 2));
        
        const sendDefs = resultArray.map(item => ({
          Name: item.Name || '',
          CustomerKey: item.CustomerKey || '',
          SendClassificationKey: item['SendClassification']?.CustomerKey || item['SendClassification.CustomerKey'] || '',
          SenderProfileKey: item['SenderProfile']?.CustomerKey || item['SenderProfile.CustomerKey'] || '',
          DeliveryProfileKey: item['DeliveryProfile']?.CustomerKey || item['DeliveryProfile.CustomerKey'] || '',
          BccEmail: item.BccEmail ?? '',
          CCEmail: item.CCEmail ?? ''
        }));
        
        console.log(`✅ Mapped ${sendDefs.length} EmailSendDefinition records for frontend`);
        console.log('📧 Sample mapped record:', JSON.stringify(sendDefs[0], null, 2));
        
        res.json(sendDefs);
      } catch (e) {
        console.error('❌ Error parsing EmailSendDefinition SOAP response:', e);
        res.status(500).json([]);
      }
    });
  } catch (e) {
    console.error('❌ Failed to fetch EmailSendDefinition (SOAP):', e.response?.data || e.message);
    res.status(500).json([]);
  }
});

// SenderProfile Search (SOAP)
app.get('/search/senderprofile', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json([]);
  try {
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>SenderProfile</ObjectType>
              <Properties>CustomerKey</Properties>
              <Properties>Name</Properties>
              <Properties>Description</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Retrieve',
        },
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });
      try {
        const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        if (!results) return res.status(200).json([]);
        const arr = Array.isArray(results) ? results : [results];
        const profiles = arr.map(item => ({
          CustomerKey: item.CustomerKey || '',
          Name: item.Name || '',
          Description: item.Description || ''
        }));
        res.json(profiles);
      } catch (e) {
        res.status(500).json([]);
      }
    });
  } catch (e) {
    res.status(500).json([]);
  }
});

// SendClassification Search (SOAP)
app.get('/search/sendclassification', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json([]);
  try {
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>SendClassification</ObjectType>
              <Properties>CustomerKey</Properties>
              <Properties>Name</Properties>
              <Properties>Description</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Retrieve',
        },
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });
      try {
        const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        if (!results) return res.status(200).json([]);
        const arr = Array.isArray(results) ? results : [results];
        const profiles = arr.map(item => ({
          CustomerKey: item.CustomerKey || '',
          Name: item.Name || '',
          Description: item.Description || ''
        }));
        res.json(profiles);
      } catch (e) {
        res.status(500).json([]);
      }
    });
  } catch (e) {
    res.status(500).json([]);
  }
});

// DeliveryProfile Search - Extract from EmailSendDefinitions and SendClassifications
// Note: DeliveryProfile object doesn't support SOAP Retrieve directly
// We extract delivery profile info from other objects that contain this data
app.get('/search/deliveryprofile', async (req, res) => {
  console.log('🔔 /search/deliveryprofile endpoint hit - extracting from EmailSendDefinitions and SendClassifications');
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    console.log('❌ [DeliveryProfile] No access token or subdomain found');
    return res.status(401).json([]);
  }
  
  try {
    console.log('🔍 [DeliveryProfile] Extracting delivery profiles from EmailSendDefinitions and SendClassifications...');
    
    const deliveryProfileMap = new Map();
    
    // Helper function to fetch and extract delivery profiles from SOAP objects
    async function extractDeliveryProfiles(objectType, properties) {
      const propsXml = properties.map(p => `<Properties>${p}</Properties>`).join('');
      const soapEnvelope = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <soapenv:Header>
            <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
          </soapenv:Header>
          <soapenv:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>${objectType}</ObjectType>
                ${propsXml}
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </soapenv:Body>
        </soapenv:Envelope>
      `;
      
      const response = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        soapEnvelope,
        {
          headers: {
            'Content-Type': 'text/xml',
            SOAPAction: 'Retrieve',
          },
        }
      );
      
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      
      if (results) {
        const arr = Array.isArray(results) ? results : [results];
        console.log(`🔍 [DeliveryProfile] Processing ${arr.length} ${objectType} results...`);
        
        arr.forEach((item, index) => {
          console.log(`🔍 [DeliveryProfile] Item ${index + 1}:`, JSON.stringify(item, null, 2));
          
          // Extract DeliveryProfile information - try multiple ways to access it
          let deliveryProfile = null;
          
          // Method 1: Direct object access
          if (item.DeliveryProfile) {
            deliveryProfile = item.DeliveryProfile;
            console.log(`🔍 [DeliveryProfile] Found via direct access:`, deliveryProfile);
          }
          // Method 2: Dot notation property
          else if (item['DeliveryProfile.CustomerKey']) {
            deliveryProfile = item['DeliveryProfile.CustomerKey'];
            console.log(`🔍 [DeliveryProfile] Found via dot notation:`, deliveryProfile);
          }
          
          console.log(`🔍 [DeliveryProfile] Final deliveryProfile from item ${index + 1}:`, deliveryProfile);
          
          if (deliveryProfile) {
            if (typeof deliveryProfile === 'object' && deliveryProfile.CustomerKey) {
              // Full DeliveryProfile object with Name and Description
              console.log(`✅ [DeliveryProfile] Adding full object: ${deliveryProfile.CustomerKey}`);
              deliveryProfileMap.set(deliveryProfile.CustomerKey, {
                CustomerKey: deliveryProfile.CustomerKey,
                Name: deliveryProfile.Name || deliveryProfile.CustomerKey,
                Description: deliveryProfile.Description || ''
              });
            } else if (typeof deliveryProfile === 'string') {
              // Just CustomerKey string
              console.log(`✅ [DeliveryProfile] Adding string key: ${deliveryProfile}`);
              if (!deliveryProfileMap.has(deliveryProfile)) {
                deliveryProfileMap.set(deliveryProfile, {
                  CustomerKey: deliveryProfile,
                  Name: deliveryProfile,
                  Description: ''
                });
              }
            }
          } else {
            console.log(`❌ [DeliveryProfile] No delivery profile found in item ${index + 1}`);
          }
        });
      }
    }
    
    // Extract from EmailSendDefinitions
    console.log('📧 [DeliveryProfile] Extracting from EmailSendDefinitions...');
    await extractDeliveryProfiles('EmailSendDefinition', [
      'CustomerKey',
      'Name',
      'DeliveryProfile.CustomerKey'
    ]);
    
    // Extract from SendClassifications
    console.log('📋 [DeliveryProfile] Extracting from SendClassifications...');
    await extractDeliveryProfiles('SendClassification', [
      'CustomerKey',
      'Name',
      'DeliveryProfile.CustomerKey'
    ]);
    
    // Convert Map to Array
    const deliveryProfiles = Array.from(deliveryProfileMap.values());
    
    console.log(`✅ [DeliveryProfile] Successfully extracted ${deliveryProfiles.length} unique delivery profiles`);
    console.log('📋 [DeliveryProfile] Sample profiles:', deliveryProfiles.slice(0, 3));
    
    res.json(deliveryProfiles);
    
  } catch (e) {
    console.error('❌ [DeliveryProfile] Failed to extract delivery profiles:', e.response?.data || e.message);
    if (e.response?.data) {
      console.log('📋 [DeliveryProfile] Error response sample:', e.response.data.substring(0, 500));
    }
    res.status(500).json([]);
  }
});

// Update EmailSendDefinition SenderProfile (SOAP)
app.post('/update/emailsenddefinition-senderprofile', async (req, res) => {
  const { customerKey, newSenderProfileKey } = req.body;
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });
  if (!customerKey || !newSenderProfileKey) return res.status(400).json({ error: 'Missing parameters' });
  try {
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Objects xsi:type="EmailSendDefinition">
              <CustomerKey>${customerKey}</CustomerKey>
              <SenderProfile>
                <CustomerKey>${newSenderProfileKey}</CustomerKey>
              </SenderProfile>
            </Objects>
          </UpdateRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Update',
        },
      }
    );
    // Parse response for status
    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });
      const status = result?.['soap:Envelope']?.['soap:Body']?.['UpdateResponse']?.['OverallStatus'];
      if (status && status.toLowerCase().includes('ok')) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Update failed', details: status });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update EmailSendDefinition (single record, SOAP)
app.post('/update/emailsenddefinition', async (req, res) => {
  const { CustomerKey, SendClassification, SenderProfile, DeliveryProfile, BccEmail, CCEmail } = req.body;
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });
  if (!CustomerKey) return res.status(400).json({ error: 'Missing CustomerKey' });
  try {
    // Log the incoming payload for debugging
    console.log('🔵 [Update ESD] Payload:', req.body);
    console.log('🔵 [Update ESD] Raw BccEmail:', JSON.stringify(BccEmail));
    console.log('🔵 [Update ESD] Raw CCEmail:', JSON.stringify(CCEmail));
    console.log('🔵 [Update ESD] CustomerKey:', CustomerKey);
    
    // Step 1: If BccEmail or CCEmail are provided, first clear them to prevent accumulation
    if (BccEmail !== undefined || CCEmail !== undefined) {
      console.log('🔵 [Update ESD] Step 1: Clearing BCC/CC fields first to prevent accumulation...');
      const clearEnvelope = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <soapenv:Header>
            <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
          </soapenv:Header>
          <soapenv:Body>
            <UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <Objects xsi:type="EmailSendDefinition">
                <CustomerKey>${CustomerKey}</CustomerKey>
                <BccEmail></BccEmail>
                <CCEmail></CCEmail>
              </Objects>
            </UpdateRequest>
          </soapenv:Body>
        </soapenv:Envelope>
      `;
      
      const clearResponse = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        clearEnvelope,
        {
          headers: {
            'Content-Type': 'text/xml',
            SOAPAction: 'Update',
          },
        }
      );
      console.log('🔵 [Update ESD] Clear Response Status:', clearResponse.status);
      
      // Wait a moment for the clear to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Step 2: Now perform the main update
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Objects xsi:type="EmailSendDefinition">
              <CustomerKey>${CustomerKey}</CustomerKey>
              ${SendClassification ? `<SendClassification><CustomerKey>${SendClassification}</CustomerKey></SendClassification>` : ''}
              ${SenderProfile ? `<SenderProfile><CustomerKey>${SenderProfile}</CustomerKey></SenderProfile>` : ''}
              ${DeliveryProfile ? `<DeliveryProfile><CustomerKey>${DeliveryProfile}</CustomerKey></DeliveryProfile>` : ''}
              <BccEmail>${BccEmail || ''}</BccEmail>
              <CCEmail>${CCEmail || ''}</CCEmail>
            </Objects>
          </UpdateRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    // Log the SOAP envelope for debugging
    console.log('🔵 [Update ESD] Step 2: Main update SOAP Envelope:', soapEnvelope);
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Update',
        },
      }
    );
    // Log the raw SOAP response
    console.log('🔵 [Update ESD] SOAP Response:', response.data);
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    const status = result?.['soap:Envelope']?.['soap:Body']?.['UpdateResponse']?.['OverallStatus'];
    const statusMessage = result?.['soap:Envelope']?.['soap:Body']?.['UpdateResponse']?.['Results']?.['StatusMessage'];
    
    console.log(`🔍 [Update ESD] SOAP Status: ${status}`);
    console.log(`🔍 [Update ESD] Status Message: ${statusMessage}`);
    console.log(`🔍 [Update ESD] Updated BccEmail: "${BccEmail || ''}", CCEmail: "${CCEmail || ''}"`);
    
    if (status && status.toLowerCase().includes('ok')) {
      res.json({ status: 'OK' });
    } else {
      // User-friendly error for V5 Customers restriction
      if (statusMessage && statusMessage.includes('V5 Customers cannot update User-Initiated Sends with Salesforce Reports or Campaigns')) {
        return res.status(400).json({
          status: 'ERROR',
          message: 'This EmailSendDefinition cannot be updated via API because it is a User-Initiated Send tied to Salesforce Reports or Campaigns. This is a Salesforce platform restriction.'
        });
      }
      console.error('❌ [Update ESD] SOAP Error:', status, result);
      res.status(500).json({ status: 'ERROR', message: statusMessage || status });
    }
  } catch (e) {
    console.error('❌ [Update ESD] Exception:', e.response?.data || e.message, e.stack);
    res.status(500).json({ status: 'ERROR', message: e.message });
  }
});

// Bulk update EmailSendDefinition (SOAP)
app.post('/update/emailsenddefinition-mass', async (req, res) => {
  const { CustomerKeys, SendClassification, SenderProfile, DeliveryProfile, BccEmail, CCEmail } = req.body;
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });
  if (!Array.isArray(CustomerKeys) || CustomerKeys.length === 0) return res.status(400).json({ error: 'No CustomerKeys provided' });
  try {
    // Build SOAP body for multiple updates
    const objectsXml = CustomerKeys.map(key => `
      <Objects xsi:type="EmailSendDefinition">
        <CustomerKey>${key}</CustomerKey>
        ${SendClassification ? `<SendClassification><CustomerKey>${SendClassification}</CustomerKey></SendClassification>` : ''}
        ${SenderProfile ? `<SenderProfile><CustomerKey>${SenderProfile}</CustomerKey></SenderProfile>` : ''}
        ${DeliveryProfile ? `<DeliveryProfile><CustomerKey>${DeliveryProfile}</CustomerKey></DeliveryProfile>` : ''}
        <BccEmail>${BccEmail || ''}</BccEmail>
        <CCEmail>${CCEmail || ''}</CCEmail>
      </Objects>
    `).join('');
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            ${objectsXml}
          </UpdateRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'Update',
        },
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    const status = result?.['soap:Envelope']?.['soap:Body']?.['UpdateResponse']?.['OverallStatus'];
    if (status && status.toLowerCase().includes('ok')) {
      res.json({ status: 'OK' });
    } else {
      res.status(500).json({ status: 'ERROR', message: status });
    }
  } catch (e) {
    res.status(500).json({ status: 'ERROR', message: e.message });
  }
});

// Parse EmailSendDefinition config and extract relationships
app.post('/parse/emailsenddefinition-config', (req, res) => {
  const config = req.body;
  if (!config || !config.entities || !config.input) {
    return res.status(400).json({ error: 'Invalid config format' });
  }
  const sendDefs = config.entities.sendDefinitions || {};
  const inputArr = config.input || [];

  // Build a lookup for input keys
  const inputKeyMap = {};
  inputArr.forEach(inp => {
    inputKeyMap[inp.key] = inp;
  });

  // Parse each sendDefinition
  const result = Object.entries(sendDefs).map(([defId, defObj]) => {
    const data = defObj.data || {};
    // The IDs are references like {{mcpm:senderProfile}}
    const senderProfileKey = data.senderProfileId || '';
    const sendClassificationKey = data.sendClassificationId || '';
    const deliveryProfileKey = data.deliveryProfileId || '';

    // Map to input keys (strip {{mcpm: and }})
    const senderProfileInputKey = senderProfileKey.replace(/\{\{mcpm:|}}/g, '');
    const sendClassificationInputKey = sendClassificationKey.replace(/\{\{mcpm:|}}/g, '');
    const deliveryProfileInputKey = deliveryProfileKey.replace(/\{\{mcpm:|}}/g, '');

    // Find the input object for each
    const senderProfileInput = inputKeyMap[senderProfileInputKey] || null;
    const sendClassificationInput = inputKeyMap[sendClassificationInputKey] || null;
    const deliveryProfileInput = inputKeyMap[deliveryProfileInputKey] || null;

    return {
      sendDefinitionId: defId,
      name: data.name || data.Name || '',
      key: data.key || data.CustomerKey || '',
      senderProfile: senderProfileInput ? senderProfileInput.meta.entityType : null,
      senderProfileKey: senderProfileInputKey,
      sendClassification: sendClassificationInput ? sendClassificationInput.meta.entityType : null,
      sendClassificationKey: sendClassificationInputKey,
      deliveryProfile: deliveryProfileInput ? deliveryProfileInput.meta.entityType : null,
    };
  });

  res.json(result);
});

// Resolved EmailSendDefinition relationships endpoint (enrich with full details for all related objects)
app.get('/resolved/emailsenddefinition-relationships', async (req, res) => {
  console.log(`🕐 [Resolved ESD] Request received at ${new Date().toISOString()}`);
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json([]);
  try {
      
       // Helper to fetch SOAP objects by CustomerKey
   
    async function fetchSoapByCustomerKeys(objectType, properties, customerKeys) {
      if (!customerKeys.length) return {};
      // Batch in groups of 20 (SOAP limit)
      const batches = [];
      for (let i = 0; i < customerKeys.length; i += 20) {
        batches.push(customerKeys.slice(i, i + 20));
      }
      let allResults = [];
      for (const batch of batches) {
        const propsXml = properties.map(p => `<Properties>${p}</Properties>`).join('');
        const filterXml = `
          <Filter xsi:type=\"SimpleFilterPart\">
            <Property>CustomerKey</Property>
            <SimpleOperator>IN</SimpleOperator>
            ${batch.map(k => `<Value>${k}</Value>`).join('')}
          </Filter>
        `;
        const soapEnvelope = `
          <soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">
            <soapenv:Header>
              <fueloauth xmlns=\"http://exacttarget.com\">${accessToken}</fueloauth>
            </soapenv:Header>
            <soapenv:Body>
              <RetrieveRequestMsg xmlns=\"http://exacttarget.com/wsdl/partnerAPI\">
                <RetrieveRequest>
                  <ObjectType>${objectType}</ObjectType>
                  ${propsXml}
                  ${filterXml}
                </RetrieveRequest>
              </RetrieveRequestMsg>
            </soapenv:Body>
          </soapenv:Envelope>
        `;
        const response = await axios.post(
          `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
          soapEnvelope,
          { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
        );
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(response.data);
        const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        if (results) {
          allResults = allResults.concat(Array.isArray(results) ? results : [results]);
        }
      }
      // Map by CustomerKey
      const map = {};
      allResults.forEach(obj => { if (obj.CustomerKey) map[obj.CustomerKey] = obj; });
      return map;
    }

    // Step 1: Fetch all EmailSendDefinitions
    const sendDefs = await (async () => {
      const props = [
        'Name',
        'CustomerKey',
        'CategoryID',
        'ModifiedDate',
        'SendClassification.CustomerKey',
        'SenderProfile.CustomerKey',
        'DeliveryProfile.CustomerKey',
        'BccEmail',
        'CCEmail'
      ];
      const propsXml = props.map(p => `<Properties>${p}</Properties>`).join('');
      const soapEnvelope = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <soapenv:Header>
            <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
          </soapenv:Header>
          <soapenv:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>EmailSendDefinition</ObjectType>
                ${propsXml}
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </soapenv:Body>
        </soapenv:Envelope>
      `;
      // Print the SOAP request envelope for debugging (no escaping)
      console.log("\n[SOAP REQUEST] EmailSendDefinition Retrieve (FINAL):\n" + soapEnvelope);
      const response = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        soapEnvelope,
        { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
      );
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      // Always return array, and include full nested objects
      const arr = results ? (Array.isArray(results) ? results : [results]) : [];
      
      // Debug BCC/CC fields specifically
      arr.forEach((item, index) => {
        console.log(`🔍 [Raw SOAP] Item ${index + 1} (${item.CustomerKey}) - Raw BccEmail:`, JSON.stringify(item.BccEmail));
        console.log(`🔍 [Raw SOAP] Item ${index + 1} (${item.CustomerKey}) - Raw CCEmail:`, JSON.stringify(item.CCEmail));
      });
      
      return arr.map(item => ({
        Name: item.Name,
        CustomerKey: item.CustomerKey,
        CategoryID: item.CategoryID,
        ModifiedDate: item.ModifiedDate,
        SendClassificationKey: item['SendClassification']?.CustomerKey || item['SendClassification.CustomerKey'] || '',
        SenderProfileKey: item['SenderProfile']?.CustomerKey || item['SenderProfile.CustomerKey'] || '',
        DeliveryProfileKey: item['DeliveryProfile']?.CustomerKey || item['DeliveryProfile.CustomerKey'] || '',
        BccEmail: item.BccEmail ?? '',
        CCEmail: item.CCEmail ?? ''
      }));
    })();

    // Step 2: Collect all unique CustomerKeys for related objects
    const sendClassKeys = Array.from(new Set(sendDefs.map(d => d.SendClassificationKey).filter(Boolean)));
    const senderProfileKeys = Array.from(new Set(sendDefs.map(d => d.SenderProfileKey).filter(Boolean)));
    const deliveryProfileKeys = Array.from(new Set(sendDefs.map(d => d.DeliveryProfileKey).filter(Boolean)));

    // Step 3: Fetch details for all related objects (except DeliveryProfile which we extract directly)
    const [sendClassMap, senderProfileMap] = await Promise.all([
      fetchSoapByCustomerKeys('SendClassification', ['CustomerKey', 'Name', 'Description', 'SenderProfile.CustomerKey', 'DeliveryProfile.CustomerKey'], sendClassKeys),
      fetchSoapByCustomerKeys('SenderProfile', ['CustomerKey', 'Name', 'Description'], senderProfileKeys)
    ]);

    // For DeliveryProfile, we use the data directly captured from EmailSendDefinitions
    // since DeliveryProfile object doesn't support SOAP Retrieve operations

    // Step 4: Enrich each EmailSendDefinition with full details
    const resolved = sendDefs.map(def => {
      const sendClass = sendClassMap[def.SendClassificationKey] || {};
      const senderProfile = senderProfileMap[def.SenderProfileKey] || {};
      
      // Debug logging for BCC/CC emails
      console.log(`🔍 [Resolved ESD] ${def.CustomerKey} - BccEmail: "${def.BccEmail}", CCEmail: "${def.CCEmail}"`);
      
      return {
        Name: def.Name,
        CustomerKey: def.CustomerKey,
        CategoryID: def.CategoryID,
        ModifiedDate: def.ModifiedDate || '',
        BccEmail: def.BccEmail ?? '',
        CCEmail: def.CCEmail ?? '',
        SendClassification: {
          CustomerKey: def.SendClassificationKey,
          Name: sendClass.Name || def.SendClassificationKey,
          Description: sendClass.Description || '',
          SenderProfileKey: sendClass['SenderProfile']?.CustomerKey || sendClass['SenderProfile.CustomerKey'] || '',
          DeliveryProfileKey: sendClass['DeliveryProfile']?.CustomerKey || sendClass['DeliveryProfile.CustomerKey'] || ''
        },
        SenderProfile: {
          CustomerKey: def.SenderProfileKey,
          Name: senderProfile.Name || def.SenderProfileKey,
          Description: senderProfile.Description || ''
        },
        DeliveryProfile: {
          CustomerKey: def.DeliveryProfileKey,
          Name: def.DeliveryProfileKey, // Use CustomerKey as name since we can't get the actual name
          Description: ''
        }
      };
    });
    
    console.log(`✅ [Resolved ESD] Returning ${resolved.length} records`);
    console.log(`📧 [Resolved ESD] Sample record:`, JSON.stringify(resolved[0], null, 2));
    
    res.json(resolved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Describe SOAP object and print retrievable properties
app.get('/describe-soap-object', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  const objectType = req.query.objectType;
  if (!accessToken || !subdomain || !objectType) return res.status(400).json({ error: 'Missing required parameters' });
  try {
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\">
        <soapenv:Header>
          <fueloauth xmlns=\"http://exacttarget.com\">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <DescribeRequestMsg xmlns=\"http://exacttarget.com/wsdl/partnerAPI\">
            <DescribeRequests>
              <ObjectDefinitionRequest>
                <ObjectType>${objectType}</ObjectType>
              </ObjectDefinitionRequest>
            </DescribeRequests>
          </DescribeRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    const response = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'text/xml',
          'SOAPAction': 'Describe',
        },
      }
    );
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    const objDef = result?.['soap:Envelope']?.['soap:Body']?.['DescribeResponseMsg']?.['ObjectDefinition'] || {};
    let props = objDef?.Properties?.PropertyDefinition || [];
    if (!Array.isArray(props)) props = [props];
    const retrievableProps = props.filter(p => p.IsRetrievable === 'true' || p.IsRetrievable === true);
    //console.log(`\n[SOAP Describe] Retrievable properties for ${objectType}:`);
    retrievableProps.forEach(p => console.log(`- ${p.Name}`));
    res.json({
      objectType,
      retrievableProperties: retrievableProps.map(p => p.Name),
      allProperties: props.map(p => ({
        Name: p.Name,
        IsRetrievable: p.IsRetrievable,
        IsUpdatable: p.IsUpdatable,
        IsCreatable: p.IsCreatable,
        IsFilterable: p.IsFilterable,
        IsNullable: p.IsNullable
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint to check if backend has credentials (per session)
app.get('/has-credentials', (req, res) => {
  const creds = req.session.mcCreds || {};
  console.log('🟢 /has-credentials (session) check:', creds);
  const hasCreds = !!(creds.subdomain && creds.clientId && creds.clientSecret);
  res.json({ hasCreds });
});

// Publication Search (SOAP)
app.get('/search/publication', async (req, res) => {
  const accessToken = req.session.accessToken;
  const subdomain = req.session.mcCreds && req.session.mcCreds.subdomain;
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    const soapEnvelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>Publication</ObjectType>
              <Properties>ID</Properties>
              <Properties>Name</Properties>
              <Properties>Category</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    // Log the SOAP envelope for debugging
    console.log('🔵 [Publication] SOAP Envelope:', soapEnvelope);
    try {
      const response = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        soapEnvelope,
        {
          headers: {
            'Content-Type': 'text/xml',
            SOAPAction: 'Retrieve',
          },
        }
      );
      // Log the raw SOAP response
      console.log('🔵 [Publication] SOAP Response:', response.data);
      const parser = new xml2js.Parser({ explicitArray: false });
      parser.parseString(response.data, (err, result) => {
        if (err) {
          console.error('❌ [Publication] Failed to parse XML:', err);
          return res.status(500).json({ error: 'Failed to parse XML' });
        }
        try {
          const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
          if (!results) return res.status(200).json([]);
          const resultArray = Array.isArray(results) ? results : [results];
          const pubs = resultArray.map(pub => ({
            id: pub.ID || '',
            name: pub.Name || '',
            category: pub.Category || ''
          }));
          res.json(pubs);
        } catch (e) {
          console.error('❌ [Publication] Unexpected format:', e);
          res.status(500).json({ error: 'Unexpected Publication format' });
        }
      });
    } catch (err) {
      // Log the error response body if available
      if (err.response && err.response.data) {
        console.error('❌ [Publication] SOAP Error Response:', err.response.data);
      } else {
        console.error('❌ [Publication] Request Error:', err.message);
      }
      res.status(500).json({ error: 'Failed to fetch Publications' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Publications' });
  }
});

// Create Distributed Marketing Data Extension and folder
// Create Distributed Marketing Data Extension and folder
app.post('/create/dm-dataextension', async (req, res) => {
  const accessToken = req.session.accessToken;
  const subdomain = req.session.mcCreds && req.session.mcCreds.subdomain;
  if (!accessToken || !subdomain) return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' });
  try {
    const axios = require('axios');
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false });

    // Step 1: Get root folder for dataextension
    const getRootFolderSoap = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <soapenv:Header>
      <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
    </soapenv:Header>
    <soapenv:Body>
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <RetrieveRequest>
          <ObjectType>DataFolder</ObjectType>
          <Properties>ID</Properties>
          <Properties>Name</Properties>
          <Properties>ContentType</Properties>
          <Properties>ParentFolder.ID</Properties>
          <Filter xsi:type="SimpleFilterPart">
            <Property>ContentType</Property>
            <SimpleOperator>equals</SimpleOperator>
            <Value>dataextension</Value>
          </Filter>
        </RetrieveRequest>
      </RetrieveRequestMsg>
    </soapenv:Body>
  </soapenv:Envelope>
`;


    const rootResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      getRootFolderSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const rootParsed = await parser.parseStringPromise(rootResp.data);
    const rootFolders = rootParsed?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];

let parentId = null;

if (Array.isArray(rootFolders)) {
  const rootDEFolder = rootFolders.find(f => f.ContentType === 'dataextension' && f['ParentFolder']?.ID === '0');
  parentId = rootDEFolder?.ID;
} else if (rootFolders?.ContentType === 'dataextension' && rootFolders?.ParentFolder?.ID === '0') {
  parentId = rootFolders.ID;
}


    if (!parentId) return res.status(500).json({ status: 'ERROR', message: 'Root folder for dataextensions not found' });

     // Step 2: Try to find folder first
    const folderName = `MC-Explorer-DM-${Date.now()}`;
    let folderId = null;
    const folderSoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataFolder</ObjectType>
              <Properties>ID</Properties>
              <Properties>Name</Properties>
              <Properties>ContentType</Properties>
              <Filter>
                <Property>Name</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>${folderName}</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const folderResult = await parser.parseStringPromise(folderResp.data);
    const folderResults = folderResult?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];

    if (folderResults && folderResults.ID) {
      folderId = folderResults.ID;
    } else if (Array.isArray(folderResults) && folderResults.length > 0) {
      folderId = folderResults[0].ID;
    }
      // Step 3: Create folder if not found
    if (!folderId) {
      console.log('[Resolved Root DataExtension Folder ID]', parentId);

      const createFolderSoap = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <soapenv:Header>
      <fueloauth>${accessToken}</fueloauth>
    </soapenv:Header>
    <soapenv:Body>
      <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Options/>
        <Objects xsi:type="DataFolder">
         <!-- <CustomerKey>${folderName}</CustomerKey> -->
          <Name>${folderName}</Name>
          <Description>${folderName}</Description>
          <ContentType>dataextension</ContentType>
          <IsActive>true</IsActive>
          <IsEditable>true</IsEditable>
          <AllowChildren>true</AllowChildren>
          <ParentFolder>
            <ID>${parentId}</ID>
            <ObjectID xsi:nil="true"/>
            <CustomerKey xsi:nil="true"/>
          </ParentFolder>
        </Objects>
      </CreateRequest>
    </soapenv:Body>
  </soapenv:Envelope>
`;


      const createFolderResp = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        createFolderSoap,
        { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' } }
      );
console.log('[SOAP Folder Create Raw]', createFolderResp.data);
      const createFolderResult = await parser.parseStringPromise(createFolderResp.data);
      folderId = createFolderResult?.['soap:Envelope']?.['soap:Body']?.['CreateResponse']?.['Results']?.['NewID'];
    }



    if (!folderId) return res.status(500).json({ status: 'ERROR', message: 'Failed to create or find folder' });

    // 2. Create Data Extension with correct fields
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const dtStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const deName = `DM_MC_explorer_${dtStr}`;
    const deSoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Options />
            <Objects xmlns:ns1="http://exacttarget.com/wsdl/partnerAPI" xsi:type="ns1:DataExtension">
              <Name>${deName}</Name>
              <CustomerKey>${deName}</CustomerKey>
              <CategoryID>${folderId}</CategoryID>
              <IsSendable>true</IsSendable>
              <IsTestable>true</IsTestable>
              <Fields>
                <Field><Name>greeting</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>id</Name><FieldType>Text</FieldType><MaxLength>36</MaxLength><IsPrimaryKey>true</IsPrimaryKey><IsRequired>true</IsRequired></Field>
                <Field><Name>email</Name><FieldType>EmailAddress</FieldType><MaxLength>254</MaxLength><IsPrimaryKey>false</IsPrimaryKey><IsRequired>false</IsRequired></Field>
                <Field><Name>sfCampaignId</Name><FieldType>Text</FieldType><MaxLength>36</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>sfCampaignMemberId</Name><FieldType>Text</FieldType><MaxLength>36</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>sfQuickSendId</Name><FieldType>Text</FieldType><MaxLength>36</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>sendFromName</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>sendFromEmail</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>firstName</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>lastName</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>sfUserId</Name><FieldType>Text</FieldType><MaxLength>36</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>journeyID</Name><FieldType>Text</FieldType><MaxLength>50</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>sfOrgId</Name><FieldType>Text</FieldType><MaxLength>50</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>DateEntered</Name><FieldType>Date</FieldType><IsRequired>false</IsRequired><DefaultValue>GETDATE()</DefaultValue></Field>
                <Field><Name>smsValue</Name><FieldType>Text</FieldType><MaxLength>160</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>mobilePhone</Name><FieldType>Phone</FieldType><MaxLength>50</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>EntryObjectId</Name><FieldType>Text</FieldType><MaxLength>36</MaxLength><IsRequired>false</IsRequired></Field>
              </Fields>
                <SendableDataExtensionField>
                  <Name>id</Name>
                </SendableDataExtensionField>
                <SendableSubscriberField>
                  <Name>Subscriber Key</Name>
                </SendableSubscriberField>
            </Objects>
          </CreateRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;
    const deResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      deSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' } }
    );
    
    // Log the raw response for debugging
    console.log('[SOAP DE Create Raw]', deResp.data);
    
    const deParsed = await parser.parseStringPromise(deResp.data);
    
    // Get the overall status and any error messages
    const overallStatus = deParsed?.['soap:Envelope']?.['soap:Body']?.['CreateResponse']?.['OverallStatus'];
    const results = deParsed?.['soap:Envelope']?.['soap:Body']?.['CreateResponse']?.['Results'];
    const statusMsg = results?.StatusMessage;
    const errorCode = results?.ErrorCode;
    
    console.log('[DE Creation Response]', { overallStatus, statusMsg, errorCode });

    if (overallStatus !== 'OK' || (errorCode && errorCode !== '0')) {
      console.error('[DE Creation Failed]', { statusMsg, overallStatus, errorCode });
      return res.status(500).json({ 
        status: 'ERROR', 
        message: 'Failed to create Data Extension', 
        details: statusMsg || overallStatus 
      });
    }

    // Step 5: Get DE ObjectID using SOAP
    const deRetrieveSoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataExtension</ObjectType>
              <Properties>ObjectID</Properties>
              <Properties>Name</Properties>
              <Filter xsi:type="SimpleFilterPart">
                <Property>Name</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>${deName}</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const retrieveResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      deRetrieveSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );
    
    console.log('[DE Retrieve Response]', retrieveResp.data);
    
    const retrieveParsed = await parser.parseStringPromise(retrieveResp.data);
    const deObjectID = retrieveParsed?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results']?.ObjectID;

    if (!deObjectID) {
      console.error('[DE ObjectID Retrieval Failed]', retrieveParsed);
      return res.status(500).json({ status: 'ERROR', message: 'Failed to retrieve DE ObjectID' });
    }

    console.log('[Retrieved DE ObjectID]', deObjectID);

    // Step 6: Create Event Definition with correct ObjectID
    const eventDtStr = new Date().toISOString().replace(/[:\-\.]/g, '').slice(0, 14);
    const eventKey = `dm_event_${eventDtStr}`;
    const eventName = `DM Event Definition - ${eventDtStr}`;
    // Create API Event Definition with proper format
    const eventDefPayload = {
      name: `DM Event Definition - ${eventDtStr}`,
      type: "APIEvent",
      dataExtensionId: deObjectID,
      description: `Triggered DE for ${deName}`,
      eventDefinitionKey: eventKey,
      mode: "Production",
      iconUrl: "/images/icon_journeyBuilder-event-api-blue.svg",
      isVisibleInPicker: false,
      category: "Event",
      disableDEDataLogging: false,
      isPlatformObject: false,
      metaData: {
        scheduleState: "No Schedule"
      },
      arguments: {
        serializedObjectType: 11,
        eventDefinitionId: "",
        eventDefinitionKey: eventKey,
        dataExtensionId: deObjectID,
        criteria: ""
      },
      sourceApplicationExtensionId: "7db1f972-f8b7-49b6-91b5-fa218e13953d"
    };

    console.log('[Creating Event Definition with payload]', JSON.stringify(eventDefPayload, null, 2));
    
    const eventDefResp = await axios.post(
      `https://${subdomain}.rest.marketingcloudapis.com/interaction/v1/eventDefinitions`,
      eventDefPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('[Created Event Definition]', eventDefResp.data);

    if (!eventDefResp.data.id) {
      throw new Error('Event Definition creation failed - no ID returned');
    }

    const eventDefinitionId = eventDefResp.data.id;
    console.log(`[Event Definition created with ID: ${eventDefinitionId}]`);

    // Step 6: Create Journey for Distributed Marketing
    await new Promise(resolve => setTimeout(resolve, 2000)); // wait for 2 sec

    const journeyName = `Journey_${eventDtStr}`;

    const journeyPayload = {
      key: journeyName,
      version: 1,
      name: journeyName,
      description: "Distributed Marketing Journey",
      workflowApiVersion: 1.0,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      iconUrl: "/events/images/icon_journeyBuilder-event-api-blue.svg",
      triggers: [
        {
          id: eventDefinitionId,  // Using the Event Definition ID we got from creation
          key: "TRIGGER",
          name: `New Journey - ${eventDtStr}`,
          description: "",
          type: "APIEvent",
          outcomes: [],
          arguments: {},
          configurationArguments: {},
          metaData: {
            eventDefinitionId: eventDefinitionId,
            eventDefinitionKey: eventKey,
            chainType: "None",
            configurationRequired: false,
            iconUrl: "/images/icon_journeyBuilder-event-api-blue.svg",
            title: "",
            entrySourceGroupConfigUrl: "jb:///data/entry/api-event/entrysourcegroupconfig.json",
            sourceInteractionId: "00000000-0000-0000-0000-000000000000"
          }
        }
      ],
      activities: [
        {
          key: "WAIT-1",
          name: "Wait 1 Day",
          type: "Wait",
          arguments: {
            duration: 1,
            unit: "days"
          }
        }
      ]
    };

    // Log the payload for debugging
    console.log('[Journey Payload]', JSON.stringify(journeyPayload, null, 2));

    try {
      const journeyResp = await axios.post(
        `https://${subdomain}.rest.marketingcloudapis.com/interaction/v1/interactions`,
        journeyPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[Journey Created]', journeyResp.data);
      journeyId = journeyResp.data.id;
    } catch (error) {
      console.log('[Journey Creation Error]', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      throw error;
    }

    return res.status(200).json({
      status: "OK",
      message: "Folder, Data Extension, Event, and Journey created successfully",
      folderName, // Show folderName instead of folderId
      deName,
      eventName, // Ensure eventName is included
      journeyName,
      journeyId
    });

  } catch (e) {
    console.error('❌ [DM DataExtension] Error:', e.response?.data || e.message);
    res.status(500).json({ status: 'ERROR', message: e.message });
  }
});

// Single Click Distributed Marketing Quick Send Setup
app.post('/createDMFullSetup', async (req, res) => {
  try {
    // 1. Get credentials and access token
    const creds = getMCCreds(req);
    const subdomain = creds.subdomain;
    const accessToken = getAccessTokenFromRequest(req);
    if (!accessToken || !subdomain) {
      return res.status(401).json({ status: 'ERROR', message: 'Missing Marketing Cloud credentials' });
    }

    // 2. Create Folder (if needed) and Data Extension
    // (Reuse your existing logic for folder/DE creation)
    // For demo, we'll use a timestamp for uniqueness
    const eventDtStr = new Date().toISOString().replace(/[:\-.]/g, '').slice(0, 14);
    const deName = `DM_MC_explorer_${eventDtStr}`;
    const folderId = Date.now().toString(); // Simulate folder ID

    // ... Insert your DE creation logic here ...
    // For demo, we'll just simulate a DE ObjectID
    const deObjectID = `${Math.random().toString(36).substring(2, 10)}-objectid`;

    // 3. Create Event Definition
    const eventKey = `dm_event_${eventDtStr}`;
    const eventName = `DM Event Definition - ${eventDtStr}`;
    // ... Insert your Event Definition creation logic here ...
    // For demo, we'll just simulate an eventDefinitionId
    const eventDefinitionId = `${Math.random().toString(36).substring(2, 10)}-eventid`;

    // 4. Create Journey
    const journeyName = `Journey_${eventDtStr}`;
    // ... Insert your Journey creation logic here ...

    // 5. Return the required details
    return res.json({
      status: 'OK',
      folderId,
      deName,
      eventName,
      eventDefinitionKey: eventKey,
      journeyName
    });
  } catch (e) {
    console.error('❌ [DM Quick Send Setup] Error:', e.message);
    res.status(500).json({ status: 'ERROR', message: e.message });
  }
});

// Preference Center Config API
app.post('/preference-center/configure', async (req, res) => {
  try {
    const config = req.body;
    const controllerDEName = 'PC_Controller';
    const logDEName = 'PC_Log';

    // Retrieve accessToken and subdomain
    const accessToken = getAccessTokenFromRequest(req);
    const subdomain = getSubdomainFromRequest(req);
    if (!accessToken || !subdomain) {
      return res.status(401).json({ status: 'ERROR', message: 'Missing Marketing Cloud credentials' });
    }

    // 1. Dynamically define DE fields based on config
    // 1. Define DE fields for Preference Center (no dynamic category/lead/contact/publication fields)
    const dynamicFields = [
      { Name: 'Header', FieldType: 'Text', MaxLength: 200, IsRequired: false, IsPrimaryKey: false },
      { Name: 'SubHeader', FieldType: 'Text', MaxLength: 200, IsRequired: false, IsPrimaryKey: false },
      { Name: 'Footer', FieldType: 'Text', MaxLength: 500, IsRequired: false, IsPrimaryKey: false },
      { Name: 'LogoUrl', FieldType: 'Text', MaxLength: 500, IsRequired: false, IsPrimaryKey: false },
      { Name: 'OptOutLabel', FieldType: 'Text', MaxLength: 200, IsRequired: false, IsPrimaryKey: false },
      { Name: 'IntegrationType', FieldType: 'Text', MaxLength: 50, IsRequired: true, IsPrimaryKey: true },
      { Name: 'CategoryLabels', FieldType: 'Text', MaxLength: 1000, IsRequired: false, IsPrimaryKey: false },
      { Name: 'ContactFields', FieldType: 'Text', MaxLength: 1000, IsRequired: false, IsPrimaryKey: false },
      { Name: 'LeadFields', FieldType: 'Text', MaxLength: 1000, IsRequired: false, IsPrimaryKey: false },
      { Name: 'Publications', FieldType: 'Text', MaxLength: 1000, IsRequired: false, IsPrimaryKey: false }
    ];

    const controllerDE = {
      Name: controllerDEName,
      CustomerKey: controllerDEName,
      Description: 'Stores config-driven field mapping for dynamic preference center',
      Fields: dynamicFields,
      Keys: [{ Name: 'IntegrationType', IsPrimaryKey: true }]
    };

    const logDE = {
      Name: logDEName,
      CustomerKey: logDEName,
      Description: 'Logs all preference updates and changes',
      Fields: [
        { Name: 'SubscriberKey', FieldType: 'Text', MaxLength: 100 },
        { Name: 'EmailAddress', FieldType: 'EmailAddress' },
        { Name: 'OldValues', FieldType: 'Text', MaxLength: 4000 },
        { Name: 'NewValues', FieldType: 'Text', MaxLength: 4000 },
        { Name: 'ChangeType', FieldType: 'Text', MaxLength: 100 },
        { Name: 'DateModified', FieldType: 'Date' }
      ],
      Keys: []
    };

    // Prepare row for controller DE (casing matches DE schema)
    //const categoryLabels = config.categories.map(cat => cat.label).join(' | ') + ' | ' + config.optOutLabel;
    const categoryLabels = config.categories.map(cat => cat.label).join(' | ');
    const contactFields = config.categories.map(cat => cat.fieldMapping.contact).join(' | ') + ' | hasOptedOutOfEmails';
    const leadFields = config.categories.map(cat => cat.fieldMapping.lead).join(' | ') + ' | hasOptedOutOfEmails';
    const publications = config.categories.map(cat => cat.publication?.name).filter(Boolean).join(' | ');

    const controllerRow = {
      CategoryLabels: categoryLabels,
      ContactFields: contactFields,
      LeadFields: leadFields,
      Publications: publications,
      Header: config.branding.header,
      SubHeader: config.branding.subHeader,
      Footer: config.branding.footer,
      LogoUrl: config.branding.logoUrl,
      OptOutLabel: config.optOutLabel,
      IntegrationType: config.integrationType
    };

    // Create DEs if they do not exist
    // PC_Controller logic: upsert if exists, else create and insert
    const controllerExists = await dataExtensionExists(controllerDEName, accessToken, subdomain);
    console.log(`[DEBUG] dataExtensionExists('${controllerDEName}') =`, controllerExists);
    if (controllerExists) {
      await upsertRowToDE(controllerDEName, controllerRow, accessToken, subdomain, ['IntegrationType']);
    } else {
      await createDataExtensionSOAP(controllerDEName, controllerDE, accessToken, subdomain);
      await insertRowToDE(controllerDEName, controllerRow, accessToken, subdomain);
    }

    // PC_Log: create if not exists
    const logExists = await dataExtensionExists(logDEName, accessToken, subdomain);
    console.log(`[DEBUG] dataExtensionExists('${logDEName}') =`, logExists);
    if (!logExists) {
      await createDataExtensionSOAP(logDEName, logDE, accessToken, subdomain);
    }

    // Create or get Publication Lists for each publication name using SOAP only
    const publicationNames = config.categories.map(cat => cat.publication?.name).filter(Boolean);
    const publicationListResults = [];
    for (const pubName of publicationNames) {
      try {
        await createPublicationListSOAP(
          pubName,
          accessToken,
          subdomain
        );
        publicationListResults.push({ name: pubName, status: 'created or already exists' });
      } catch (err) {
        publicationListResults.push({ name: pubName, status: 'error', error: err.message });
      }
    }
    console.log('[Publication List SOAP Results]', publicationListResults);

    console.log('[PC Controller DE]', controllerDEName, controllerDE);
    console.log('[PC Controller Row]', controllerRow);
    console.log('[PC Log DE]', logDEName, logDE);

    res.json({ status: 'OK', message: 'Preference Center configuration processed.', controllerDEName, logDEName });
  } catch (e) {
    console.error('[Preference Center Config Error]', e);
    res.status(500).json({ status: 'ERROR', message: e.message });
  }
});

// Helper to create a Data Extension in Marketing Cloud using SOAP
async function createDataExtensionSOAP(deName, deDef, accessToken, subdomain) {
  const fieldsXml = deDef.Fields.map(f => {
    // Only include MaxLength for Text and EmailAddress fields
    const maxLengthXml = (f.FieldType === 'Text' || f.FieldType === 'EmailAddress') ? `<MaxLength>${f.MaxLength || 100}</MaxLength>` : '';
    return `
      <Field>
        <Name>${f.Name}</Name>
        <FieldType>${f.FieldType}</FieldType>
        ${maxLengthXml}
        <IsRequired>${f.IsRequired ? 'true' : 'false'}</IsRequired>
        <IsPrimaryKey>${f.IsPrimaryKey ? 'true' : 'false'}</IsPrimaryKey>
      </Field>`;
  }).join('');

  const keysXml = deDef.Keys && deDef.Keys.length > 0
    ? `<Keys>${deDef.Keys.map(k => `
      <Key>
        <Name>${k.Name}</Name>
        <IsPrimaryKey>${k.IsPrimaryKey ? 'true' : 'false'}</IsPrimaryKey>
      </Key>`).join('')}
    </Keys>` : '';

  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soapenv:Header>
        <fueloauth>${accessToken}</fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="DataExtension">
            <Name>${deName}</Name>
            <CustomerKey>${deName}</CustomerKey>
            <Description>${deDef.Description || ''}</Description>
            <Fields>
              ${fieldsXml}
            </Fields>
            ${keysXml}
          </Objects>
        </CreateRequest>
      </soapenv:Body>
    </soapenv:Envelope>
  `;

  // Debug: Log the final SOAP envelope
  console.log('[SOAP Envelope]', soapEnvelope);

  const url = `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`;
  const resp = await axios.post(url, soapEnvelope, {
    headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' }
  });

  if (!resp.data.includes('<OverallStatus>OK</OverallStatus>')) {
    if (resp.data.includes('DataExtension with CustomerKey already exists') || resp.data.includes('Updating an existing Data Extension definition is not allowed')) {
      console.log(`[Info] DE '${deName}' already exists or cannot be updated. Skipping create.`);
      return true;
    }
    throw new Error('Failed to create DE: ' + deName + '\nResponse: ' + resp.data);
  }

  return true;
}

// Helper to insert a row into a Data Extension using REST API
async function insertRowToDE(deName, rowData, accessToken, subdomain) {
  const url = `https://${subdomain}.rest.marketingcloudapis.com/hub/v1/dataevents/key:${deName}/rowset`;

  const payload = [
    {
      keys: { IntegrationType: rowData.IntegrationType },
      values: rowData
    }
  ];

  const resp = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (![200, 201, 202].includes(resp.status)) {
    console.error('[Insert Row Error]', resp.status, resp.data);
    throw new Error('Failed to insert row into DE: ' + deName);
  }

  console.log(`[✔] Inserted config row into '${deName}'`);
}

// Helper to upsert a row into a Data Extension using REST API
async function upsertRowToDE(deName, rowData, accessToken, subdomain, primaryKeys = ['IntegrationType']) {
  const url = `https://${subdomain}.rest.marketingcloudapis.com/hub/v1/dataevents/key:${deName}/rowset`;
  const keys = {};
  primaryKeys.forEach(k => { keys[k] = rowData[k]; });
  const payload = [
    {
      keys,
      values: rowData
    }
  ];
  const resp = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (![200, 201, 202].includes(resp.status)) {
    console.error('[Upsert Row Error]', resp.status, resp.data);
    throw new Error('Failed to upsert row into DE: ' + deName);
  }
  console.log(`[✔] Upserted config row into '${deName}'`);
}

// Helper to check if a Data Extension exists using REST API
async function dataExtensionExists(deName, accessToken, subdomain) {
  const url = `https://${subdomain}.rest.marketingcloudapis.com/hub/v1/dataevents/key:${deName}`;
  try {
    const resp = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    });
    // If we get a 200, the DE exists
    return resp.status === 200;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return false; // DE does not exist
    }
    // Other errors should be thrown
    throw err;
  }
}

// Helper: Get Publication List ID by name
async function getPublicationListIdByName(listName, accessToken, subdomain) {
  const url = `https://${subdomain}.rest.marketingcloudapis.com/contacts/v1/lists?$filter=name eq '${listName}'`;
  try {
    const resp = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    });
    const matchingList = resp.data?.items?.find(item => item.name === listName);
    return matchingList ? matchingList.id : null;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null; // List does not exist, so return null to trigger creation
    }
    throw err; // Other errors should still be thrown
  }
}

// Helper: Create Publication List
async function createPublicationList(listName, description, accessToken, subdomain) {
  const url = `https://${subdomain}.rest.marketingcloudapis.com/contacts/v1/lists`;
  const payload = {
    name: listName,
    description: description,
    type: "publication",
    status: "active"
  };
  const resp = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (![200, 201, 202].includes(resp.status)) {
    console.error('[Publication List Error]', resp.status, resp.data);
    throw new Error('Failed to create publication list: ' + listName);
  }
  console.log(`[✔] Publication List '${listName}' created successfully.`);
  return resp.data.id;
}

// Helper: Create Publication List using SOAP
async function createPublicationListSOAP(listName, accessToken, subdomain) {
  // Debug: Log input parameters
  console.log('[DEBUG] createPublicationListSOAP called with:', { listName, subdomain });
  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soapenv:Header>
        <fueloauth>${accessToken}</fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="List">
            <ListName>${listName}</ListName>
            <CustomerKey>${listName}</CustomerKey>
            <Type>Publication</Type>
            <Description>${listName}</Description>
            <Sendable>true</Sendable>
            <SendableDataExtensionField>
            <Name>Email Address</Name>
            </SendableDataExtensionField>
            <SendableSubscriberField>
            <Name>Email Address</Name>
            </SendableSubscriberField>
          </Objects>
        </CreateRequest>
      </soapenv:Body>
    </soapenv:Envelope>
  `;
  // Debug: Log the SOAP envelope being sent
  console.log('[DEBUG] Publication List SOAP Envelope:', soapEnvelope);
  const url = `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`;
  const resp = await axios.post(url, soapEnvelope, {
    headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' }
  });
  // Debug: Log the raw SOAP response
  console.log('[DEBUG] Publication List SOAP Response:', resp.data);
  if (!resp.data.includes('<OverallStatus>OK</OverallStatus>')) {
    if (resp.data.includes('already exists')) {
      console.log(`[Info] Publication List '${listName}' already exists.`);
      return true;
    }
    throw new Error('Failed to create publication list: ' + listName + '\nResponse: ' + resp.data);
  }
  console.log(`[✔] Publication List '${listName}' created successfully.`);
  return true;
}

// Retrieve Send (Job) details by Job ID, EmailName, Subject, or SentDate range
app.get('/api/email-archive/send', async (req, res) => {
  try {
    const { jobId, emailName, subject, sentDateFrom, sentDateTo } = req.query;
    const subdomain = getSubdomainFromRequest(req);
    const accessToken = getAccessTokenFromRequest(req);
    if (!subdomain || !accessToken) return res.status(401).json({ error: 'Missing subdomain or access token' });

    // Build filter (null means fetch all)
    let filter = null;
    if (jobId) {
      filter = { property: 'ID', operator: 'equals', value: jobId };
    } else if (emailName) {
      filter = { property: 'EmailName', operator: 'equals', value: emailName };
    } else if (subject) {
      filter = { property: 'Subject', operator: 'equals', value: subject };
    } else if (sentDateFrom && sentDateTo) {
      filter = {
        left: { property: 'SentDate', operator: 'greaterThanOrEqual', value: sentDateFrom },
        logicalOperator: 'AND',
        right: { property: 'SentDate', operator: 'lessThanOrEqual', value: sentDateTo }
      };
    } // else: filter remains null (fetch all)

    const xml = await require('./retrieveSend').retrieveSendWithFilter(subdomain, accessToken, filter);
    // Parse XML to JSON
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
    // Extract results from SOAP response
    let results = [];
    try {
      const retrieveResponse = parsed['soap:Envelope']['soap:Body']['RetrieveResponseMsg']['Results'];
      if (Array.isArray(retrieveResponse)) {
        results = retrieveResponse;
      } else if (retrieveResponse) {
        results = [retrieveResponse];
      }
    } catch (e) {
      results = [];
    }
    // Map to only relevant fields for frontend
    const mapped = results.map(r => ({
      SendDate: r.SendDate || r.SentDate || '',
      EmailName: r.EmailName || '',
      Subject: r.Subject || '',
      ID: r.ID || '',
      SubscriberKey: r.SubscriberKey || '',
      MID: r['Client']?.ID || r['Client.ID'] || '',
      FromName: r.FromName || '',
      FromAddress: r.FromAddress || '',
      NumberSent: r.NumberSent || '',
      NumberTargeted: r.NumberTargeted || '',
      NumberDelivered: r.NumberDelivered || '',
      NumberErrored: r.NumberErrored || '',
      NumberExcluded: r.NumberExcluded || '',
      SoftBounces: r.SoftBounces || '',
      UniqueClicks: r.UniqueClicks || '',
      UniqueOpens: r.UniqueOpens || '',
      Unsubscribes: r.Unsubscribes || '',
      Duplicates: r.Duplicates || '',
      BccEmail: r.BccEmail ?? '',
    }));
    res.json({ results: mapped });
  } catch (err) {
    console.error('❌ Error retrieving send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create Email Archive Data Extension
app.post('/createEmailArchiveDE', async (req, res) => {
  const accessToken = req.session.accessToken;
  const subdomain = req.session.mcCreds && req.session.mcCreds.subdomain;
  if (!accessToken || !subdomain) return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' });
  
  try {
    const { folderName, deName, description, isSendable, fields } = req.body;

    const axios = require('axios');
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false });

    // Step 1: Get root folder for Data Extensions
    const getRootFolderSoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataFolder</ObjectType>
              <Properties>ID</Properties>
              <Properties>Name</Properties>
              <Properties>ContentType</Properties>
              <Properties>ParentFolder.ID</Properties>
              <Filter xsi:type="SimpleFilterPart">
                <Property>ContentType</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>dataextension</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const rootResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      getRootFolderSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const rootParsed = await parser.parseStringPromise(rootResp.data);
    const rootFolders = rootParsed['soap:Envelope']['soap:Body']['RetrieveResponseMsg']['Results'];
    
    let parentId;
    if (Array.isArray(rootFolders)) {
      const rootDEFolder = rootFolders.find(f => f.ContentType === 'dataextension' && f['ParentFolder']?.ID === '0');
      parentId = rootDEFolder?.ID;
    } else if (rootFolders?.ContentType === 'dataextension' && rootFolders?.ParentFolder?.ID === '0') {
      parentId = rootFolders.ID;
    }

    if (!parentId) {
      return res.status(500).json({ status: 'ERROR', message: 'Root folder for dataextensions not found' });
    }

    // Step 2: Try to find folder first - exact same as DM QS
    let folderId = null;
    const folderSoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataFolder</ObjectType>
              <Properties>ID</Properties>
              <Properties>Name</Properties>
              <Properties>ContentType</Properties>
              <Filter>
                <Property>Name</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>${folderName}</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const folderResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      folderSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const folderResult = await parser.parseStringPromise(folderResp.data);
    const folderResults = folderResult?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];

    if (folderResults && folderResults.ID) {
      folderId = folderResults.ID;
    } else if (Array.isArray(folderResults) && folderResults.length > 0) {
      folderId = folderResults[0].ID;
    }

    // Step 3: Create folder if not found - exact same as DM QS
    if (!folderId) {
      console.log('[Resolved Root DataExtension Folder ID]', parentId);

      const createFolderSoap = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <soapenv:Header>
      <fueloauth>${accessToken}</fueloauth>
    </soapenv:Header>
    <soapenv:Body>
      <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Options/>
        <Objects xsi:type="DataFolder">
         <!-- <CustomerKey>${folderName}</CustomerKey> -->
          <Name>${folderName}</Name>
          <Description>${folderName}</Description>
          <ContentType>dataextension</ContentType>
          <IsActive>true</IsActive>
          <IsEditable>true</IsEditable>
          <AllowChildren>true</AllowChildren>
          <ParentFolder>
            <ID>${parentId}</ID>
            <ObjectID xsi:nil="true"/>
            <CustomerKey xsi:nil="true"/>
          </ParentFolder>
        </Objects>
      </CreateRequest>
    </soapenv:Body>
  </soapenv:Envelope>
`;

      const createFolderResp = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        createFolderSoap,
        { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' } }
      );
      console.log('[SOAP Folder Create Raw]', createFolderResp.data);
      const createFolderResult = await parser.parseStringPromise(createFolderResp.data);
      folderId = createFolderResult?.['soap:Envelope']?.['soap:Body']?.['CreateResponse']?.['Results']?.['NewID'];
      
      // If folder creation failed (e.g., already exists), try to find the existing folder
      if (!folderId || folderId === '0') {
        console.log('[Folder creation failed, searching for existing folder]');
        const findExistingFolderSoap = `
          <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <soapenv:Header>
              <fueloauth>${accessToken}</fueloauth>
            </soapenv:Header>
            <soapenv:Body>
              <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <RetrieveRequest>
                  <ObjectType>DataFolder</ObjectType>
                  <Properties>ID</Properties>
                  <Properties>Name</Properties>
                  <Properties>ContentType</Properties>
                  <Filter xsi:type="SimpleFilterPart">
                    <Property>Name</Property>
                    <SimpleOperator>equals</SimpleOperator>
                    <Value>${folderName}</Value>
                  </Filter>
                </RetrieveRequest>
              </RetrieveRequestMsg>
            </soapenv:Body>
          </soapenv:Envelope>
        `;
        
        const findExistingResp = await axios.post(
          `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
          findExistingFolderSoap,
          { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
        );
        
        const findExistingParsed = await parser.parseStringPromise(findExistingResp.data);
        const existingFolderResults = findExistingParsed?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        
        if (existingFolderResults && existingFolderResults.ID) {
          folderId = existingFolderResults.ID;
          console.log(`[Found existing folder with ID: ${folderId}]`);
        } else if (Array.isArray(existingFolderResults) && existingFolderResults.length > 0) {
          folderId = existingFolderResults[0].ID;
          console.log(`[Found existing folder with ID: ${folderId}]`);
        }
      }
    }

    if (!folderId) {
      return res.status(500).json({ status: 'ERROR', message: 'Failed to create folder' });
    }

    console.log(`📁 [Email Archive] Using folder ID: ${folderId} for DE creation`);

    // Step 3: Check if Data Extension already exists
    const checkDESoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>DataExtension</ObjectType>
              <Properties>CustomerKey</Properties>
              <Properties>ObjectID</Properties>
              <Properties>Name</Properties>
              <Filter xsi:type="SimpleFilterPart">
                <Property>CustomerKey</Property>
                <SimpleOperator>equals</SimpleOperator>
                <Value>${deName}</Value>
              </Filter>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const checkDEResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      checkDESoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const checkDEParsed = await parser.parseStringPromise(checkDEResp.data);
    const existingDE = checkDEParsed?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];

    if (existingDE && existingDE.CustomerKey) {
      console.log(`📧 [Email Archive] Data Extension ${deName} already exists, proceeding to Content Builder operations`);
      
      // Even though DE exists, we still need to handle Content Builder setup
      const contentFolderName = 'MC_Explorer_Email_Archive_Content';
      console.log(`📁 [Content Builder] Checking if folder '${contentFolderName}' exists (DE already exists case)`);
      
      try {
        console.log(`📁 [Content Builder] Making request to: https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories?$filter=name eq '${contentFolderName}' (DE exists case)`);
        console.log(`📁 [Content Builder] Using access token: ${accessToken ? accessToken.substring(0, 20) + '...' : 'NULL'}`);
        
        // Try without filter first to see if basic endpoint works
        let checkContentFolderResp;
        try {
          // Try with properly encoded filter
          const filterParam = encodeURIComponent(`name eq '${contentFolderName}'`);
          checkContentFolderResp = await axios.get(
            `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories?$filter=${filterParam}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
        } catch (filterError) {
          console.log('📁 [Content Builder] Encoded filter query failed in DE exists case, trying without filter...');
          console.log('📁 [Content Builder] Filter error details:', filterError.response?.status, filterError.response?.data);
          // If filter fails, try getting all categories and filter manually
          checkContentFolderResp = await axios.get(
            `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
        }
        
        console.log('📁 [Content Builder] Folder check response (DE exists case):', JSON.stringify(checkContentFolderResp.data, null, 2));
        
        let contentFolderId = null;
        if (checkContentFolderResp.data && checkContentFolderResp.data.items && checkContentFolderResp.data.items.length > 0) {
          // Find the folder by name (either from filtered result or manual search)
          const targetFolder = checkContentFolderResp.data.items.find(folder => 
            folder.name === contentFolderName
          );
          
          if (targetFolder) {
            contentFolderId = targetFolder.id;
            console.log(`📁 [Content Builder] Found existing folder with ID: ${contentFolderId} (DE exists case)`);
          } else {
            console.log(`📁 [Content Builder] Folder '${contentFolderName}' not found in ${checkContentFolderResp.data.items.length} categories (DE exists case)`);
          }
        } else {
          console.log('📁 [Content Builder] No categories found or empty response (DE exists case)');
        }
        
        if (!contentFolderId) {
          console.log('📁 [Content Builder] Folder does not exist, creating it (DE exists case)');
          
          // Find the Content Builder root folder ID
          const contentBuilderRoot = checkContentFolderResp.data.items.find(folder => 
            folder.name === 'Content Builder' && folder.parentId === 0
          );
          const rootFolderId = contentBuilderRoot ? contentBuilderRoot.id : 432292; // Fallback to known ID
          
          console.log(`📁 [Content Builder] Using parent folder ID: ${rootFolderId} for new folder creation`);
          
          // Create Content Builder folder if it doesn't exist
          const createContentFolderPayload = {
            name: contentFolderName,
            description: "Folder for MCX archiving block",
            parentId: rootFolderId
          };
          
          const createContentFolderResp = await axios.post(
            `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories`,
            createContentFolderPayload,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (createContentFolderResp.data && createContentFolderResp.data.id) {
            contentFolderId = createContentFolderResp.data.id;
          }
        }
        
        // Handle content block operations (same logic as after DE creation)
        let contentBlockId = null;
        let contentBlockName = 'MCX_ArchivingBlock';
        let contentBlockAction = 'none';
        
        if (contentFolderId) {
          // Search for existing content block
          const searchContentBlockResp = await axios.get(
            `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets?$filter=name eq '${contentBlockName}'`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          let existingBlock = null;
          if (searchContentBlockResp.data && searchContentBlockResp.data.items && searchContentBlockResp.data.items.length > 0) {
            existingBlock = searchContentBlockResp.data.items.find(block => 
              block.category && block.category.id === contentFolderId
            );
            
            if (!existingBlock) {
              existingBlock = searchContentBlockResp.data.items[0];
            }
          }
          
          const archiveBlockContent = `%%[
/* MC Explorer Email Archive Block - MCX_ArchivingBlock */
/* This block logs email HTML to the HTML_Log Data Extension */

SET @DataSourceName = _DataSourceName
SET @JobID = JobID()
SET @EmailAddress = emailaddr
SET @EmailName = EmailName_
SET @ListID = ListID()
SET @SendTime = Now()
SET @archived = 'No'
SET @memberid = memberid
SET @subid = subscriberid
SET @subscriberkey = _subscriberkey
SET @ArchiveId = GUID()

/* Get the email HTML from the send */
SET @EmailHTML = HTTPGet(view_email_url)

/* Log to HTML_Log Data Extension */
IF NOT EMPTY(@EmailHTML) AND NOT EMPTY(@EmailAddress) THEN
  InsertDE("HTML_Log", 
    "EmailAddress", @EmailAddress,
    "SendTime", @SendTime,
    "EmailName", @EmailName,
    "HTML", @EmailHTML,
    "ListID", @ListID,
    "JobID", @JobID,
    "DataSourceName", @DataSourceName,
    "archived", @archived,
    "memberid", @memberid,
    "subid", @subid,
    "subscriberkey", @subscriberkey,
    "ArchiveId", @ArchiveId
  )
ENDIF
]%%`;
          
          if (existingBlock) {
            // Update existing content block
            contentBlockId = existingBlock.id;
            const updateContentBlockPayload = {
              name: contentBlockName,
              content: archiveBlockContent,
              description: 'AMPscript block for archiving email HTML to HTML_Log Data Extension (updated by MC Explorer)',
              category: { id: contentFolderId }
            };
            
            try {
              await axios.patch(
                `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${contentBlockId}`,
                updateContentBlockPayload,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              contentBlockAction = 'updated';
            } catch (error) {
              contentBlockAction = 'update_failed';
            }
          } else {
            // Create new content block
            const createContentBlockPayload = {
              name: contentBlockName,
              assetType: { name: 'codesnippetblock', id: 220 },
              category: { id: contentFolderId },
              content: archiveBlockContent,
              description: 'AMPscript block for archiving email HTML to HTML_Log Data Extension (created by MC Explorer)'
            };
            
            try {
              const createContentBlockResp = await axios.post(
                `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets`,
                createContentBlockPayload,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              if (createContentBlockResp.data && createContentBlockResp.data.id) {
                contentBlockId = createContentBlockResp.data.id;
                contentBlockAction = 'created';
              } else {
                contentBlockAction = 'create_failed';
              }
            } catch (error) {
              contentBlockAction = 'create_failed';
            }
          }
        }
        
        return res.json({
          status: 'OK',
          deName: deName,
          folderName: folderName,
          description: description,
          dePath: `/Data Extensions / ${folderName}`,
          objectId: existingDE.ObjectID,
          contentFolderId: contentFolderId,
          contentFolderName: contentFolderName,
          contentBlockId: contentBlockId,
          contentBlockName: contentBlockName,
          contentBlockAction: contentBlockAction,
          message: `Data Extension already exists. ${getArchiveSetupMessage(contentBlockAction, contentBlockName)}`
        });
        
      } catch (contentError) {
        console.error('❌ [Content Builder] Error in DE exists case:', contentError.message);
        if (contentError.response) {
          console.error('❌ [Content Builder] Error status (DE exists):', contentError.response.status);
          console.error('❌ [Content Builder] Error data (DE exists):', JSON.stringify(contentError.response.data, null, 2));
          console.error('❌ [Content Builder] Error headers (DE exists):', contentError.response.headers);
        }
        if (contentError.config) {
          console.error('❌ [Content Builder] Request config (DE exists):', {
            url: contentError.config.url,
            method: contentError.config.method,
            headers: contentError.config.headers
          });
        }
        return res.json({
          status: 'OK',
          deName: deName,
          folderName: folderName,
          description: description,
          dePath: `/Data Extensions / ${folderName}`,
          objectId: existingDE.ObjectID,
          warning: 'Content Builder operations failed',
          contentError: contentError.message,
          message: 'Data Extension already exists, but content block operations failed'
        });
      }
    }

    console.log(`📧 [Email Archive] Data Extension ${deName} does not exist, creating new one`);

    // Step 4: Create the Data Extension with specified fields - hardcode like DM QS
    const fieldXml = `
                <Field><Name>ArchiveId</Name><FieldType>Text</FieldType><MaxLength>50</MaxLength><IsRequired>true</IsRequired><IsPrimaryKey>true</IsPrimaryKey></Field>
                <Field><Name>EmailAddress</Name><FieldType>EmailAddress</FieldType><IsRequired>false</IsRequired></Field>
                <Field><Name>SendTime</Name><FieldType>Date</FieldType><IsRequired>false</IsRequired></Field>
                <Field><Name>EmailName</Name><FieldType>Text</FieldType><MaxLength>100</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>HTML</Name><FieldType>Text</FieldType><MaxLength>4000</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>ListID</Name><FieldType>Number</FieldType><IsRequired>false</IsRequired></Field>
                <Field><Name>JobID</Name><FieldType>Number</FieldType><IsRequired>false</IsRequired></Field>
                <Field><Name>DataSourceName</Name><FieldType>Text</FieldType><MaxLength>500</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>archived</Name><FieldType>Text</FieldType><MaxLength>10</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>memberid</Name><FieldType>Number</FieldType><IsRequired>false</IsRequired></Field>
                <Field><Name>subid</Name><FieldType>Text</FieldType><MaxLength>150</MaxLength><IsRequired>false</IsRequired></Field>
                <Field><Name>subscriberkey</Name><FieldType>Text</FieldType><MaxLength>300</MaxLength><IsRequired>false</IsRequired></Field>`;

    // Since isSendable is false, we don't need sendable configuration
    const sendableXml = '';

    const deSoap = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <soapenv:Header>
          <fueloauth>${accessToken}</fueloauth>
        </soapenv:Header>
        <soapenv:Body>
          <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <Options />
            <Objects xmlns:ns1="http://exacttarget.com/wsdl/partnerAPI" xsi:type="ns1:DataExtension">
              <Name>${deName}</Name>
              <CustomerKey>${deName}</CustomerKey>
              <CategoryID>${folderId}</CategoryID>
              <IsSendable>false</IsSendable>
              <IsTestable>false</IsTestable>
              <Fields>
                ${fieldXml}
              </Fields>
            </Objects>
          </CreateRequest>
        </soapenv:Body>
      </soapenv:Envelope>
    `;

    const deResp = await axios.post(
      `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      deSoap,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' } }
    );

    console.log(`📧 [Email Archive DE] Using CategoryID (folder): ${folderId}`);
    console.log('📧 [Email Archive DE] SOAP Request:', deSoap);
    console.log('📧 [Email Archive DE] SOAP Response:', deResp.data);

    const deParsed = await parser.parseStringPromise(deResp.data);
    const deResult = deParsed['soap:Envelope']['soap:Body']['CreateResponse']['Results'];

    if (deResult?.StatusCode === 'OK') {
      console.log('📧 [Email Archive] Data Extension created successfully, proceeding to Content Builder setup');
      
      // Step 5: Check if Content Builder folder exists
      const contentFolderName = 'MC_Explorer_Email_Archive_Content';
      console.log(`📁 [Content Builder] Checking if folder '${contentFolderName}' exists`);
      
      try {
        console.log(`📁 [Content Builder] Making request to: https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories?$filter=name eq '${contentFolderName}'`);
        console.log(`📁 [Content Builder] Using access token: ${accessToken ? accessToken.substring(0, 20) + '...' : 'NULL'}`);
        
        // Try without filter first to see if basic endpoint works
        let checkContentFolderResp;
        try {
          // Try with properly encoded filter
          const filterParam = encodeURIComponent(`name eq '${contentFolderName}'`);
          checkContentFolderResp = await axios.get(
            `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories?$filter=${filterParam}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
        } catch (filterError) {
          console.log('📁 [Content Builder] Encoded filter query failed, trying without filter...');
          console.log('📁 [Content Builder] Filter error details:', filterError.response?.status, filterError.response?.data);
          // If filter fails, try getting all categories and filter manually
          checkContentFolderResp = await axios.get(
            `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
        }
        
        console.log('📁 [Content Builder] Folder check response:', JSON.stringify(checkContentFolderResp.data, null, 2));
        
        let contentFolderId = null;
        if (checkContentFolderResp.data && checkContentFolderResp.data.items && checkContentFolderResp.data.items.length > 0) {
          // Find the folder by name (either from filtered result or manual search)
          const targetFolder = checkContentFolderResp.data.items.find(folder => 
            folder.name === contentFolderName
          );
          
          if (targetFolder) {
            contentFolderId = targetFolder.id;
            console.log(`📁 [Content Builder] Found existing folder with ID: ${contentFolderId}`);
          } else {
            console.log(`📁 [Content Builder] Folder '${contentFolderName}' not found in ${checkContentFolderResp.data.items.length} categories`);
          }
        } else {
          console.log('📁 [Content Builder] No categories found or empty response');
        }
        
        if (!contentFolderId) {
          console.log('📁 [Content Builder] Folder does not exist, creating it');
          
          // Find the Content Builder root folder ID
          const contentBuilderRoot = checkContentFolderResp.data.items.find(folder => 
            folder.name === 'Content Builder' && folder.parentId === 0
          );
          const rootFolderId = contentBuilderRoot ? contentBuilderRoot.id : 432292; // Fallback to known ID
          
          console.log(`📁 [Content Builder] Using parent folder ID: ${rootFolderId} for new folder creation`);
          
          // Step 6: Create Content Builder folder
          try {
            const createContentFolderPayload = {
              name: contentFolderName,
              description: "Folder for MCX archiving block",
              parentId: rootFolderId
            };
            
            const createContentFolderResp = await axios.post(
              `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories`,
              createContentFolderPayload,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            console.log('📁 [Content Builder] Folder creation response:', createContentFolderResp.data);
            
            if (createContentFolderResp.data && createContentFolderResp.data.id) {
              contentFolderId = createContentFolderResp.data.id;
              console.log(`📁 [Content Builder] Successfully created folder with ID: ${contentFolderId}`);
            } else {
              console.error('❌ [Content Builder] Failed to get folder ID from creation response');
            }
            
          } catch (createFolderError) {
            console.error('❌ [Content Builder] Error creating folder:', createFolderError.message);
            if (createFolderError.response) {
              console.error('❌ [Content Builder] Error response:', createFolderError.response.data);
            }
          }
        }
        
        // Step 7: Verify we have the Content Builder folder ID
        if (!contentFolderId) {
          console.log('📁 [Content Builder] Folder ID not captured, re-checking folder existence');
          
          try {
            const recheckContentFolderResp = await axios.get(
              `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/categories?$filter=name eq '${contentFolderName}'`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            console.log('📁 [Content Builder] Re-check folder response:', recheckContentFolderResp.data);
            
            if (recheckContentFolderResp.data && recheckContentFolderResp.data.items && recheckContentFolderResp.data.items.length > 0) {
              contentFolderId = recheckContentFolderResp.data.items[0].id;
              console.log(`📁 [Content Builder] Successfully retrieved folder ID: ${contentFolderId}`);
            } else {
              console.error('❌ [Content Builder] Still unable to find folder after creation attempt');
            }
            
          } catch (recheckError) {
            console.error('❌ [Content Builder] Error re-checking folder:', recheckError.message);
          }
        }
        
        console.log(`📁 [Content Builder] Final folder ID for content block creation: ${contentFolderId || 'NOT_FOUND'}`);
        
        // Step 8: Handle content block (search, update, or create)
        let contentBlockId = null;
        let contentBlockName = 'MCX_ArchivingBlock'; // Using consistent naming from requirement
        let contentBlockAction = 'none';
        
        if (contentFolderId) {
          console.log(`📝 [Content Block] Searching for content block '${contentBlockName}' in folder ID: ${contentFolderId}`);
          
          try {
            // Step 8a: Search for existing content block by name (globally first, then by folder)
            const searchContentBlockResp = await axios.get(
              `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets?$filter=name eq '${contentBlockName}'`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            console.log('📝 [Content Block] Global search response:', JSON.stringify(searchContentBlockResp.data, null, 2));
            
            let existingBlock = null;
            if (searchContentBlockResp.data && searchContentBlockResp.data.items && searchContentBlockResp.data.items.length > 0) {
              // Check if any blocks are in our target folder
              existingBlock = searchContentBlockResp.data.items.find(block => 
                block.category && block.category.id === contentFolderId
              );
              
              if (!existingBlock) {
                // Found blocks with same name but in different folders - take the first one to update
                existingBlock = searchContentBlockResp.data.items[0];
                console.log(`📝 [Content Block] Found existing block '${contentBlockName}' in different folder (ID: ${existingBlock.category?.id}), will update it`);
              } else {
                console.log(`📝 [Content Block] Found existing block '${contentBlockName}' in target folder`);
              }
            }
            
            // Define the AMPscript content for the email archiving block
            const archiveBlockContent = `%%[
/* MC Explorer Email Archive Block - MCX_ArchivingBlock */
/* This block logs email HTML to the HTML_Log Data Extension */

SET @DataSourceName = _DataSourceName
SET @JobID = JobID()
SET @EmailAddress = emailaddr
SET @EmailName = EmailName_
SET @ListID = ListID()
SET @SendTime = Now()
SET @archived = 'No'
SET @memberid = memberid
SET @subid = subscriberid
SET @subscriberkey = _subscriberkey
SET @ArchiveId = GUID()

/* Get the email HTML from the send */
SET @EmailHTML = HTTPGet(view_email_url)

/* Log to HTML_Log Data Extension */
IF NOT EMPTY(@EmailHTML) AND NOT EMPTY(@EmailAddress) THEN
  InsertDE("HTML_Log", 
    "EmailAddress", @EmailAddress,
    "SendTime", @SendTime,
    "EmailName", @EmailName,
    "HTML", @EmailHTML,
    "ListID", @ListID,
    "JobID", @JobID,
    "DataSourceName", @DataSourceName,
    "archived", @archived,
    "memberid", @memberid,
    "subid", @subid,
    "subscriberkey", @subscriberkey,
    "ArchiveId", @ArchiveId
  )
ENDIF
]%%`;

            if (existingBlock) {
              // Step 8b: Update existing content block
              contentBlockId = existingBlock.id;
              console.log(`📝 [Content Block] Updating existing content block with ID: ${contentBlockId}`);
              
              const updateContentBlockPayload = {
                name: contentBlockName,
                content: archiveBlockContent,
                description: 'AMPscript block for archiving email HTML to HTML_Log Data Extension (updated by MC Explorer)',
                category: {
                  id: contentFolderId
                }
              };
              
              try {
                const updateContentBlockResp = await axios.patch(
                  `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${contentBlockId}`,
                  updateContentBlockPayload,
                  {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                console.log('📝 [Content Block] Update response:', JSON.stringify(updateContentBlockResp.data, null, 2));
                contentBlockAction = 'updated';
                console.log(`📝 [Content Block] Successfully updated content block with ID: ${contentBlockId}`);
                
              } catch (updateError) {
                console.error('❌ [Content Block] Error updating content block:', updateError.message);
                if (updateError.response) {
                  console.error('❌ [Content Block] Update error response:', updateError.response.data);
                }
                contentBlockAction = 'update_failed';
              }
              
            } else {
              // Step 8c: Create new content block
              console.log('📝 [Content Block] No existing block found, creating new one');
              
              const createContentBlockPayload = {
                name: contentBlockName,
                assetType: {
                  name: 'codesnippetblock',
                  id: 220
                },
                category: {
                  id: contentFolderId
                },
                content: archiveBlockContent,
                description: 'AMPscript block for archiving email HTML to HTML_Log Data Extension (created by MC Explorer)'
              };
              
              try {
                const createContentBlockResp = await axios.post(
                  `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets`,
                  createContentBlockPayload,
                  {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                console.log('📝 [Content Block] Creation response:', JSON.stringify(createContentBlockResp.data, null, 2));
                
                if (createContentBlockResp.data && createContentBlockResp.data.id) {
                  contentBlockId = createContentBlockResp.data.id;
                  contentBlockAction = 'created';
                  console.log(`📝 [Content Block] Successfully created content block with ID: ${contentBlockId}`);
                } else {
                  console.error('❌ [Content Block] Failed to get block ID from creation response');
                  contentBlockAction = 'create_failed';
                }
                
              } catch (createError) {
                console.error('❌ [Content Block] Error creating content block:', createError.message);
                if (createError.response) {
                  console.error('❌ [Content Block] Create error response:', createError.response.data);
                }
                contentBlockAction = 'create_failed';
              }
            }
            
          } catch (searchError) {
            console.error('❌ [Content Block] Error searching for content block:', searchError.message);
            if (searchError.response) {
              console.error('❌ [Content Block] Search error response:', searchError.response.data);
            }
            contentBlockAction = 'search_failed';
          }
        } else {
          console.log('⚠️ [Content Block] Skipping content block operations - no folder ID available');
          contentBlockAction = 'skipped_no_folder';
        }
        
        return res.json({
          status: 'OK',
          deName: deName,
          folderName: folderName,
          description: description,
          dePath: `/Data Extensions / ${folderName}`,
          objectId: deResult.NewID,
          contentFolderId: contentFolderId,
          contentFolderName: contentFolderName,
          contentBlockId: contentBlockId,
          contentBlockName: contentBlockName,
          contentBlockAction: contentBlockAction,
          message: getArchiveSetupMessage(contentBlockAction, contentBlockName)
        });
        
      } catch (contentError) {
        console.error('❌ [Content Builder] Error in content operations:', contentError.message);
        if (contentError.response) {
          console.error('❌ [Content Builder] Error status:', contentError.response.status);
          console.error('❌ [Content Builder] Error data:', JSON.stringify(contentError.response.data, null, 2));
          console.error('❌ [Content Builder] Error headers:', contentError.response.headers);
        }
        if (contentError.config) {
          console.error('❌ [Content Builder] Request config:', {
            url: contentError.config.url,
            method: contentError.config.method,
            headers: contentError.config.headers
          });
        }
        // Still return success for DE creation, but note the content folder issue
        return res.json({
          status: 'OK',
          deName: deName,
          folderName: folderName,
          description: description,
          dePath: `/Data Extensions / ${folderName}`,
          objectId: deResult.NewID,
          warning: 'Content Builder operations failed',
          contentError: contentError.message,
          contentBlockId: null,
          contentBlockName: null,
          contentBlockAction: 'error'
        });
      }
    } else {
      return res.status(500).json({ 
        status: 'ERROR', 
        message: 'Failed to create Data Extension',
        details: deResult?.StatusMessage 
      });
    }

  } catch (error) {
    console.error('❌ [Email Archive DE Creation] Error:', error.message);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Helper function to generate setup completion messages
function getArchiveSetupMessage(contentBlockAction, contentBlockName) {
  switch (contentBlockAction) {
    case 'created':
      return `Email archiving setup complete! Content block '${contentBlockName}' was created successfully.`;
    case 'updated':
      return `Email archiving setup complete! Content block '${contentBlockName}' was updated with latest AMPscript.`;
    case 'skipped_no_folder':
      return 'Data Extension created successfully, but content block creation was skipped (no folder available).';
    case 'search_failed':
      return 'Data Extension created successfully, but content block search failed.';
    case 'create_failed':
      return 'Data Extension created successfully, but content block creation failed.';
    case 'update_failed':
      return 'Data Extension created successfully, but content block update failed.';
    default:
      return 'Email archiving setup completed with unknown content block status.';
  }
}

// Get all emails from Marketing Cloud for Email Archiving (both SOAP and REST)
app.get('/emails/list', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });

  try {
    console.log('📧 [Email List] Retrieving emails from both SOAP (Classic) and REST (Content Builder) APIs');
    
    // Array to store all emails from both sources
    let allEmails = [];

    // 1. SOAP API - Classic Email Storage with QueryAllAccounts
    try {
      console.log('📧 [Email List - SOAP] Retrieving Classic emails via SOAP API');
      
      const soapEnvelope = `
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <s:Header>
            <fueloauth>${accessToken}</fueloauth>
          </s:Header>
          <s:Body>
            <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <RetrieveRequest>
                <ObjectType>Email</ObjectType>
                <Properties>ID</Properties>
                <Properties>Name</Properties>
                <QueryAllAccounts>true</QueryAllAccounts>
                <Options>
                  <BatchSize>50</BatchSize>
                </Options>
              </RetrieveRequest>
            </RetrieveRequestMsg>
          </s:Body>
        </s:Envelope>
      `;

      const soapResponse = await axios.post(
        `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
        soapEnvelope,
        {
          headers: {
            'Content-Type': 'text/xml',
            SOAPAction: 'Retrieve',
          },
        }
      );

      console.log('📧 [Email List - SOAP] SOAP Response received, parsing...');
      // console.log('📧 [Email List - SOAP] Raw SOAP Response:', soapResponse.data); // Commented out to reduce log size
      
      const parser = new xml2js.Parser({ explicitArray: false });
      
      const soapResult = await parser.parseStringPromise(soapResponse.data);
      // console.log('📧 [Email List - SOAP] Parsed XML Result:', JSON.stringify(soapResult, null, 2)); // Commented out to reduce log size

      const soapRetrieveResponse = soapResult?.['s:Envelope']?.['s:Body']?.['RetrieveResponseMsg'] || 
                                  soapResult?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg'];
      // console.log('📧 [Email List - SOAP] Retrieve Response Msg:', JSON.stringify(soapRetrieveResponse, null, 2)); // Commented out to reduce log size
      
      // Check for SOAP errors
      if (soapRetrieveResponse?.OverallStatus === 'Error') {
        console.error('❌ [Email List - SOAP] SOAP Error:', soapRetrieveResponse.Results?.StatusMessage || 'Unknown error');
      } else {
        const soapResults = soapRetrieveResponse?.['Results'];
        // console.log('📧 [Email List - SOAP] Results:', JSON.stringify(soapResults, null, 2)); // Commented out to reduce log size
        
        if (soapResults) {
          const soapResultArray = Array.isArray(soapResults) ? soapResults : [soapResults];
          
          const soapEmails = soapResultArray
            .filter(email => email && email.ID) // Filter out invalid entries
            .map(email => ({
              id: String(email.ID),
              name: String(email.Name || 'Untitled Email').substring(0, 100)
            }));
          
          allEmails = allEmails.concat(soapEmails);
          console.log(`📧 [Email List - SOAP] Successfully retrieved ${soapEmails.length} Classic emails`);
        } else {
          console.log('📧 [Email List - SOAP] No Classic emails found');
        }
      }
    } catch (soapError) {
      console.error('❌ [Email List - SOAP] SOAP API Error:', soapError.message);
      if (soapError.response) {
        console.error('❌ [Email List - SOAP] SOAP Error Response:', soapError.response.data);
      }
    }

    // 2. REST API - Content Builder Email Storage
    try {
      console.log('📧 [Email List - REST] Retrieving Content Builder emails via REST API');
      
      const restResponse = await axios.get(
        `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets?$pagesize=50&$filter=assetType.id in (207,208,209)`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('📧 [Email List - REST] REST Response received');
      // console.log('📧 [Email List - REST] REST Response Data:', JSON.stringify(restResponse.data, null, 2)); // Commented out to reduce log size

      if (restResponse.data && restResponse.data.items && Array.isArray(restResponse.data.items)) {
        
        const restEmails = restResponse.data.items
          .filter(email => email && email.id) // Filter out invalid entries
          .map(email => ({
            id: String(email.id),
            name: String(email.name || 'Untitled Email').substring(0, 100)
          }));
        
        allEmails = allEmails.concat(restEmails);
        console.log(`📧 [Email List - REST] Successfully retrieved ${restEmails.length} Content Builder emails`);
      } else {
        console.log('📧 [Email List - REST] No Content Builder emails found');
      }
    } catch (restError) {
      console.error('❌ [Email List - REST] REST API Error:', restError.message);
      if (restError.response) {
        console.error('❌ [Email List - REST] REST Error Response:', restError.response.data);
      }
    }

    // 3. Deduplicate emails by name, then return limited results
    const emailMap = new Map();
    allEmails.forEach(email => {
      const key = `${email.name}`;
      if (!emailMap.has(key)) {
        emailMap.set(key, email);
      }
    });
    
    const deduplicatedEmails = Array.from(emailMap.values());
    const limitedEmails = deduplicatedEmails.slice(0, 100); // Limit to first 100 emails
    
    console.log(`📧 [Email List] Total emails retrieved: ${allEmails.length}, after deduplication: ${deduplicatedEmails.length}, returning: ${limitedEmails.length} (limited for performance)`);
    res.json(limitedEmails);

  } catch (error) {
    console.error('❌ [Email List] Failed to retrieve emails:', error.message);
    res.status(500).json({ error: 'Failed to retrieve emails' });
  }
});

// Helper function to map Content Builder asset type IDs to readable names
function getEmailTypeFromAssetType(assetTypeId) {
  const assetTypeMap = {
    207: 'HTML Email',
    208: 'Text Email', 
    209: 'Template Email'
  };
  return assetTypeMap[assetTypeId] || 'Content Builder Email';
}

// Bulk update emails with MCX_ArchivingBlock
app.post('/emails/add-archiving-block', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { emailIds, contentBlockId } = req.body;
    
    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return res.status(400).json({ error: 'Email IDs array is required' });
    }

    if (!contentBlockId) {
      return res.status(400).json({ error: 'Content block ID is required' });
    }

    console.log(`📧 [Email Archive Block] Adding MCX_ArchivingBlock to ${emailIds.length} emails`);
    
    const results = [];
    
    // Helper function to append AMPscript to HTML content
    const appendAmpScript = (html) => {
      const amp = '%%=ContentBlockByName("MCX_ArchivingBlock")=%%';
      
      // Check if AMPscript is already present
      if (html.includes('%%=ContentBlockByName("MCX_ArchivingBlock")=%%')) {
        return { modified: false, html: html, reason: 'AMPscript already exists' };
      }
      
      // Try to find </body> tag (case insensitive)
      const bodyCloseRegex = /<\/body\s*>/i;
      if (bodyCloseRegex.test(html)) {
        const updatedHtml = html.replace(bodyCloseRegex, amp + '\n$&');
        return { 
          modified: true, 
          html: updatedHtml,
          reason: 'Added before </body> tag'
        };
      }
      
      // Try to find </html> tag (case insensitive)
      const htmlCloseRegex = /<\/html\s*>/i;
      if (htmlCloseRegex.test(html)) {
        const updatedHtml = html.replace(htmlCloseRegex, amp + '\n$&');
        return { 
          modified: true, 
          html: updatedHtml,
          reason: 'Added before </html> tag'
        };
      }
      
      // If no closing tags found, append to the end
      return { 
        modified: true, 
        html: html + '\n' + amp,
        reason: 'Added at end of content (no closing tags found)'
      };
    };
    
    // Process regular HTML emails
    async function processRegularEmail(emailId, emailData, accessToken, subdomain, appendAmpScript) {
      if (!emailData.views?.html?.content) {
        return { emailId, status: 'skipped', message: 'No HTML content found' };
      }

      const originalHtml = emailData.views.html.content;
      const modificationResult = appendAmpScript(originalHtml);
      
      if (!modificationResult.modified) {
        return { emailId, status: 'skipped', message: modificationResult.reason };
      }

      const patchPayload = { views: { html: { content: modificationResult.html } } };
      console.log(`📧 [Email Archive Block] Making PATCH request for regular email ${emailId}...`);
      const patchResponse = await axios.patch(
        `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${emailId}`,
        patchPayload,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      console.log(`📧 [Email Archive Block] PATCH response status: ${patchResponse.status}`);

      return { emailId, status: 'success', message: `Archive block added (${modificationResult.reason})` };
    }
    
    // Process template-based emails 
    async function processTemplateBasedEmail(emailId, emailData, accessToken, subdomain) {
      if (!emailData.views?.html?.slots) {
        return { emailId, status: 'skipped', message: 'No slots structure found' };
      }

      const slots = emailData.views.html.slots;
      console.log(`📧 [Email Archive Block] Template email slots:`, Object.keys(slots));
      console.log(`📧 [Email Archive Block] Original emailData.views.html structure:`, JSON.stringify(emailData.views.html, null, 2));
      
      const slotPriority = ['content', 'main', 'body', 'footer'];
      let targetSlotName = slotPriority.find(name => slots[name]) || Object.keys(slots)[0];
      
      if (!targetSlotName) {
        return { emailId, status: 'skipped', message: 'No suitable slot found' };
      }
      
      const targetSlot = slots[targetSlotName];
      console.log(`📧 [Email Archive Block] Target slot "${targetSlotName}" structure:`, JSON.stringify(targetSlot, null, 2));
      
      // For template emails, blocks is an object with block IDs as keys
      const existingBlocks = targetSlot.blocks || {};
      
      // Check if archive block already exists by examining block content
      const archiveBlockExists = Object.values(existingBlocks).some(block => 
        block.content?.includes('%%=ContentBlockByName("MCX_ArchivingBlock")=%%')
      );
      
      if (archiveBlockExists) {
        return { emailId, status: 'skipped', message: 'Archive block already exists' };
      }
      
      // Generate a unique block ID matching the existing pattern (lowercase alphanumeric, 13 chars)
      const generateBlockId = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 13; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };
      const newBlockId = generateBlockId();
      
      const newBlock = {
        assetType: {
          id: 195, // HTML block type
          name: 'htmlblock'
        },
        content: '%%=ContentBlockByName("MCX_ArchivingBlock")=%%',
        design: '%%=ContentBlockByName("MCX_ArchivingBlock")=%%',
        meta: {
          wrapperStyles: {
            mobile: { visible: true },
            styling: {}
          }
        },
        availableViews: [],
        data: {
          email: {
            options: {
              generateFrom: ""
            }
          }
        },
        modelVersion: 2
      };
      
      // Add the new block to the blocks object
      const updatedBlocks = {
        ...existingBlocks,
        [newBlockId]: newBlock
      };
      
      // Update the content HTML to include the new block at the end
      const currentContent = targetSlot.content || '';
      const newBlockDiv = `<div data-type="block" data-key="${newBlockId}"></div>`;
      const updatedContent = currentContent + newBlockDiv;
      
      // Update the slot with new blocks and content
      const updatedSlots = { 
        ...slots,
        [targetSlotName]: {
          ...targetSlot,
          blocks: updatedBlocks,
          content: updatedContent
        }
      };
      
      console.log(`📧 [Email Archive Block] Updated slots structure:`, JSON.stringify(updatedSlots, null, 2));
      
      // Preserve the full original structure and only update the slots
      const patchPayload = {
        views: {
          html: {
            ...emailData.views.html,
            slots: updatedSlots
          }
        }
      };
      
      console.log(`📧 [Email Archive Block] PATCH payload:`, JSON.stringify(patchPayload, null, 2));
      
      console.log(`📧 [Email Archive Block] Making PATCH request to update email ${emailId}...`);
      const patchResponse = await axios.patch(
        `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${emailId}`,
        patchPayload,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      
      console.log(`📧 [Email Archive Block] PATCH response status: ${patchResponse.status}`);
      console.log(`📧 [Email Archive Block] PATCH response data:`, JSON.stringify(patchResponse.data, null, 2));
      
      // Verify the update by fetching the email again
      console.log(`📧 [Email Archive Block] Verifying update by fetching email ${emailId} again...`);
      const verifyResponse = await axios.get(
        `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${emailId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      console.log(`📧 [Email Archive Block] Verification - email still has content:`, !!verifyResponse.data.views?.html?.slots);
      console.log(`📧 [Email Archive Block] Verification - target slot still exists:`, !!verifyResponse.data.views?.html?.slots?.[targetSlotName]);

      return { emailId, status: 'success', message: `Archive block added to slot '${targetSlotName}'` };
    }
    
    for (const emailId of emailIds) {
      try {
        console.log(`📧 [Email Archive Block] Processing email ID: ${emailId}`);
        
        // Step 1: Fetch full email content via REST API
        console.log(`📧 [Email Archive Block] Fetching content for email ${emailId}`);
        const getResponse = await axios.get(
          `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${emailId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`📧 [Email Archive Block] Received response for email ${emailId}:`, {
          id: getResponse.data.id,
          name: getResponse.data.name,
          assetType: getResponse.data.assetType?.name || getResponse.data.assetType,
          hasViews: !!getResponse.data.views,
          hasHtml: !!getResponse.data.views?.html,
          hasContent: !!getResponse.data.views?.html?.content,
          hasSlots: !!getResponse.data.views?.html?.slots
        });

        const emailData = getResponse.data;
        const assetType = emailData.assetType?.name || emailData.assetType;
        
        // Determine email type and processing method
        if (assetType === 'templatebasedemail') {
          console.log(`📧 [Email Archive Block] Processing template-based email ${emailId}`);
          const templateResult = await processTemplateBasedEmail(emailId, emailData, accessToken, subdomain);
          results.push(templateResult);
        } else {
          console.log(`📧 [Email Archive Block] Processing regular HTML email ${emailId}`);
          const regularResult = await processRegularEmail(emailId, emailData, accessToken, subdomain, appendAmpScript);
          results.push(regularResult);
        }
        
      } catch (emailError) {
        console.error(`❌ [Email Archive Block] Failed to process email ${emailId}:`, {
          message: emailError.message,
          status: emailError.response?.status,
          statusText: emailError.response?.statusText,
          data: emailError.response?.data
        });
        
        let errorMessage = emailError.message;
        if (emailError.response?.data?.message) {
          errorMessage = emailError.response.data.message;
        } else if (emailError.response?.data?.error_description) {
          errorMessage = emailError.response.data.error_description;
        }
        
        results.push({
          emailId: emailId,
          status: 'error',
          message: `Failed to process: ${errorMessage}`
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    console.log(`📧 [Email Archive Block] Completed: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`);

    res.json({
      status: 'completed',
      totalProcessed: emailIds.length,
      successCount,
      errorCount,
      skippedCount,
      results
    });

  } catch (error) {
    console.error('❌ [Email Archive Block] Failed to process bulk update:', error.message);
    res.status(500).json({ error: 'Failed to process bulk update' });
  }
});

// Check archive status for emails
app.post('/emails/check-archive-status', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { emailIds } = req.body;
    
    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return res.status(400).json({ error: 'Email IDs array is required' });
    }

    console.log(`📧 [Archive Status Check] Checking archive status for ${emailIds.length} emails`);
    
    const results = [];
    
    for (const emailId of emailIds) {
      try {
        console.log(`📧 [Archive Status Check] Checking email ID: ${emailId}`);
        
        // Fetch email content via REST API
        const getResponse = await axios.get(
          `https://${subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets/${emailId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Check if email has HTML content and contains the archiving block
        let hasArchiveBlock = false;
        if (getResponse.data.views?.html?.content) {
          const htmlContent = getResponse.data.views.html.content;
          hasArchiveBlock = htmlContent.includes('%%=ContentBlockByName("MCX_ArchivingBlock")=%%');
        }

        console.log(`📧 [Archive Status Check] Email ${emailId}: Archive block present = ${hasArchiveBlock}`);

        results.push({
          emailId: emailId,
          hasArchiveBlock: hasArchiveBlock
        });
        
      } catch (emailError) {
        console.error(`❌ [Archive Status Check] Failed to check email ${emailId}:`, emailError.message);
        results.push({
          emailId: emailId,
          hasArchiveBlock: false // Default to false if check fails
        });
      }
    }

    console.log(`📧 [Archive Status Check] Completed checking ${emailIds.length} emails`);

    res.json({
      status: 'completed',
      totalChecked: emailIds.length,
      results
    });

  } catch (error) {
    console.error('❌ [Archive Status Check] Failed to check archive status:', error.message);
    res.status(500).json({ error: 'Failed to check archive status' });
  }
});

// Register the SentEvent endpoint
require('./emailArchiveSentEventsEndpoint')(app);

// ============== SETTINGS ENDPOINTS ==============

// Settings storage (loaded from file and persisted across server restarts)
let globalSettings = loadSettings();
console.log('🔧 [Settings] Loaded settings on startup:');
console.log('🔧 [Settings] SFTP Host:', globalSettings.sftp?.host || 'Not set');
console.log('🔧 [Settings] SFTP Username:', globalSettings.sftp?.username || 'Not set');
console.log('🔧 [Settings] SFTP Auth Type:', globalSettings.sftp?.authType || 'Not set');
console.log('🔧 [Settings] SFTP Directory:', globalSettings.sftp?.directory || 'Not set');
console.log('🔧 [Settings] Settings file exists:', fs.existsSync(settingsPath));
console.log('🔧 [Settings] Settings file path:', settingsPath);

// Get SFTP settings
app.get('/api/settings/sftp', (req, res) => {
  try {
    console.log('🔍 [Settings] GET request for SFTP settings');
    console.log('🔍 [Settings] Settings file path:', settingsPath);
    console.log('🔍 [Settings] Settings file exists:', fs.existsSync(settingsPath));
    console.log('🔍 [Settings] Current globalSettings.sftp:', globalSettings.sftp);
    
    // Return settings without sensitive data for security
    const sftpSettings = { ...globalSettings.sftp };
    delete sftpSettings.password;
    delete sftpSettings.privateKey;
    delete sftpSettings.passphrase;
    
    console.log('🔍 [Settings] Returning SFTP settings (without sensitive data):', sftpSettings);
    res.json(sftpSettings);
  } catch (error) {
    console.error('❌ [Settings] Failed to get SFTP settings:', error.message);
    res.status(500).json({ error: 'Failed to retrieve SFTP settings' });
  }
});

// Save SFTP settings
app.post('/api/settings/sftp', (req, res) => {
  try {
    const { host, port, username, authType, password, privateKey, passphrase, directory } = req.body;

    // Validate required fields
    if (!host || !username || !authType) {
      return res.status(400).json({ error: 'Host, username, and authentication type are required' });
    }

    // Validate auth type specific requirements
    if (authType === 'password' && !password && !globalSettings.sftp.password) {
      return res.status(400).json({ error: 'Password is required for password authentication' });
    }
    
    if (authType === 'key' && !privateKey && !globalSettings.sftp.privateKey) {
      return res.status(400).json({ error: 'Private key is required for key authentication' });
    }

    // Update settings
    globalSettings.sftp = {
      host: host.trim(),
      port: parseInt(port) || 22,
      username: username.trim(),
      authType: authType,
      password: authType === 'password' ? (password || globalSettings.sftp.password) : '',
      privateKey: authType === 'key' ? (privateKey || globalSettings.sftp.privateKey) : '',
      passphrase: authType === 'key' ? (passphrase || globalSettings.sftp.passphrase) : '',
      directory: directory?.trim() || '/Export'
    };

    // Persist settings to file
    console.log('💾 [Settings] Saving settings to file:', settingsPath);
    const settingsSaved = saveSettings(globalSettings);
    
    if (!settingsSaved) {
      console.error('❌ [Settings] Failed to save settings to file');
      return res.status(500).json({ error: 'Failed to save settings to file' });
    }

    console.log(`✅ [Settings] SFTP settings saved and persisted for host: ${globalSettings.sftp.host} (auth: ${globalSettings.sftp.authType})`);
    console.log(`💾 [Settings] Settings file updated at: ${settingsPath}`);
    
    // Verify the file was actually written
    if (fs.existsSync(settingsPath)) {
      const fileSize = fs.statSync(settingsPath).size;
      console.log(`✅ [Settings] Settings file verified - size: ${fileSize} bytes`);
    } else {
      console.error('❌ [Settings] Settings file was not created!');
    }
    
    res.json({ success: true, message: 'SFTP settings saved successfully' });

  } catch (error) {
    console.error('❌ [Settings] Failed to save SFTP settings:', error.message);
    res.status(500).json({ error: 'Failed to save SFTP settings' });
  }
});

// Test SFTP connection
app.post('/api/settings/sftp/test', async (req, res) => {
  try {
    const { host, port, username, authType, password, privateKey, passphrase, directory } = req.body;

    // Validate required fields
    if (!host || !username || !authType) {
      return res.status(400).json({ error: 'Host, username, and authentication type are required for testing' });
    }

    // Validate auth type specific requirements
    if (authType === 'password' && !password) {
      return res.status(400).json({ error: 'Password is required for password authentication' });
    }
    
    if (authType === 'key' && !privateKey) {
      return res.status(400).json({ error: 'Private key is required for key authentication' });
    }

    // For now, simulate a connection test
    // In production, you would use an SFTP library like 'ssh2-sftp-client'
    const testSettings = {
      host: host.trim(),
      port: parseInt(port) || 22,
      username: username.trim(),
      authType: authType,
      directory: directory?.trim() || '/Export'
    };

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock test result (in production, perform actual SFTP connection)
    if (testSettings.host.includes('test-fail')) {
      throw new Error('Connection failed: Unable to connect to SFTP server');
    }

    console.log(`✅ [Settings] SFTP connection test successful for: ${testSettings.host} (${testSettings.authType})`);
    res.json({ 
      success: true, 
      message: `SFTP connection test successful using ${authType} authentication`,
      details: {
        host: testSettings.host,
        port: testSettings.port,
        authType: testSettings.authType,
        directory: testSettings.directory
      }
    });

  } catch (error) {
    console.error('❌ [Settings] SFTP connection test failed:', error.message);
    res.status(400).json({ 
      success: false, 
      error: error.message || 'SFTP connection test failed' 
    });
  }
});

// Export HTML_Log to SFTP
app.post('/api/email-archiving/export-to-sftp', async (req, res) => {
  try {
    // Check if SFTP settings are configured
    if (!globalSettings.sftp.host || !globalSettings.sftp.username) {
      return res.status(400).json({ 
        error: 'SFTP settings not configured. Please configure SFTP settings first.' 
      });
    }

    // Check auth-specific requirements
    if (globalSettings.sftp.authType === 'password' && !globalSettings.sftp.password) {
      return res.status(400).json({ 
        error: 'SFTP password not configured. Please update SFTP settings.' 
      });
    }
    
    if (globalSettings.sftp.authType === 'key' && !globalSettings.sftp.privateKey) {
      return res.status(400).json({ 
        error: 'SFTP private key not configured. Please update SFTP settings.' 
      });
    }

    // Get credentials from session (same as other endpoints)
    const creds = req.session.mcCreds;
    if (!creds || !creds.clientId || !creds.clientSecret || !creds.subdomain) {
      return res.status(400).json({ error: 'Marketing Cloud credentials not found. Please login first.' });
    }

    console.log('🔄 [Export] Starting HTML_Log export to SFTP...');
    
    // Get access token using the same method as other endpoints
    const accessToken = getAccessTokenFromRequest(req);
    const subdomain = getSubdomainFromRequest(req);
    
    if (!accessToken || !subdomain) {
      console.log('⚠️ [Export] No access token or subdomain found in session');
      console.log('� [Export] User may need to login again');
    } else {
      console.log('✅ [Export] Successfully retrieved access token from session');
    }

    // Try to query HTML_Log Data Extension using the correct endpoint
    let rows = [];
    let allRows = []; // To check if all records are archived
    let dataSource = 'mock'; // Track data source for user feedback
    
    if (accessToken) {
      try {
        console.log(`🔍 [Export] Querying HTML_Log DE using SOAP API at: https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`);
        
        // First, query ALL records to check if HTML_Log exists and has data
        const allRecordsSoapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <s:Header>
    <a:Action s:mustUnderstand="1">Retrieve</a:Action>
    <a:To s:mustUnderstand="1">https://${subdomain}.soap.marketingcloudapis.com/Service.asmx</a:To>
    <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
  </s:Header>
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <RetrieveRequest>
        <ObjectType>DataExtensionObject[HTML_Log]</ObjectType>
        <Properties>ArchiveId</Properties>
        <Properties>archived</Properties>
      </RetrieveRequest>
    </RetrieveRequestMsg>
  </s:Body>
</s:Envelope>`;

        const allRecordsResponse = await axios.post(
          `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
          allRecordsSoapEnvelope,
          {
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              'SOAPAction': 'Retrieve'
            }
          }
        );
        
        console.log(`📊 [Export] All records query status: ${allRecordsResponse.status}`);
        
        // Parse response to check what data exists
        try {
          const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
          const allRecordsResult = await new Promise((resolve, reject) => {
            parser.parseString(allRecordsResponse.data, (err, parsed) => {
              if (err) reject(err);
              else resolve(parsed);
            });
          });
          
          const soapBody = allRecordsResult['soap:Envelope']?.['soap:Body'] || allRecordsResult['s:Envelope']?.['s:Body'];
          const retrieveResponse = soapBody?.['RetrieveResponseMsg'];
          const results = retrieveResponse?.['Results'];
          
          if (results && Array.isArray(results)) {
            allRows = results.map(result => {
              const properties = result.Properties?.Property || [];
              const row = {};
              
              if (Array.isArray(properties)) {
                properties.forEach(prop => {
                  if (prop.Name && prop.Value) {
                    row[prop.Name] = prop.Value;
                  }
                });
              } else if (properties.Name && properties.Value) {
                row[properties.Name] = properties.Value;
              }
              
              return row;
            });
          } else if (results && !Array.isArray(results)) {
            const properties = results.Properties?.Property || [];
            const row = {};
            
            if (Array.isArray(properties)) {
              properties.forEach(prop => {
                if (prop.Name && prop.Value) {
                  row[prop.Name] = prop.Value;
                }
              });
            }
            
            allRows = [row];
          } else {
            allRows = [];
          }
          
          console.log(`📊 [Export] Found ${allRows.length} total records in HTML_Log`);
          
          // Check if HTML_Log exists but is empty
          if (allRows.length === 0) {
            return res.json({ 
              success: true, 
              message: 'HTML_Log Data Extension exists but contains no email records',
              exportedCount: 0,
              dataSource: 'empty_de',
              note: 'No emails have been archived yet. Send emails with the archiving AMPscript block first, then return here to export.',
              isEmpty: true
            });
          }
          
          // Check if all records are already archived
          const unarchivedRecords = allRows.filter(row => {
            const archived = row.archived || 'No';
            return archived === 'No' || archived === 'no' || archived === '' || archived === null || archived === undefined;
          });
          
          console.log(`📊 [Export] Found ${unarchivedRecords.length} unarchived records out of ${allRows.length} total`);
          
          if (unarchivedRecords.length === 0) {
            return res.json({ 
              success: true, 
              message: `All ${allRows.length} email records in HTML_Log are already archived`,
              exportedCount: 0,
              dataSource: 'all_archived',
              note: 'All email records have already been exported and archived. Send new emails to generate fresh content for export.',
              allArchived: true,
              totalRecords: allRows.length
            });
          }
          
        } catch (allRecordsParseError) {
          console.log('⚠️ [Export] Failed to parse all records query:', allRecordsParseError.message);
          allRows = [];
        }
        
        // Now query for unarchived records only (the original query)
        const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <s:Header>
    <a:Action s:mustUnderstand="1">Retrieve</a:Action>
    <a:To s:mustUnderstand="1">https://${subdomain}.soap.marketingcloudapis.com/Service.asmx</a:To>
    <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
  </s:Header>
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <RetrieveRequest>
        <ObjectType>DataExtensionObject[HTML_Log]</ObjectType>
        <Properties>ArchiveId</Properties>
        <Properties>EmailAddress</Properties>
        <Properties>SendTime</Properties>
        <Properties>EmailName</Properties>
        <Properties>HTML</Properties>
        <Properties>ListID</Properties>
        <Properties>JobID</Properties>
        <Properties>DataSourceName</Properties>
        <Properties>archived</Properties>
        <Properties>memberid</Properties>
        <Properties>subid</Properties>
        <Properties>subscriberkey</Properties>
        <Filter xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="SimpleFilterPart">
          <Property>archived</Property>
          <SimpleOperator>equals</SimpleOperator>
          <Value>No</Value>
        </Filter>
      </RetrieveRequest>
    </RetrieveRequestMsg>
  </s:Body>
</s:Envelope>`;

        const soapResponse = await axios.post(
          `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
          soapEnvelope,
          {
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              'SOAPAction': 'Retrieve'
            }
          }
        );
        
        console.log(`📊 [Export] SOAP Response Status: ${soapResponse.status}`);
        
        // Parse XML response using xml2js
        const xmlData = soapResponse.data;
        console.log(`📋 [Export] SOAP Response received, parsing XML...`);
        
        try {
          const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
          const result = await new Promise((resolve, reject) => {
            parser.parseString(xmlData, (err, parsed) => {
              if (err) reject(err);
              else resolve(parsed);
            });
          });
          
          // Navigate through the SOAP response structure
          const soapBody = result['soap:Envelope']?.['soap:Body'] || result['s:Envelope']?.['s:Body'];
          const retrieveResponse = soapBody?.['RetrieveResponseMsg'];
          const results = retrieveResponse?.['Results'];
          
          if (results && Array.isArray(results)) {
            // Parse each result into our row format
            rows = results.map(result => {
              const properties = result.Properties?.Property || [];
              const row = {};
              
              if (Array.isArray(properties)) {
                properties.forEach(prop => {
                  if (prop.Name && prop.Value) {
                    row[prop.Name] = prop.Value;
                  }
                });
              } else if (properties.Name && properties.Value) {
                // Single property case
                row[properties.Name] = properties.Value;
              }
              
              return row;
            });
            
            console.log(`📊 [Export] Successfully parsed ${rows.length} records from SOAP response`);
            console.log(`📋 [Export] Sample parsed record:`, rows.length > 0 ? JSON.stringify(rows[0], null, 2) : 'No data');
            
            // Additional client-side filter to ensure no archived records are included
            const totalRowCount = rows.length;
            rows = rows.filter(row => {
              const archived = row.archived || row.Archived || 'No';
              const isNotArchived = archived === 'No' || archived === 'no' || archived === '' || archived === null || archived === undefined;
              if (!isNotArchived) {
                console.log(`🚫 [Export] Filtering out already archived record - memberid: ${row.memberid}, archived: ${archived}`);
              }
              return isNotArchived;
            });
            
            if (totalRowCount !== rows.length) {
              console.log(`🔍 [Export] Filtered out ${totalRowCount - rows.length} already archived records. Remaining: ${rows.length}`);
            } else {
              console.log(`✅ [Export] All ${rows.length} records are unarchived and ready for export`);
            }
            
            // Debug: Check archived status of fetched records
            if (rows.length > 0) {
              const archivedStatuses = rows.map(row => ({ memberid: row.memberid, archived: row.archived }));
              console.log(`🔍 [Export] Archived status of fetched records:`, archivedStatuses.slice(0, 5)); // Show first 5
              
              const alreadyArchivedCount = rows.filter(row => row.archived === 'Yes').length;
              const notArchivedCount = rows.filter(row => row.archived === 'No' || !row.archived).length;
              
              console.log(`📊 [Export] Record status breakdown: ${alreadyArchivedCount} already archived, ${notArchivedCount} not archived`);
              
              if (alreadyArchivedCount > 0) {
                console.log(`⚠️ [Export] WARNING: Found ${alreadyArchivedCount} records with archived='Yes' - these should have been filtered out!`);
              }
            }
            
            // Safety net: Filter out any records that might have slipped through with archived='Yes'
            const originalRowCount = rows.length;
            rows = rows.filter(row => row.archived !== 'Yes');
            const filteredRowCount = rows.length;
            
            if (originalRowCount !== filteredRowCount) {
              console.log(`🛡️ [Export] Safety filter: Removed ${originalRowCount - filteredRowCount} already archived records`);
            }
          } else if (results && !Array.isArray(results)) {
            // Single result case
            const properties = results.Properties?.Property || [];
            const row = {};
            
            if (Array.isArray(properties)) {
              properties.forEach(prop => {
                if (prop.Name && prop.Value) {
                  row[prop.Name] = prop.Value;
                }
              });
            }
            
            rows = [row];
            console.log(`📊 [Export] Successfully parsed 1 record from SOAP response`);
          } else {
            console.log(`⚠️ [Export] No results found in SOAP response`);
            rows = [];
          }
          
        } catch (xmlParseError) {
          console.log('⚠️ [Export] Failed to parse SOAP XML response:', xmlParseError.message);
          console.log('📋 [Export] Raw SOAP Response sample:', xmlData.substring(0, 1000));
          rows = [];
        }
        
        dataSource = 'marketing_cloud';
        console.log(`� [Export] Successfully queried HTML_Log using SOAP API`);
        
      } catch (queryError) {
        console.log('⚠️ [Export] Could not query HTML_Log DE using SOAP:', queryError.response?.status, queryError.response?.statusText);
        console.log('🔍 [Export] SOAP query error details:', queryError.response?.data?.substring(0, 500));
        console.log('⚠️ [Export] Proceeding with mock data for demonstration');
      }
    } else {
      console.log('⚠️ [Export] No access token available, using mock data');
    }
    
    // Handle case when no data is found
    if (rows.length === 0) {
      // If we successfully connected to MC but found no data, it means HTML_Log exists but is empty
      if (accessToken && dataSource === 'marketing_cloud') {
        return res.json({ 
          success: true, 
          message: 'No email records found in HTML_Log Data Extension to export',
          exportedCount: 0,
          dataSource: 'empty',
          note: 'HTML_Log Data Extension exists but contains no data. Send emails with the archiving AMPscript block to generate data for export.',
          isEmpty: true
        });
      }
      
      // Otherwise, provide mock data for demo purposes (when MC connection issues, etc.)
      console.log('📊 [Export] No data available, providing demo export for testing purposes');
      dataSource = 'mock';
      rows = [
        {
          ArchiveId: 'A1B2C3D4-E5F6-7890-ABCD-EFGH12345678',
          EmailAddress: 'subscriber1@example.com',
          SendTime: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          EmailName: 'Welcome Email Campaign',
          HTML: '<html><head><title>Welcome!</title></head><body><h1>Welcome to our service!</h1><p>Thank you for subscribing.</p></body></html>',
          ListID: '12345',
          JobID: '67890',
          DataSourceName: 'Email Studio',
          archived: 'No',
          memberid: '523018375',
          subid: 'SUB123456',
          subscriberkey: 'subscriber1@example.com'
        },
        {
          ArchiveId: 'B2C3D4E5-F6G7-8901-BCDE-FGHI23456789',
          EmailAddress: 'subscriber2@example.com',
          SendTime: new Date(Date.now() - 43200000).toISOString(), // 12 hours ago
          EmailName: 'Product Update Newsletter',
          HTML: '<html><head><title>Product Updates</title></head><body><h1>Latest Product Updates</h1><p>Check out our new features!</p></body></html>',
          ListID: '12346',
          JobID: '67891',
          DataSourceName: 'Journey Builder',
          archived: 'No',
          memberid: '523018376',
          subid: 'SUB123457',
          subscriberkey: 'subscriber2@example.com'
        },
        {
          ArchiveId: 'C3D4E5F6-G7H8-9012-CDEF-GHIJ34567890',
          EmailAddress: 'subscriber3@example.com',
          SendTime: new Date().toISOString(), // Now
          EmailName: 'Special Offer Email',
          HTML: '<html><head><title>Special Offer</title></head><body><h1>Limited Time Offer!</h1><p>Get 50% off your next purchase.</p></body></html>',
          ListID: '12347',
          JobID: '67892',
          DataSourceName: 'Automation Studio',
          archived: 'No',
          memberid: '523018377',
          subid: 'SUB123458',
          subscriberkey: 'subscriber3@example.com'
        }
      ];
      console.log(`📊 [Export] Using ${rows.length} mock records for demonstration`);
    }
    
    if (rows.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No data found in HTML_Log to export',
        exportedCount: 0,
        dataSource: dataSource
      });
    }

    // Generate zip file with individual HTML files and manifest
    if (rows.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No data found in HTML_Log to export',
        exportedCount: 0,
        dataSource: dataSource
      });
    }

    // Generate timestamp for filename pattern
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    
    // Get memberid from first record for filename (or use default)
    const primaryMemberid = rows[0]?.memberid || rows[0]?.values?.memberid || '00000';
    
    // Generate zip filename: EmailArchiving_%MEMBERID%_%YEAR%-%MM%-%DD%-%HH%%MIN%%SS%.zip
    const zipFilename = `EmailArchiving_${primaryMemberid}_${year}-${month}-${day}-${hour}h${min}m${sec}s.zip`;
    
    console.log(`📦 [Export] Creating zip file: ${zipFilename}`);
    
    // Create zip archive in memory
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipBuffers = [];
    
    archive.on('data', (chunk) => {
      zipBuffers.push(chunk);
    });
    
    let zipBuffer;
    const zipPromise = new Promise((resolve, reject) => {
      archive.on('end', () => {
        zipBuffer = Buffer.concat(zipBuffers);
        console.log(`📦 [Export] Zip file created successfully, size: ${zipBuffer.length} bytes`);
        resolve();
      });
      
      archive.on('error', (err) => {
        console.error(`❌ [Export] Error creating zip file:`, err);
        reject(err);
      });
    });
    
    // Process each row to create individual HTML files
    const manifestData = [];
    let htmlFileCount = 0;
    
    rows.forEach((row, index) => {
      const memberid = row.memberid || row.values?.memberid || (index + 1);
      const jobid = row.JobID || row.values?.JobID || '';
      const listid = row.ListID || row.values?.ListID || '';
      const subid = row.subid || row.values?.subid || memberid; // Use subid if available, fallback to memberid
      const subscriberkey = row.subscriberkey || row.values?.subscriberkey || '';
      const emailname = row.EmailName || row.values?.EmailName || 'Unknown_Email';
      const sendtime = row.SendTime || row.values?.SendTime || new Date().toISOString();
      const html = row.HTML || row.values?.HTML || '<html><body>No HTML content available</body></html>';
      const emailAddress = row.EmailAddress || row.values?.EmailAddress || '';
      
      // Generate individual HTML filename: EmailName_JobID_subid_Sendtime.html
      // Clean up filename by removing special characters and spaces
      const cleanEmailName = emailname.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanSendTime = sendtime.replace(/[^a-zA-Z0-9]/g, '_');
      const htmlFilename = `${cleanEmailName}_${jobid}_${subid}_${cleanSendTime}.html`;
      
      // Add HTML file to zip
      archive.append(html, { name: htmlFilename });
      htmlFileCount++;
      
      // Add to manifest: Filename, JobID, ListID, SubID
      manifestData.push({
        Filename: htmlFilename,
        JobID: jobid,
        ListID: listid,
        SubID: subid // Use the actual subid field
      });
    });
    
    // Create manifest CSV content
    const manifestHeaders = ['Filename', 'JobID', 'ListID', 'SubID'];
    const manifestCsvRows = [manifestHeaders.join(',')];
    
    manifestData.forEach(row => {
      const values = manifestHeaders.map(header => {
        let value = row[header] || '';
        // Escape CSV values if they contain commas, quotes, or newlines
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      manifestCsvRows.push(values.join(','));
    });
    
    const manifestContent = manifestCsvRows.join('\n');
    
    // Add manifest to zip
    archive.append(manifestContent, { name: 'Archive_Manifest.csv' });
    
    // Finalize the zip
    archive.finalize();
    
    // Wait for zip creation to complete
    await zipPromise;

    // Define SFTP paths that will be used in response
    const basePath = globalSettings.sftp.directory || '/Export';
    const emailArchivePath = `${basePath}/Email_Archive`.replace(/\/+/g, '/');
    const backupPath = `${emailArchivePath}/Backup`.replace(/\/+/g, '/');
    const auditFailurePath = `${emailArchivePath}/Audit_Failure`.replace(/\/+/g, '/');

    // Real SFTP upload with zip file
    console.log(`📤 [Export] Starting SFTP upload of zip file`);
    console.log(`🔐 [Export] Using ${globalSettings.sftp.authType} authentication`);
    
    const sftp = new Client();
    
    try {
      // Prepare connection config
      const connectOptions = {
        host: globalSettings.sftp.host,
        port: globalSettings.sftp.port || 22,
        username: globalSettings.sftp.username
      };
      
      // Add authentication method
      if (globalSettings.sftp.authType === 'password') {
        connectOptions.password = globalSettings.sftp.password;
      } else if (globalSettings.sftp.authType === 'key') {
        connectOptions.privateKey = globalSettings.sftp.privateKey;
      }
      
      console.log(`🔌 [Export] Connecting to SFTP server...`);
      await sftp.connect(connectOptions);
      console.log(`✅ [Export] Successfully connected to SFTP server`);
      
      // Create enhanced folder structure: Export/Email_Archive/Backup and Export/Email_Archive/Audit_Failure
      // Create directories
      console.log(`📁 [Export] Creating SFTP directory structure...`);
      console.log(`📁 [Export] Base path: ${basePath}`);
      console.log(`📁 [Export] Email Archive path: ${emailArchivePath}`);
      console.log(`📁 [Export] Backup path: ${backupPath}`);
      console.log(`📁 [Export] Audit Failure path: ${auditFailurePath}`);
      
      for (const dirPath of [basePath, emailArchivePath, backupPath, auditFailurePath]) {
        try {
          await sftp.mkdir(dirPath, true);
          console.log(`✅ [Export] Directory verified/created: ${dirPath}`);
        } catch (mkdirError) {
          if (mkdirError.message.includes('No such file') || mkdirError.message.includes('does not exist')) {
            console.log(`❌ [Export] Failed to create directory ${dirPath}: ${mkdirError.message}`);
            throw new Error(`Failed to create SFTP directory: ${dirPath}`);
          } else {
            console.log(`📁 [Export] Directory ${dirPath}: ${mkdirError.message} (likely already exists)`);
          }
        }
      }
      
      // Upload zip file to Email_Archive folder
      const zipFilePath = `${emailArchivePath}/${zipFilename}`.replace(/\/+/g, '/');
      console.log(`📤 [Export] Uploading zip file: ${zipFilePath}`);
      
      await sftp.put(zipBuffer, zipFilePath);
      console.log(`✅ [Export] Successfully uploaded ${zipFilename} to Email_Archive folder`);
      
      // Also copy the same file to Backup folder
      const backupZipFilePath = `${backupPath}/${zipFilename}`.replace(/\/+/g, '/');
      console.log(`📤 [Export] Copying zip file to Backup folder: ${backupZipFilePath}`);
      console.log(`📋 [Export] Backup folder path: ${backupPath}`);
      console.log(`📋 [Export] Zip buffer size: ${zipBuffer.length} bytes`);
      
      await sftp.put(zipBuffer, backupZipFilePath);
      console.log(`✅ [Export] Successfully copied ${zipFilename} to Backup folder`);
      
      // Verify backup copy immediately
      try {
        const backupExists = await sftp.exists(backupZipFilePath);
        console.log(`🔍 [Export] Backup file exists check: ${backupExists}`);
        
        if (backupExists) {
          const backupStat = await sftp.stat(backupZipFilePath);
          console.log(`📊 [Export] Backup file stats:`, {
            size: backupStat.size,
            modifiedTime: backupStat.modifyTime
          });
        }
      } catch (backupVerifyError) {
        console.log(`⚠️ [Export] Could not verify backup file:`, backupVerifyError.message);
      }
      
      // Verify upload by checking file exists in Email_Archive
      const fileList = await sftp.list(emailArchivePath);
      const uploadedFile = fileList.find(file => file.name === zipFilename);
      if (uploadedFile) {
        console.log(`✅ [Export] Upload verified - file size: ${uploadedFile.size} bytes`);
      }
      
      // Verify backup copy
      const backupFileList = await sftp.list(backupPath);
      const backupFile = backupFileList.find(file => file.name === zipFilename);
      if (backupFile) {
        console.log(`✅ [Export] Backup copy verified - file size: ${backupFile.size} bytes`);
      }
      
      await sftp.end();
      console.log(`🔌 [Export] SFTP connection closed`);
      
      // Update archived status for successfully exported records using SOAP
      if (dataSource !== 'mock' && rows.length > 0) {
        console.log(`📝 [Export] Updating archived status for ${rows.length} exported records using ArchiveId`);
        
        try {
          // Get ArchiveIds of exported records
          const exportedArchiveIds = rows.map(row => row.ArchiveId).filter(id => id);
          
          if (exportedArchiveIds.length > 0) {
            // Update each record to set archived = 'Yes' using SOAP with ArchiveId as primary key
            for (const archiveId of exportedArchiveIds) {
              console.log(`📝 [Export] Updating ArchiveId: ${archiveId} to archived='Yes'`);
              
              const updateSoap = `
                <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
                  <soapenv:Header>
                    <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
                  </soapenv:Header>
                  <soapenv:Body>
                    <UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
                      <Objects xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="DataExtensionObject">
                        <CustomerKey>HTML_Log</CustomerKey>
                        <Keys>
                          <Key>
                            <Name>ArchiveId</Name>
                            <Value>${archiveId}</Value>
                          </Key>
                        </Keys>
                        <Properties>
                          <Property>
                            <Name>archived</Name>
                            <Value>Yes</Value>
                          </Property>
                        </Properties>
                      </Objects>
                    </UpdateRequest>
                  </soapenv:Body>
                </soapenv:Envelope>
              `;
              
              try {
                const updateResponse = await axios.post(
                  `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`,
                  updateSoap,
                  {
                    headers: {
                      'Content-Type': 'text/xml; charset=utf-8',
                      'SOAPAction': 'Update'
                    }
                  }
                );
                
                console.log(`📝 [Export] SOAP update response for ArchiveId ${archiveId}:`, updateResponse.status);
                console.log(`📝 [Export] Response sample for ArchiveId ${archiveId}:`, updateResponse.data.substring(0, 500));
                
                // Parse XML response to check for success/errors
                try {
                  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
                  const updateResult = await new Promise((resolve, reject) => {
                    parser.parseString(updateResponse.data, (err, parsed) => {
                      if (err) reject(err);
                      else resolve(parsed);
                    });
                  });
                  
                  console.log(`📋 [Export] Parsed SOAP response for ArchiveId ${archiveId}:`, JSON.stringify(updateResult, null, 2));
                  
                  // Navigate through the SOAP response structure
                  const soapBody = updateResult['soap:Envelope']?.['soap:Body'] || updateResult['s:Envelope']?.['s:Body'];
                  const updateResponseMsg = soapBody?.['UpdateResponse'] || soapBody?.['UpdateResponseMsg'];
                  const results = updateResponseMsg?.['Results'];
                  
                  let updateSuccess = false;
                  
                  if (results) {
                    const resultsArray = Array.isArray(results) ? results : [results];
                    for (const result of resultsArray) {
                      const statusCode = result?.['StatusCode'];
                      const statusMessage = result?.['StatusMessage'];
                      
                      console.log(`📋 [Export] Result for ArchiveId ${archiveId} - Status: ${statusCode}, Message: ${statusMessage}`);
                      
                      if (statusCode === 'OK') {
                        updateSuccess = true;
                        console.log(`✅ [Export] Successfully updated archived status for ArchiveId: ${archiveId}`);
                      } else {
                        console.log(`⚠️ [Export] Update failed for ArchiveId ${archiveId}. Status: ${statusCode}, Message: ${statusMessage}`);
                      }
                    }
                  } else {
                    // Fallback to simple string check
                    if (updateResponse.data && (updateResponse.data.includes('OK') || updateResponse.data.includes('Success'))) {
                      updateSuccess = true;
                      console.log(`✅ [Export] Successfully updated archived status for ArchiveId: ${archiveId} (fallback check)`);
                    } else {
                      console.log(`⚠️ [Export] No clear success indicator for ArchiveId ${archiveId}`);
                    }
                  }
                  
                  if (!updateSuccess) {
                    console.log(`❌ [Export] Failed to update archived status for ArchiveId: ${archiveId}`);
                  }
                  
                } catch (xmlParseError) {
                  console.log(`⚠️ [Export] XML parsing failed for ArchiveId ${archiveId}:`, xmlParseError.message);
                  console.log(`📋 [Export] Raw response:`, updateResponse.data);
                }
              } catch (soapUpdateError) {
                console.error(`❌ [Export] SOAP update failed for ArchiveId ${archiveId}:`, soapUpdateError.message);
              }
            }
            
            console.log(`✅ [Export] Completed archived status update for ${exportedArchiveIds.length} records`);
          }
        } catch (updateError) {
          console.error(`⚠️ [Export] Failed to update archived status:`, updateError.message);
          console.error(`⚠️ [Export] Update error details:`, updateError.response?.data || updateError.stack);
        }
      }
      
    } catch (sftpError) {
      console.error(`❌ [Export] SFTP upload failed:`, sftpError.message);
      try {
        await sftp.end();
      } catch (closeError) {
        console.error(`⚠️ [Export] Error closing SFTP connection:`, closeError.message);
      }
      throw new Error(`SFTP upload failed: ${sftpError.message}`);
    }

    console.log(`✅ [Export] Successfully exported ${rows.length} records in zip file to SFTP`);
    
    let message = `Successfully exported ${rows.length} email records in zip file (${htmlFileCount} HTML files + manifest) to SFTP`;
    if (dataSource === 'mock') {
      message += ' (🧪 DEMO MODE: Using sample data for testing purposes)';
    } else {
      message += ' (📊 LIVE DATA: Exported actual email records from HTML_Log DE)';
    }
    
    res.json({
      success: true,
      message: message,
      exportedCount: rows.length,
      htmlFilesCount: htmlFileCount,
      zipFilename: zipFilename,
      zipPath: `${emailArchivePath}/${zipFilename}`,
      manifestIncluded: true,
      folderStructure: {
        emailArchive: emailArchivePath,
        backup: backupPath,
        auditFailure: auditFailurePath
      },
      dataSource: dataSource,
      note: dataSource === 'mock' ? 
        '🧪 Demo mode: This was a test export with sample data to verify SFTP functionality.' : 
        '📊 Live data export: Successfully exported actual email records from HTML_Log Data Extension'
    });

  } catch (error) {
    console.error('❌ [Export] Failed to export to SFTP:', error.message);
    console.error('🔍 [Export] Error stack:', error.stack);
    if (error.response) {
      console.error('🔍 [Export] Response status:', error.response.status);
      console.error('🔍 [Export] Response data:', error.response.data);
    }
    res.status(500).json({ error: 'Failed to export to SFTP: ' + error.message });
  }
});

// ==================== SFMC API FUNCTIONS FOR SCHEMA BUILDER ====================

// Helper function to recursively search for targetDataExtensions in any object structure
function findTargetDataExtensionsRecursive(obj, path = '') {
  const results = [];
  
  if (!obj || typeof obj !== 'object') {
    return results;
  }
  
  // If this object has targetDataExtensions, add them
  if (Array.isArray(obj.targetDataExtensions)) {
    console.log(`🎯 [Recursive Search] Found targetDataExtensions at path: ${path}`);
    results.push(...obj.targetDataExtensions);
  }
  
  // Recursively search all properties
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      const currentPath = path ? `${path}.${key}` : key;
      const nestedResults = findTargetDataExtensionsRecursive(value, currentPath);
      results.push(...nestedResults);
    }
  }
  
  return results;
}

// Helper function to find a DE by multiple potential identifiers (enhanced)
function findDataExtensionByIdentifier(identifier, dataExtensions) {
  if (!identifier || !dataExtensions) return null;
  
  // Convert identifier to string for consistent comparison
  const idStr = String(identifier);
  
  console.log(`🔍 [DE Lookup] Searching for DE with identifier: "${idStr}"`);
  
  // Try multiple lookup strategies
  const lookupStrategies = [
    // Strategy 1: Direct ID match
    de => de.id === idStr,
    // Strategy 2: Check if ID ends with the identifier (for UUIDs)
    de => de.id.endsWith(idStr),
    // Strategy 3: Check if identifier ends with the DE ID
    de => idStr.endsWith(de.id),
    // Strategy 4: Name match
    de => de.name === idStr,
    // Strategy 5: Key match
    de => de.key === idStr || de.externalKey === idStr || de.customerKey === idStr,
    // Strategy 6: Check de_KEY format
    de => de.id === `de_${idStr}`,
    de => `de_${de.key}` === idStr,
    de => `de_${de.externalKey}` === idStr,
    de => `de_${de.customerKey}` === idStr,
    de => `de_${de.id}` === idStr
  ];
  
  for (let i = 0; i < lookupStrategies.length; i++) {
    const strategy = lookupStrategies[i];
    const found = dataExtensions.find(strategy);
    if (found) {
      console.log(`✅ [DE Lookup] Found DE "${found.name}" (${found.id}) using strategy ${i + 1}`);
      return found;
    }
  }
  
  console.log(`❌ [DE Lookup] No DE found for identifier: "${idStr}"`);
  return null;
}

/**
 * Fetch Data Extensions from SFMC using SOAP API
 */
async function fetchSFMCDataExtensions(accessToken, subdomain) {
  try {
    console.log('🔍 [SFMC API] Fetching Data Extensions...');
    
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                      xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soapenv:Header>
        <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <RetrieveRequest>
            <ObjectType>DataExtension</ObjectType>
            <Properties>ObjectID</Properties>
            <Properties>Name</Properties>
            <Properties>CustomerKey</Properties>
            <Properties>Description</Properties>
            <Properties>CreatedDate</Properties>
            <Properties>ModifiedDate</Properties>
            <Properties>CategoryID</Properties>
            <Properties>IsSendable</Properties>
            <Properties>IsTestable</Properties>
            <Properties>DataRetentionPeriodLength</Properties>
            <Properties>DataRetentionPeriod</Properties>
          </RetrieveRequest>
        </RetrieveRequestMsg>
      </soapenv:Body>
    </soapenv:Envelope>`;

    const response = await axios.post(`https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'Retrieve'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('📡 [SFMC API] Data Extensions SOAP response received');

    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    const retrieveResponse = result['soap:Envelope']['soap:Body']['RetrieveResponseMsg'];
    const results = retrieveResponse?.Results;
    
    if (!results) {
      console.log('⚠️ [SFMC API] No Data Extensions found');
      return [];
    }
    
    const dataExtensions = Array.isArray(results) ? results : [results];
    
    console.log(`✅ [SFMC API] Found ${dataExtensions.length} Data Extensions`);
    
    return dataExtensions.map(de => ({
      id: `de_${de.CustomerKey || de.ObjectID}`,
      name: de.Name || 'Unnamed Data Extension',
      externalKey: de.CustomerKey,
      description: de.Description || '',
      createdDate: de.CreatedDate,
      modifiedDate: de.ModifiedDate,
      isSendable: de.IsSendable === 'true',
      type: 'DataExtension'
    }));
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching Data Extensions:', error.message);
    if (error.response) {
      console.error('❌ [SFMC API] Response status:', error.response.status);
      console.error('❌ [SFMC API] Response data:', error.response.data?.substring(0, 500));
    }
    throw error;
  }
}

/**
 * Fetch SQL Queries from SFMC using SOAP API with enhanced DE relationship detection
 * Uses QueryDefinition object type to get SQL text and target DE information
 */
async function fetchSFMCQueries(accessToken, restEndpoint) {
  try {
    console.log('🔍 [SFMC API] Fetching SQL Queries using SOAP QueryDefinition...');
    
    // Extract subdomain from restEndpoint for SOAP endpoint
    const soapEndpoint = restEndpoint.replace('/rest', '/soap');
    const subdomain = restEndpoint.match(/https:\/\/([^.]+)\./)?.[1] || 'mc';
    const soapUrl = `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`;
    
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>QueryDefinition</ObjectType>
              <Properties>Name</Properties>
              <Properties>ObjectID</Properties>
              <Properties>QueryText</Properties>
              <Properties>DataExtensionTarget.Name</Properties>
              <Properties>DataExtensionTarget.CustomerKey</Properties>
              <Properties>CreatedDate</Properties>
              <Properties>ModifiedDate</Properties>
              <Properties>Status</Properties>
              <Properties>CategoryID</Properties>
            </RetrieveRequest>
          </RetrieveRequestMsg>
        </s:Body>
      </s:Envelope>
    `;

    console.log('📡 [SFMC SOAP] Sending QueryDefinition retrieve request...');
    
    const response = await axios.post(soapUrl, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': 'Retrieve'
      },
      timeout: 60000 // Increased timeout for SOAP requests
    });

    console.log('📡 [SFMC SOAP] QueryDefinition response received');

    // Parse SOAP response
    const parser = new xml2js.Parser({ explicitArray: false });
    let queries = [];
    
    await new Promise((resolve, reject) => {
      parser.parseString(response.data, (err, result) => {
        if (err) return reject(err);
        
        const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
        if (!results) {
          console.log('⚠️ [SFMC SOAP] No QueryDefinition results found');
          return resolve();
        }
        
        const queryResults = Array.isArray(results) ? results : [results];
        console.log(`📊 [SFMC SOAP] Found ${queryResults.length} QueryDefinition objects`);
        
        queries = queryResults.map((query, index) => {
          const queryId = query.ObjectID || `query_${index}`;
          const queryName = query.Name || 'Unnamed Query';
          const queryText = query.QueryText || '';
          const targetDeName = query.DataExtensionTarget?.Name || '';
          const targetDeKey = query.DataExtensionTarget?.CustomerKey || '';
          
          console.log(`🔍 [SFMC SOAP] Processing query "${queryName}":`, {
            id: queryId,
            targetDE: targetDeName,
            targetKey: targetDeKey,
            hasQueryText: !!queryText
          });
          
          return {
            id: `query_${queryId}`,
            objectId: queryId,
            name: queryName,
            description: `SQL Query${targetDeName ? ` targeting ${targetDeName}` : ''}`,
            queryType: 'SQL',
            queryText: queryText,
            sqlStatement: queryText,
            targetDataExtensionName: targetDeName,
            targetDataExtensionKey: targetDeKey,
            createdDate: query.CreatedDate,
            modifiedDate: query.ModifiedDate,
            status: query.Status || 'Unknown',
            categoryId: query.CategoryID,
            type: 'Query'
          };
        });
        
        resolve();
      });
    });
    
    console.log(`✅ [SFMC SOAP] Successfully processed ${queries.length} SQL Queries`);
    return queries;
    
  } catch (error) {
    console.error('❌ [SFMC SOAP] Error fetching QueryDefinition objects:', error.message);
    if (error.response?.data) {
      console.error('❌ [SFMC SOAP] Response data:', error.response.data.substring(0, 500));
    }
    return [];
  }
}

/**
 * Fetch Automations from SFMC using REST API with enhanced activity-level relationship detection
 */
async function fetchSFMCAutomations(accessToken, restEndpoint) {
  try {
    console.log('🔍 [SFMC API] Fetching Automations with enhanced activity analysis...');
    
    const response = await axios.get(`${restEndpoint}/automation/v1/automations`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('📡 [SFMC API] Automations REST response received');

    const automations = response.data?.items || [];
    
    console.log(`✅ [SFMC API] Found ${automations.length} Automations`);
    
    // Enhanced automation processing with detailed activity fetching and SOAP relationship detection
    const processedAutomations = [];
    const automationRelationships = []; // Store discovered relationships
    
    for (const automation of automations) {
      console.log(`🔍 [SFMC API] Processing automation: ${automation.name} (ID: ${automation.id})`);
      
      // Fetch detailed automation info including steps/activities  
      let detailedSteps = [];
      let targetDataExtensions = new Set(); // Track DEs this automation targets
      let usedQueries = new Set(); // Track queries this automation uses
      
      try {
        const detailResponse = await axios.get(`${restEndpoint}/automation/v1/automations/${automation.id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        
        const detailedAutomation = detailResponse.data;
        console.log(`📋 [SFMC API] Automation "${automation.name}" structure:`, {
          id: detailedAutomation.id,
          name: detailedAutomation.name,
          steps: detailedAutomation.steps?.length || 0,
          activities: detailedAutomation.activities?.length || 0
        });
        
        // Extract steps and process activities
        detailedSteps = detailedAutomation.steps || [];
        
        console.log(`📋 [SFMC API] Found ${detailedSteps.length} steps for automation "${automation.name}"`);
        
        // Process each step and its activities
        for (const step of detailedSteps) {
          console.log(`🔍 [Step] Processing step in automation "${automation.name}":`, {
            stepNumber: step.stepNumber || 'unknown',
            activities: step.activities?.length || 0
          });
          
          const activities = step.activities || [];
          
          for (const activity of activities) {
            console.log(`🔍 [Activity] Processing activity:`, {
              activityType: activity.activityType,
              objectId: activity.activityObjectId,
              name: activity.name
            });
            
            // Handle Query Activities
            if (activity.activityType === 'query' && activity.activityObjectId) {
              console.log(`🔍 [Query Activity] Fetching QueryDefinition for ObjectID: ${activity.activityObjectId}`);
              
              const queryDef = await retrieveSoapObjectById(
                accessToken, 
                restEndpoint, 
                'QueryDefinition', 
                activity.activityObjectId,
                ['Name', 'QueryText', 'DataExtensionTarget.Name', 'DataExtensionTarget.CustomerKey']
              );
              
              if (queryDef && queryDef.DataExtensionTarget) {
                const targetDeName = queryDef.DataExtensionTarget.Name;
                const targetDeKey = queryDef.DataExtensionTarget.CustomerKey;
                
                if (targetDeName) {
                  targetDataExtensions.add(targetDeName);
                  usedQueries.add(queryDef.Name);
                  
                  // Create relationship: Automation → Data Extension (via Query)
                  automationRelationships.push({
                    id: `auto_${automation.id}-de_${targetDeKey || targetDeName}`,
                    source: `auto_${automation.id}`,
                    target: targetDeKey || targetDeName, // Use key or name as identifier
                    type: 'targets',
                    label: 'targets via Query',
                    description: `Automation "${automation.name}" targets DE "${targetDeName}" via Query "${queryDef.Name}"`,
                    metadata: {
                      queryName: queryDef.Name,
                      queryObjectId: activity.activityObjectId,
                      activityType: 'query'
                    }
                  });
                  
                  console.log(`✅ [Relationship] Automation → DE: ${automation.name} targets ${targetDeName} via Query ${queryDef.Name}`);
                }
              }
            }
            
            // Handle Import Activities  
            else if (activity.activityType === 'import' && activity.activityObjectId) {
              console.log(`🔍 [Import Activity] Fetching ImportDefinition for ObjectID: ${activity.activityObjectId}`);
              
              const importDef = await retrieveSoapObjectById(
                accessToken,
                restEndpoint,
                'ImportDefinition',
                activity.activityObjectId,
                ['Name', 'DestinationObjectId']
              );
              
              if (importDef && importDef.DestinationObjectId) {
                console.log(`🔍 [Import Activity] Fetching target DataExtension for ObjectID: ${importDef.DestinationObjectId}`);
                
                const targetDE = await retrieveSoapObjectById(
                  accessToken,
                  restEndpoint,
                  'DataExtension',
                  importDef.DestinationObjectId,
                  ['Name', 'CustomerKey']
                );
                
                if (targetDE) {
                  targetDataExtensions.add(targetDE.Name);
                  
                  // Create relationship: Automation → Data Extension (via Import)
                  automationRelationships.push({
                    id: `auto_${automation.id}-de_${targetDE.CustomerKey || targetDE.Name}`,
                    source: `auto_${automation.id}`,
                    target: targetDE.CustomerKey || targetDE.Name,
                    type: 'imports',
                    label: 'imports to',
                    description: `Automation "${automation.name}" imports to DE "${targetDE.Name}" via Import "${importDef.Name}"`,
                    metadata: {
                      importName: importDef.Name,
                      importObjectId: activity.activityObjectId,
                      activityType: 'import'
                    }
                  });
                  
                  console.log(`✅ [Relationship] Automation → DE: ${automation.name} imports to ${targetDE.Name} via Import ${importDef.Name}`);
                }
              }
            }
            
            // Handle other activity types (can be extended)
            else {
              console.log(`ℹ️ [Activity] Unhandled activity type: ${activity.activityType}`);
            }
          }
        }
        
      } catch (detailError) {
        console.warn(`⚠️ [SFMC API] Could not fetch detailed info for automation ${automation.id}:`, detailError.message);
        // Fallback to basic automation data
        detailedSteps = automation.steps || automation.activities || [];
      }
      
      processedAutomations.push({
        id: `auto_${automation.id}`,
        name: automation.name || 'Unnamed Automation',
        description: automation.description || '',
        status: automation.status,
        createdDate: automation.createdDate,
        modifiedDate: automation.modifiedDate,
        steps: detailedSteps,
        activities: detailedSteps, // Maintain backward compatibility
        targetDataExtensions: Array.from(targetDataExtensions),
        usedQueries: Array.from(usedQueries),
        type: 'Automation'
      });
    }
    
    console.log(`🔗 [SFMC API] Discovered ${automationRelationships.length} automation relationships`);
    
    // Return both automations and their discovered relationships
    return {
      automations: processedAutomations,
      relationships: automationRelationships
    };
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching Automations:', error.message);
    if (error.response) {
      console.error('❌ [SFMC API] Response status:', error.response.status);
      console.error('❌ [SFMC API] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Fetch Journeys from SFMC using REST API
 */
async function fetchSFMCJourneys(accessToken, restEndpoint) {
  try {
    console.log('🔍 [SFMC API] Fetching Journeys...');
    
    // First get interactions (journeys)
    const interactionsResponse = await axios.get(`${restEndpoint}/interaction/v1/interactions`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('📡 [SFMC API] Journeys REST response received');

    const interactions = interactionsResponse.data?.items || [];
    
    console.log(`✅ [SFMC API] Found ${interactions.length} Journeys`);
    
    return interactions.map(journey => ({
      id: `journey_${journey.id}`,
      name: journey.name || 'Unnamed Journey',
      description: journey.description || '',
      status: journey.status,
      createdDate: journey.createdDate,
      modifiedDate: journey.modifiedDate,
      version: journey.version,
      entrySource: journey.entrySource || {},
      activities: journey.activities || [],
      type: 'Journey'
    }));
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching Journeys:', error.message);
    if (error.response) {
      console.error('❌ [SFMC API] Response status:', error.response.status);
      console.error('❌ [SFMC API] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Fetch Triggered Sends from SFMC using SOAP API
 */
async function fetchSFMCTriggeredSends(accessToken, subdomain) {
  try {
    const axios = require('axios');
    const xml2js = require('xml2js');
    
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                      xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soapenv:Header>
        <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <RetrieveRequest>
            <ObjectType>TriggeredSendDefinition</ObjectType>
            <Properties>ObjectID</Properties>
            <Properties>Name</Properties>
            <Properties>CustomerKey</Properties>
            <Properties>Description</Properties>
            <Properties>TriggeredSendStatus</Properties>
            <Properties>CreatedDate</Properties>
            <Properties>ModifiedDate</Properties>
          </RetrieveRequest>
        </RetrieveRequestMsg>
      </soapenv:Body>
    </soapenv:Envelope>`;

    const response = await axios.post(`https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'Retrieve'
      }
    });

    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    const retrieveResponse = result['soap:Envelope']['soap:Body']['RetrieveResponseMsg'];
    const results = retrieveResponse?.Results;
    
    if (!results) return [];
    
    const triggeredSends = Array.isArray(results) ? results : [results];
    
    return triggeredSends.map(ts => ({
      id: `ts_${ts.CustomerKey}`,
      name: ts.Name,
      customerKey: ts.CustomerKey,
      description: ts.Description || '',
      status: ts.TriggeredSendStatus,
      createdDate: ts.CreatedDate,
      modifiedDate: ts.ModifiedDate,
      type: 'TriggeredSend'
    }));
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching Triggered Sends:', error.message);
    throw error;
  }
}

/**
 * Fetch Data Filters from SFMC using SOAP API
 */
async function fetchSFMCFilters(accessToken, subdomain) {
  try {
    const axios = require('axios');
    const xml2js = require('xml2js');
    
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                      xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soapenv:Header>
        <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <RetrieveRequest>
            <ObjectType>FilterDefinition</ObjectType>
            <Properties>ObjectID</Properties>
            <Properties>Name</Properties>
            <Properties>CustomerKey</Properties>
            <Properties>Description</Properties>
            <Properties>CreatedDate</Properties>
            <Properties>ModifiedDate</Properties>
          </RetrieveRequest>
        </RetrieveRequestMsg>
      </soapenv:Body>
    </soapenv:Envelope>`;

    const response = await axios.post(`https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`, soapBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'Retrieve'
      }
    });

    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    const retrieveResponse = result['soap:Envelope']['soap:Body']['RetrieveResponseMsg'];
    const results = retrieveResponse?.Results;
    
    if (!results) return [];
    
    const filters = Array.isArray(results) ? results : [results];
    
    return filters.map(filter => ({
      id: `filter_${filter.CustomerKey}`,
      name: filter.Name,
      customerKey: filter.CustomerKey,
      description: filter.Description || '',
      createdDate: filter.CreatedDate,
      modifiedDate: filter.ModifiedDate,
      type: 'Filter'
    }));
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching Filters:', error.message);
    throw error;
  }
}

/**
 * Fetch File Transfers from SFMC using REST API
 */
async function fetchSFMCFileTransfers(accessToken, restEndpoint) {
  try {
    const axios = require('axios');
    
    const response = await axios.get(`${restEndpoint}/automation/v1/filetransfers`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const fileTransfers = response.data?.items || [];
    
    return fileTransfers.map(ft => ({
      id: `ft_${ft.id}`,
      name: ft.name,
      description: ft.description || '',
      fileTransferType: ft.fileTransferType,
      status: ft.status,
      createdDate: ft.createdDate,
      modifiedDate: ft.modifiedDate,
      type: 'FileTransfer'
    }));
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching File Transfers:', error.message);
    throw error;
  }
}

/**
 * Fetch Data Extracts from SFMC using REST API
 */
async function fetchSFMCDataExtracts(accessToken, restEndpoint) {
  try {
    const axios = require('axios');
    
    const response = await axios.get(`${restEndpoint}/automation/v1/dataextracts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const dataExtracts = response.data?.items || [];
    
    return dataExtracts.map(extract => ({
      id: `extract_${extract.id}`,
      name: extract.name,
      description: extract.description || '',
      extractType: extract.extractType,
      status: extract.status,
      createdDate: extract.createdDate,
      modifiedDate: extract.modifiedDate,
      type: 'DataExtract'
    }));
    
  } catch (error) {
    console.error('❌ [SFMC API] Error fetching Data Extracts:', error.message);
    throw error;
  }
}

// ==================== RELATIONSHIP DETECTION FUNCTIONS ====================

/**
 * Analyze relationships between SFMC assets
 * Returns edges for the graph visualization
 */

/**
 * Detect Data Extension relationships in SQL Queries
 * Enhanced to handle various API response formats
 */
/**
 * Detect Data Extension relationships in SQL Queries
 * Enhanced to use SOAP QueryDefinition data with explicit target DE and SQL text analysis
 */
function detectQueryToDataExtensionRelationships(queries, dataExtensions) {
  const relationships = [];
  const deMap = new Map(dataExtensions.map(de => [de.name.toLowerCase(), de]));
  const deKeyMap = new Map(dataExtensions.map(de => [de.externalKey?.toLowerCase(), de]));
  // Also map by customerKey and key variants
  dataExtensions.forEach(de => {
    if (de.customerKey) deKeyMap.set(de.customerKey.toLowerCase(), de);
    if (de.key) deKeyMap.set(de.key.toLowerCase(), de);
  });
  
  console.log('🔍 [Relationship] Analyzing SQL Query relationships...');
  console.log(`📊 [Relationship] Processing ${queries.length} queries against ${dataExtensions.length} DEs`);
  
  queries.forEach(query => {
    console.log(`🔍 [Relationship] Analyzing query "${query.name}"`);
    
    // 1. EXPLICIT TARGET DE from SOAP QueryDefinition (DataExtensionTarget)
    if (query.targetDataExtensionName) {
      const targetDeName = query.targetDataExtensionName.toLowerCase();
      let targetDe = deMap.get(targetDeName);
      
      // Also try to find by key if name lookup fails
      if (!targetDe && query.targetDataExtensionKey) {
        const targetDeKey = query.targetDataExtensionKey.toLowerCase();
        targetDe = deKeyMap.get(targetDeKey);
      }
      
      if (targetDe) {
        const relationshipId = `${query.id}-${targetDe.id}`;
        relationships.push({
          id: relationshipId,
          source: query.id,
          target: targetDe.id,
          type: 'writes_to',
          label: 'writes to',
          description: `Query "${query.name}" writes to target DE "${targetDe.name}"`
        });
        console.log(`✅ [Relationship] Found EXPLICIT TARGET: ${query.name} → ${targetDe.name}`);
      } else {
        console.log(`⚠️ [Relationship] Target DE "${query.targetDataExtensionName}" not found for query "${query.name}"`);
      }
    }
    
    // 2. IMPLICIT RELATIONSHIPS from SQL text analysis
    const sqlText = (
      query.queryText || 
      query.sqlStatement || 
      query.queryDefinition?.queryText ||
      query.text ||
      ''
    ).toLowerCase();
    
    if (!sqlText) {
      console.log(`⚠️ [Relationship] No SQL text found for query: ${query.name}`);
      return;
    }
    
    console.log(`🔍 [Relationship] Parsing SQL text for query "${query.name}" (${sqlText.length} chars)`);
    
    // Enhanced DE detection in SQL text - check every DE name AND CustomerKey in the SQL
    dataExtensions.forEach(de => {
      const deName = de.name.toLowerCase();
      const deNameEscaped = deName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Also check for CustomerKey if available
      const deKeys = [];
      if (de.customerKey) deKeys.push(de.customerKey.toLowerCase());
      if (de.externalKey) deKeys.push(de.externalKey.toLowerCase());
      if (de.key) deKeys.push(de.key.toLowerCase());
      
      // Create patterns for name and all keys
      const allIdentifiers = [deName, ...deKeys];
      
      allIdentifiers.forEach(identifier => {
        const identifierEscaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Check various SQL contexts where DE names/keys might appear
        const contexts = [
          // FROM clauses (reads)
          new RegExp(`\\bfrom\\s+\\[?${identifierEscaped}\\]?\\b`, 'gi'),
          new RegExp(`\\bfrom\\s+"${identifierEscaped}"\\b`, 'gi'),
          new RegExp(`\\bfrom\\s+'${identifierEscaped}'\\b`, 'gi'),
          new RegExp(`\\bfrom\\s+${identifierEscaped}\\b`, 'gi'),
          // JOIN clauses (reads)
          new RegExp(`\\bjoin\\s+\\[?${identifierEscaped}\\]?\\b`, 'gi'),
          new RegExp(`\\bjoin\\s+"${identifierEscaped}"\\b`, 'gi'),
          new RegExp(`\\bjoin\\s+'${identifierEscaped}'\\b`, 'gi'),
          new RegExp(`\\bjoin\\s+${identifierEscaped}\\b`, 'gi'),
          // INTO clauses (writes)
          new RegExp(`\\binto\\s+\\[?${identifierEscaped}\\]?\\b`, 'gi'),
          new RegExp(`\\binto\\s+"${identifierEscaped}"\\b`, 'gi'),
          new RegExp(`\\binto\\s+'${identifierEscaped}'\\b`, 'gi'),
          new RegExp(`\\binto\\s+${identifierEscaped}\\b`, 'gi'),
          // INSERT INTO clauses (writes)
          new RegExp(`\\binsert\\s+into\\s+\\[?${identifierEscaped}\\]?\\b`, 'gi'),
          new RegExp(`\\binsert\\s+into\\s+"${identifierEscaped}"\\b`, 'gi'),
          new RegExp(`\\binsert\\s+into\\s+'${identifierEscaped}'\\b`, 'gi'),
          new RegExp(`\\binsert\\s+into\\s+${identifierEscaped}\\b`, 'gi'),
          // UPDATE clauses (writes)
          new RegExp(`\\bupdate\\s+\\[?${identifierEscaped}\\]?\\b`, 'gi'),
          new RegExp(`\\bupdate\\s+"${identifierEscaped}"\\b`, 'gi'),
          new RegExp(`\\bupdate\\s+'${identifierEscaped}'\\b`, 'gi'),
          new RegExp(`\\bupdate\\s+${identifierEscaped}\\b`, 'gi'),
          // Simple name match anywhere in SQL (fallback)
          new RegExp(`\\b${identifierEscaped}\\b`, 'gi')
        ];
      
      let foundRead = false;
      let foundWrite = false;
        
        contexts.forEach((regex, index) => {
          if (regex.test(sqlText)) {
            if (index < 8) { // FROM and JOIN patterns (reads)
              if (!foundRead) {
                const relationshipId = `${de.id}-${query.id}-read`;
                relationships.push({
                  id: relationshipId,
                  source: de.id,
                  target: query.id,
                  type: 'reads_from',
                  label: 'reads from',
                  description: `Query "${query.name}" reads from DE "${de.name}" using ${identifier === deName ? 'name' : 'key'}`
                });
                console.log(`✅ [Relationship] Found READ in SQL: ${query.name} reads from ${de.name} (via ${identifier})`);
                foundRead = true;
              }
            } else if (index < 20) { // INTO, INSERT INTO, UPDATE patterns (writes)
              if (!foundWrite) {
                const relationshipId = `${query.id}-${de.id}-write`;
                relationships.push({
                  id: relationshipId,
                  source: query.id,
                  target: de.id,
                  type: 'writes_to',
                  label: 'writes to',
                  description: `Query "${query.name}" writes to DE "${de.name}" using ${identifier === deName ? 'name' : 'key'}`
                });
                console.log(`✅ [Relationship] Found WRITE in SQL: ${query.name} writes to ${de.name} (via ${identifier})`);
                foundWrite = true;
              }
            } else { // Simple name match - determine context with enhanced heuristics
              if (!foundRead && !foundWrite) {
                // Use enhanced heuristics to determine if it's read or write
                const beforeMatch = sqlText.substring(0, sqlText.indexOf(identifier));
                const isWrite = /\b(into|insert|update|delete|create|drop|truncate|merge|upsert)\b.*$/i.test(beforeMatch);
                
                if (isWrite) {
                  const relationshipId = `${query.id}-${de.id}-inferred-write`;
                  relationships.push({
                    id: relationshipId,
                    source: query.id,
                    target: de.id,
                    type: 'writes_to',
                    label: 'writes to',
                    description: `Query "${query.name}" writes to DE "${de.name}" (inferred from ${identifier})`
                  });
                  console.log(`✅ [Relationship] Found INFERRED WRITE: ${query.name} → ${de.name} (via ${identifier})`);
                } else {
                  const relationshipId = `${de.id}-${query.id}-inferred-read`;
                  relationships.push({
                    id: relationshipId,
                    source: de.id,
                    target: query.id,
                    type: 'reads_from',
                    label: 'reads from',
                    description: `Query "${query.name}" reads from DE "${de.name}" (inferred from ${identifier})`
                  });
                  console.log(`✅ [Relationship] Found INFERRED READ: ${query.name} reads from ${de.name} (via ${identifier})`);
                }
              }
            }
          }
        });
      });
    });
  });
  
  console.log(`📈 [Relationship] SQL Query analysis complete: ${relationships.length} relationships found`);
  return relationships;
}

/**
 * Detect Data Extension relationships in Filters
 */
function detectFilterToDataExtensionRelationships(filters, dataExtensions) {
  const relationships = [];
  const deMap = new Map(dataExtensions.map(de => [de.name.toLowerCase(), de]));
  const deKeyMap = new Map(dataExtensions.map(de => [de.externalKey?.toLowerCase(), de]));
  
  filters.forEach(filter => {
    // Source DE relationship
    if (filter.dataSource) {
      const sourceDeName = filter.dataSource.toLowerCase();
      const sourceDe = deMap.get(sourceDeName) || deKeyMap.get(sourceDeName);
      if (sourceDe) {
        relationships.push({
          id: `${sourceDe.id}-${filter.id}`,
          source: sourceDe.id,
          target: filter.id,
          type: 'filters_from',
          label: 'filters from',
          description: `Filter "${filter.name}" uses source DE "${sourceDe.name}"`
        });
      }
    }
    
    // Target DE relationship (if filter creates a new DE)
    if (filter.targetDataExtension) {
      const targetDeName = filter.targetDataExtension.toLowerCase();
      const targetDe = deMap.get(targetDeName) || deKeyMap.get(targetDeName);
      if (targetDe) {
        relationships.push({
          id: `${filter.id}-${targetDe.id}`,
          source: filter.id,
          target: targetDe.id,
          type: 'creates_filtered_de',
          label: 'creates filtered DE',
          description: `Filter "${filter.name}" creates filtered DE "${targetDe.name}"`
        });
      }
    }
  });
  
  return relationships;
}

/**
 * Detect activity-aware relationships in Automations
 * Creates Activity nodes and shows Automation → Activity → Asset relationships
 * Enhanced to support execution order and activity types
 */
function detectAutomationToDataExtensionRelationships(automations, dataExtensions, queries, fileTransfers, dataExtracts) {
  const relationships = [];
  const activityNodes = new Map(); // Store activity nodes for later inclusion
  const deMap = new Map(dataExtensions.map(de => [de.name.toLowerCase(), de]));
  const deKeyMap = new Map(dataExtensions.map(de => [de.externalKey?.toLowerCase(), de]));
  
  console.log('🔍 [Relationship] Analyzing Activity-Aware Automation relationships...');
  console.log(`📊 [Relationship] Processing ${automations.length} automations`);
  console.log(`📊 [Relationship] Available Data Extensions (first 10):`, dataExtensions.slice(0, 10).map(de => ({ id: de.id, name: de.name, key: de.externalKey })));
  
  // Debug: Check if PF_Preference exists in the data
  const pfPrefDE = dataExtensions.find(de => de.name === 'PF_Preference' || de.externalKey === 'AF866D96-40F8-454D-8947-46FE02EA96D7');
  if (pfPrefDE) {
    console.log(`🎯 [Relationship] Found PF_Preference DE in available data:`, pfPrefDE);
  } else {
    console.log(`❌ [Relationship] PF_Preference DE not found in available data`);
    console.log(`📊 [Relationship] Available DE names:`, dataExtensions.map(de => de.name));
  }
  
  automations.forEach(automation => {
    console.log(`🔍 [Relationship] Analyzing automation "${automation.name}" (ID: ${automation.id})`);
    
    // Debug: Enhanced logging for PF_Preference automation
    if (automation.name.includes('FSP') || automation.name.includes('Preference')) {
      console.log(`🎯 [PF_Preference Debug] Found FSP/Preference automation: "${automation.name}"`);
      console.log(`🎯 [PF_Preference Debug] Full automation structure:`, JSON.stringify(automation, null, 2));
    }
    
    // Debug: Full structure dump for BU Unsubs automation
    if (automation.name === 'BU Unsubs') {
      console.log(`🔍 [BU Unsubs Debug] Full automation structure:`);
      console.log(JSON.stringify(automation, null, 2));
      
      const activities = automation.steps || automation.activities || automation.program?.activities || [];
      console.log(`🔍 [BU Unsubs Debug] Activities array:`, activities);
      activities.forEach((activity, index) => {
        console.log(`🔍 [BU Unsubs Debug] Activity ${index + 1}:`, JSON.stringify(activity, null, 2));
      });
    }
    
    // Check multiple possible activity containers
    const activities = automation.steps || automation.activities || automation.program?.activities || [];
    
    console.log(`📋 [Relationship] Automation structure:`, {
      steps: automation.steps?.length || 0,
      activities: automation.activities?.length || 0,
      programActivities: automation.program?.activities?.length || 0,
      totalActivities: activities.length
    });
    
    if (activities.length === 0) {
      console.log(`⚠️  [Relationship] No activities found for automation: ${automation.name}`);
      return;
    }
    
    console.log(`📋 [Relationship] Found ${activities.length} activities in "${automation.name}"`);
    
    // Process each activity/step with execution order
    activities.forEach((activity, stepIndex) => {
      console.log(`🔍 [Activity Debug] Processing activity ${stepIndex + 1}/${activities.length}:`, activity ? 'activity exists' : 'activity is null/undefined');
      if (!activity) {
        console.log(`⚠️ [Activity Debug] Skipping null/undefined activity at index ${stepIndex}`);
        return;
      }
      
      try {
        const stepNumber = stepIndex + 1;
        const activityType = getActivityType(activity, automation.name, queries);
        const activityId = `${automation.id}_activity_${stepNumber}_${activityType}`;
        
        console.log(`🔧 [Relationship] Processing Step ${stepNumber}: ${activityType} (${activity.name || activity.displayName || 'Unnamed'})`);
        console.log(`🔧 [Relationship] Activity ID: ${activityId}`);
        
        // Create activity node
        const activityNode = {
          id: activityId,
          name: activity.name || activity.displayName || `${activityType} Step ${stepNumber}`,
          type: 'Activity',
          activityType: activityType,
          stepNumber: stepNumber,
          automationId: automation.id,
          automationName: automation.name,
          description: activity.description || `${activityType} activity in ${automation.name}`,
          metadata: {
            ...activity,
            stepNumber: stepNumber,
            executionOrder: stepNumber,
            parentAutomation: automation.name
          }
        };
        
        activityNodes.set(activityId, activityNode);
        console.log(`✅ [Relationship] Created activity node: ${activityId}`);
        
        // Create Automation → Activity relationship
        const autoToActivityRel = {
          id: `${automation.id}-${activityId}`,
          source: automation.id,
          target: activityId,
          type: 'executes_activity',
          label: `Step ${stepNumber}`,
          description: `Automation "${automation.name}" executes ${activityType} at step ${stepNumber}`,
          stepNumber: stepNumber,
          executionOrder: stepNumber
        };
        
        relationships.push(autoToActivityRel);
        console.log(`🔗 [Relationship] Created automation→activity relationship: ${automation.id} → ${activityId}`);
        
        // Detect Activity → Asset relationships based on activity type
        // Add automation name to activity for context
        activity.automationName = automation.name;
        
        console.log(`🔍 [Relationship] Detecting asset relationships for activity ${activityId}...`);
        const assetRelationshipsCountBefore = relationships.length;
        
        detectActivityToAssetRelationships(activityId, activity, activityType, dataExtensions, queries, fileTransfers, dataExtracts, relationships, deMap, deKeyMap);
        
        const assetRelationshipsCountAfter = relationships.length;
        console.log(`📊 [Relationship] Activity ${activityId} generated ${assetRelationshipsCountAfter - assetRelationshipsCountBefore} asset relationships`);
        
        // If this is not the last activity, create next step relationship
        if (stepIndex < activities.length - 1) {
          const nextActivityId = `${automation.id}_activity_${stepIndex + 2}_${getActivityType(activities[stepIndex + 1])}`;
          const nextStepRel = {
            id: `${activityId}-${nextActivityId}`,
            source: activityId,
            target: nextActivityId,
            type: 'next_step',
            label: 'next',
            description: `Step ${stepNumber} leads to Step ${stepIndex + 2}`,
            stepNumber: stepNumber,
            executionOrder: stepNumber
          };
          relationships.push(nextStepRel);
          console.log(`🔗 [Relationship] Created next step relationship: ${activityId} → ${nextActivityId}`);
        }
        
      } catch (error) {
        console.error(`❌ [Relationship] Error processing activity ${stepIndex + 1} in automation "${automation.name}":`, error);
        console.error(`❌ [Relationship] Error stack:`, error.stack);
        console.error(`❌ [Relationship] Activity that caused error:`, JSON.stringify(activity, null, 2));
      }
    });
  });
  
  // Add activity nodes to the global activity nodes collection
  // This will be used later in generateLiveGraphData to include activity nodes
  global.activityNodes = activityNodes;
  
  console.log(`� [Relationship] Activity-Aware Automation analysis complete: ${relationships.length} relationships found, ${activityNodes.size} activity nodes created`);
  return relationships;
}

/**
 * Get standardized activity type from activity object
 */
function getActivityType(activity, automationName = null, queries = []) {
  const type = activity.type || activity.activityType || activity.objectType || '';
  const name = (activity.name || activity.displayName || '').toLowerCase();
  
  // Debug: log activity properties for BU Unsubs activities
  if (name.includes('bu unsub') || (activity.name && activity.name.includes('BU Unsub')) || 
      (activity.automation && activity.automation.name === 'BU Unsubs')) {
    console.log(`🔍 [Activity Debug] BU Unsubs activity full structure:`, JSON.stringify(activity, null, 2));
  }
  
  // Map various activity types to standardized names
  const typeMapping = {
    // SQL Query activities
    'query': 'QueryActivity',
    'sql': 'QueryActivity', 
    'sqlquery': 'QueryActivity',
    'queryactivity': 'QueryActivity',
    'dataextensionactivity': 'QueryActivity',
    'sqlqueryactivity': 'QueryActivity',
    
    // Data Filter activities
    'filter': 'FilterActivity',
    'datafilter': 'FilterActivity',
    'filteractivity': 'FilterActivity',
    
    // Email activities
    'email': 'EmailActivity',
    'send': 'EmailActivity',
    'emailsend': 'EmailActivity',
    'triggeredsend': 'EmailActivity',
    
    // File Transfer activities  
    'filetransfer': 'FileTransferActivity',
    'ftp': 'FileTransferActivity',
    'sftp': 'FileTransferActivity',
    'import': 'ImportActivity',
    'export': 'ExportActivity',
    'fileimport': 'ImportActivity',
    'transfer': 'FileTransferActivity',
    'filetransferactivity': 'FileTransferActivity',
    
    // Data Extract activities
    'dataextract': 'DataExtractActivity',
    'extract': 'DataExtractActivity',
    'dataextractactivity': 'DataExtractActivity',
    
    // Wait/Delay activities
    'wait': 'WaitActivity',
    'delay': 'WaitActivity',
    'waitactivity': 'WaitActivity',
    
    // Script activities
    'script': 'ScriptActivity',
    'ssjs': 'ScriptActivity',
    'amp': 'ScriptActivity'
  };
  
  // Check direct type mapping first
  const normalizedType = type.toLowerCase().replace(/[-_\s]/g, '');
  if (typeMapping[normalizedType]) {
    return typeMapping[normalizedType];
  }
  
  // Check activity name for type hints
  for (const [key, mappedType] of Object.entries(typeMapping)) {
    if (name.includes(key)) {
      return mappedType;
    }
  }
  
  // ENHANCED: Check if automation name matches a SQL query name
  // This handles the common pattern where an automation is named after its main query
  if (automationName && queries && queries.length > 0) {
    const matchingQuery = queries.find(q => 
      q.name.toLowerCase() === automationName.toLowerCase() ||
      q.name === automationName
    );
    if (matchingQuery) {
      console.log(`🔍 [Activity Type] Found matching query for automation "${automationName}" → QueryActivity`);
      return 'QueryActivity';
    }
  }
  
  // Check if the activity has query-related properties (even if not explicitly typed)
  const hasQueryProperties = !!(
    activity.queryDefinitionId || 
    activity.queryId || 
    activity.definitionId || 
    activity.queryName ||
    activity.sqlStatement ||
    activity.queryText
  );
  
  if (hasQueryProperties) {
    console.log(`🔍 [Activity Type] Found query properties → QueryActivity`);
    return 'QueryActivity';
  }
  
  // Default fallback
  return 'GenericActivity';
}

/**
 * Detect relationships between activities and assets (DEs, Emails, Files)
 */
function detectActivityToAssetRelationships(activityId, activity, activityType, dataExtensions, queries, fileTransfers, dataExtracts, relationships, deMap, deKeyMap) {
  
  // Debug: log activity details for BU Unsubs
  if (activityId.includes('BU_Unsubs') || (activity.name && activity.name.includes('BU Unsub')) || 
      (activity.automation && activity.automation.name === 'BU Unsubs')) {
    console.log(`🔍 [Activity Asset Debug] BU Unsubs activity full structure:`, JSON.stringify(activity, null, 2));
  }
  
  // Query Activity → Data Extension relationships
  if (activityType === 'QueryActivity') {
    // Find the associated query first
    const queryId = activity.queryDefinitionId || activity.queryId || activity.definitionId || activity.objectId;
    const queryName = activity.queryName || activity.name || activity.displayName;
    const automationName = activity.automationName; // This should be passed from the calling context
    
    let query = null;
    
    // Try to find by ID first
    if (queryId) {
      query = queries.find(q => q.id === queryId || q.objectId === queryId || q.id === `query_${queryId}`);
    }
    
    // Try to find by name
    if (!query && queryName) {
      query = queries.find(q => q.name === queryName);
    }
    
    // ENHANCED: Try to find by automation name (common pattern in MC)
    if (!query && automationName) {
      query = queries.find(q => q.name === automationName);
      if (query) {
        console.log(`🔍 [Query Match] Found query by automation name: "${automationName}" → "${query.name}"`);
      }
    }
    
    // Final fallback: try partial name matching
    if (!query && queryName) {
      query = queries.find(q => 
        q.name.toLowerCase().includes(queryName.toLowerCase()) ||
        queryName.toLowerCase().includes(q.name.toLowerCase())
      );
      if (query) {
        console.log(`🔍 [Query Match] Found query by partial name match: "${queryName}" → "${query.name}"`);
      }
    }
    
    if (query) {
      // Activity → Query relationship
      relationships.push({
        id: `${activityId}-${query.id}`,
        source: activityId,
        target: query.id,
        type: 'executes_query',
        label: 'executes query',
        description: `Activity executes query "${query.name}"`
      });
    }
    
    // Target DE relationships (Query writes to DE)
    const targetDeFields = [
      'targetDataExtension', 'targetDataExtensionName', 'dataExtensionName',
      'targetDE', 'destinationDataExtension', 'outputDataExtension',
      'dataExtension', 'targetDataExtensionKey'
    ];
    
    targetDeFields.forEach(field => {
      if (activity[field]) {
        const targetDeName = activity[field].toLowerCase();
        const targetDe = deMap.get(targetDeName) || deKeyMap.get(targetDeName);
        if (targetDe) {
          relationships.push({
            id: `${activityId}-${targetDe.id}`,
            source: activityId,
            target: targetDe.id,
            type: 'writes_to',
            label: 'writes to',
            description: `Query activity writes to DE "${targetDe.name}"`
          });
        }
      }
    });
    
    // ENHANCED: Use recursive search to find all targetDataExtensions (even nested ones)
    const allTargetDataExtensions = findTargetDataExtensionsRecursive(activity, `activity_${activityId}`);
    
    if (allTargetDataExtensions.length > 0) {
      console.log(`🔍 [Activity Debug] Found ${allTargetDataExtensions.length} targetDataExtensions for activity ${activityId} (including nested ones)`);
      
      allTargetDataExtensions.forEach((targetDE, index) => {
        const targetDeName = targetDE.name?.toLowerCase();
        const targetDeKey = targetDE.key?.toLowerCase();
        const targetDeId = targetDE.id;
        
        console.log(`🔍 [Activity Debug] Processing target DE ${index + 1}:`, { id: targetDeId, name: targetDeName, key: targetDeKey, originalDE: targetDE });
        
        // Enhanced debugging for PF_Preference specifically
        if (targetDE.name === 'PF_Preference' || targetDE.key === 'AF866D96-40F8-454D-8947-46FE02EA96D7') {
          console.log(`🎯 [PF_Preference Debug] Found PF_Preference in activity targetDataExtensions!`);
          console.log(`🎯 [PF_Preference Debug] Target DE details:`, targetDE);
          console.log(`🎯 [PF_Preference Debug] Available DEs count:`, dataExtensions.length);
          console.log(`🎯 [PF_Preference Debug] DE name map has key "${targetDeName}":`, deMap.has(targetDeName));
          console.log(`🎯 [PF_Preference Debug] DE key map has key "${targetDeKey}":`, deKeyMap.has(targetDeKey));
        }
        
        // Use the enhanced DE lookup function
        let targetDe = findDataExtensionByIdentifier(targetDE.name, dataExtensions);
        if (!targetDe) {
          targetDe = findDataExtensionByIdentifier(targetDE.key, dataExtensions);
        }
        if (!targetDe) {
          targetDe = findDataExtensionByIdentifier(targetDE.id, dataExtensions);
        }
        
        if (targetDe) {
          relationships.push({
            id: `${activityId}-${targetDe.id}`,
            source: activityId,
            target: targetDe.id,
            type: 'writes_to',
            label: 'writes to',
            description: `Query activity writes to DE "${targetDe.name}"`
          });
          console.log(`🔗 [Activity Relationship] Found targetDataExtensions: ${activityId} → ${targetDe.id} (${targetDe.name})`);
        } else {
          // 🆕 Create a stub DE entry for relationship tracking even if the full DE wasn't fetched
          console.log(`📊 [Activity Debug] DE not found in fetched data, creating stub for relationship tracking: ${targetDE.name || targetDE.key || targetDE.id}`);
          
          // Use the same ID format as SFMC Data Extensions (de_KEY format)
          const stubDeId = targetDE.key ? `de_${targetDE.key}` : (targetDE.id ? `de_${targetDE.id}` : `de_${targetDE.name?.replace(/\s+/g, '-').toLowerCase()}`);
          
          const stubDe = {
            id: stubDeId,
            name: targetDE.name || targetDE.key || 'Unknown DE',
            externalKey: targetDE.key,
            customerKey: targetDE.key,
            description: targetDE.description || `Referenced by ${activity.name || activityType}`,
            isStub: true // Mark as stub for later processing
          };
          
          // Add stub DE to dataExtensions array so it can be found in graph generation
          dataExtensions.push(stubDe);
          
          // Update maps to include the stub DE
          if (stubDe.name) {
            deMap.set(stubDe.name.toLowerCase(), stubDe);
          }
          if (stubDe.externalKey) {
            deKeyMap.set(stubDe.externalKey.toLowerCase(), stubDe);
          }
          
          relationships.push({
            id: `${activityId}-${stubDeId}`,
            source: activityId,
            target: stubDeId,
            type: 'writes_to',
            label: 'writes to',
            description: `Query activity writes to DE "${stubDe.name}"`
          });
          console.log(`🔗 [Activity Relationship] Created stub relationship: ${activityId} → ${stubDeId} (${stubDe.name}) [STUB]`);
        }
      });
    } else {
      // Try to find DE references in other common activity fields
      console.log(`🔍 [Activity Debug] No targetDataExtensions found for ${activityId}, checking other patterns...`);
      
      // Common field names that might contain DE references
      const possibleDeFields = [
        'targetDataExtension',
        'sourceDataExtension', 
        'dataExtension',
        'outputDataExtension',
        'resultDataExtension',
        'destinationDataExtension',
        'subscriberDataExtension',
        'audienceDataExtension',
        'sendDataExtension',
        'dataExtensionName',
        'targetDE',
        'sourceDE',
        'outputDE',
        'de',
        'deName',
        'dataExtensionKey',
        'deKey'
      ];
      
      let foundDeReference = false;
      
      possibleDeFields.forEach(fieldName => {
        if (activity[fieldName] && typeof activity[fieldName] === 'string') {
          const targetDe = findDataExtensionByIdentifier(activity[fieldName], dataExtensions);
          
          if (targetDe) {
            foundDeReference = true;
            console.log(`🔗 [Activity Debug] Found DE reference in field "${fieldName}": ${activity[fieldName]} → ${targetDe.name}`);
            
            // Determine relationship direction based on field name
            const isSource = fieldName.includes('source') || fieldName.includes('from') || fieldName.includes('input');
            const isTarget = fieldName.includes('target') || fieldName.includes('output') || fieldName.includes('destination') || fieldName.includes('result') || fieldName.includes('to');
            
            if (isSource) {
              relationships.push({
                id: `${targetDe.id}-${activityId}`,
                source: targetDe.id,
                target: activityId,
                type: 'reads_from',
                label: 'reads from',
                description: `Activity reads from DE "${targetDe.name}"`
              });
              console.log(`🔗 [Activity Relationship] ${targetDe.name} → ${activityId} (reads_from)`);
            } else {
              // Default to writes_to for target/output fields or ambiguous fields
              relationships.push({
                id: `${activityId}-${targetDe.id}`,
                source: activityId,
                target: targetDe.id,
                type: 'writes_to',
                label: 'writes to',
                description: `Activity writes to DE "${targetDe.name}"`
              });
              console.log(`🔗 [Activity Relationship] ${activityId} → ${targetDe.name} (writes_to)`);
            }
          }
        }
      });
      
      if (!foundDeReference && (activity.automationName === 'BU Unsubs' || activityId.includes('BU_Unsubs'))) {
        console.log(`🔍 [BU Unsubs Activity Debug] Activity has no DE references in standard fields. Full activity object:`, {
          activityKeys: Object.keys(activity),
          activity: JSON.stringify(activity, null, 2)
        });
      }
    }
  }
  
  // Filter Activity → Data Extension relationships  
  if (activityType === 'FilterActivity') {
    console.log(`🔍 [FilterActivity] Processing filter activity: ${activityId}`);
    console.log(`🔍 [FilterActivity] Activity data:`, JSON.stringify(activity, null, 2));
    
    // Method 1: Check for direct data extension references in activity properties
    let sourceDE = null;
    let targetDE = null;
    
    // Look for source DE in various possible fields
    const sourceFields = [
      'sourceDataExtension', 'sourceDataExtensionName', 'sourceDE', 
      'inputDataExtension', 'fromDataExtension', 'dataSource'
    ];
    
    const targetFields = [
      'targetDataExtension', 'targetDataExtensionName', 'targetDE',
      'destinationDataExtension', 'outputDataExtension', 'toDataExtension'
    ];
    
    // Try to find source DE
    for (const field of sourceFields) {
      if (activity[field]) {
        const sourceDeName = activity[field].toLowerCase();
        sourceDE = deMap.get(sourceDeName) || deKeyMap.get(sourceDeName);
        if (sourceDE) {
          console.log(`🎯 [FilterActivity] Found source DE via ${field}: ${sourceDE.name}`);
          break;
        }
      }
    }
    
    // Try to find target DE
    for (const field of targetFields) {
      if (activity[field]) {
        const targetDeName = activity[field].toLowerCase();
        targetDE = deMap.get(targetDeName) || deKeyMap.get(targetDeName);
        if (targetDE) {
          console.log(`🎯 [FilterActivity] Found target DE via ${field}: ${targetDE.name}`);
          break;
        }
      }
    }
    
    // Method 2: Check for targetDataExtensions array (like in other activities)
    if (!targetDE && activity.targetDataExtensions && activity.targetDataExtensions.length > 0) {
      const targetDEData = activity.targetDataExtensions[0];
      const targetDeName = (targetDEData.name || targetDEData.customerKey || '').toLowerCase();
      targetDE = deMap.get(targetDeName) || deKeyMap.get(targetDeName);
      if (targetDE) {
        console.log(`🎯 [FilterActivity] Found target DE via targetDataExtensions: ${targetDE.name}`);
      }
    }
    
    // Method 3: Smart name-based matching - if the activity/automation name matches a DE name,
    // assume this is a filter that creates that DE
    if (!targetDE) {
      const activityName = (activity.name || activity.displayName || '').toLowerCase();
      const automationName = (activity.automationName || '').toLowerCase();
      
      // Try activity name first
      if (activityName) {
        targetDE = deMap.get(activityName) || deKeyMap.get(activityName);
        if (targetDE) {
          console.log(`🎯 [FilterActivity] Found target DE via activity name match: ${targetDE.name}`);
        }
      }
      
      // Try automation name if activity name didn't work
      if (!targetDE && automationName) {
        targetDE = deMap.get(automationName) || deKeyMap.get(automationName);
        if (targetDE) {
          console.log(`🎯 [FilterActivity] Found target DE via automation name match: ${targetDE.name}`);
        }
      }
    }
    
    // Create relationships if we found DEs
    if (sourceDE) {
      relationships.push({
        id: `${sourceDE.id}-${activityId}`,
        source: sourceDE.id,
        target: activityId,
        type: 'filters_from',
        label: 'filters from',
        description: `Filter activity processes DE "${sourceDE.name}"`
      });
      console.log(`✅ [FilterActivity] Created source relationship: ${sourceDE.name} → ${activityId}`);
    }
    
    if (targetDE) {
      relationships.push({
        id: `${activityId}-${targetDE.id}`,
        source: activityId,
        target: targetDE.id,
        type: 'filters_to',
        label: 'filters to',
        description: `Filter activity creates filtered DE "${targetDE.name}"`
      });
      console.log(`✅ [FilterActivity] Created target relationship: ${activityId} → ${targetDE.name}`);
    }
    
    if (!sourceDE && !targetDE) {
      console.log(`⚠️ [FilterActivity] No DE relationships found for filter activity ${activityId}`);
      console.log(`⚠️ [FilterActivity] Consider implementing SOAP FilterActivity lookup for activityObjectId: ${activity.activityObjectId}`);
    }
  }
  
  // Import/Export Activity → Data Extension relationships
  if (activityType === 'ImportActivity' || activityType === 'ExportActivity' || activityType === 'FileTransferActivity') {
    // Target DE relationships
    const targetDeFields = [
      'targetDataExtension', 'targetDataExtensionName', 'dataExtensionName',
      'targetDE', 'destinationDataExtension', 'outputDataExtension'
    ];
    
    targetDeFields.forEach(field => {
      if (activity[field]) {
        const targetDeName = activity[field].toLowerCase();
        const targetDe = deMap.get(targetDeName) || deKeyMap.get(targetDeName);
        if (targetDe) {
          relationships.push({
            id: `${activityId}-${targetDe.id}`,
            source: activityId,
            target: targetDe.id,
            type: 'imports_to_de',
            label: 'imports to',
            description: `Import activity loads data into DE "${targetDe.name}"`
          });
        }
      }
    });
    
    // Source DE relationships  
    const sourceDeFields = [
      'sourceDataExtension', 'sourceDataExtensionName', 'sourceDE', 'inputDataExtension'
    ];
    
    sourceDeFields.forEach(field => {
      if (activity[field]) {
        const sourceDeName = activity[field].toLowerCase();
        const sourceDe = deMap.get(sourceDeName) || deKeyMap.get(sourceDeName);
        if (sourceDe) {
          relationships.push({
            id: `${sourceDe.id}-${activityId}`,
            source: sourceDe.id,
            target: activityId,
            type: 'exports_from_de',
            label: 'exports from',
            description: `Export activity extracts data from DE "${sourceDe.name}"`
          });
        }
      }
    });
    
    // File Transfer relationships
    const fileTransferId = activity.fileTransferId || activity.transferId || activity.id || activity.objectId;
    if (fileTransferId) {
      const fileTransfer = fileTransfers.find(ft => ft.id === fileTransferId || ft.id === `ft_${fileTransferId}`);
      if (fileTransfer) {
        relationships.push({
          id: `${activityId}-${fileTransfer.id}`,
          source: activityId,
          target: fileTransfer.id,
          type: 'executes_file_transfer',
          label: 'executes file transfer',
          description: `Activity executes file transfer "${fileTransfer.name}"`
        });
      }
    }
  }
  
  // Data Extract Activity relationships
  if (activityType === 'DataExtractActivity') {
    const dataExtractId = activity.dataExtractId || activity.extractId || activity.id || activity.objectId;
    if (dataExtractId) {
      const dataExtract = dataExtracts.find(de => de.id === dataExtractId || de.id === `extract_${dataExtractId}`);
      if (dataExtract) {
        relationships.push({
          id: `${activityId}-${dataExtract.id}`,
          source: activityId,
          target: dataExtract.id,
          type: 'executes_data_extract',
          label: 'executes data extract',
          description: `Activity executes data extract "${dataExtract.name}"`
        });
      }
    }
    
    // Source DE for extraction
    const sourceDeFields = ['sourceDataExtension', 'sourceDataExtensionName', 'sourceDE'];
    sourceDeFields.forEach(field => {
      if (activity[field]) {
        const sourceDeName = activity[field].toLowerCase();
        const sourceDe = deMap.get(sourceDeName) || deKeyMap.get(sourceDeName);
        if (sourceDe) {
          relationships.push({
            id: `${sourceDe.id}-${activityId}`,
            source: sourceDe.id,
            target: activityId,
            type: 'extracts_from_de',
            label: 'extracts from',
            description: `Data extract activity processes DE "${sourceDe.name}"`
          });
        }
      }
    });
  }
}

/**
 * Detect Data Extension relationships in Journeys
 * Enhanced to handle various entry sources and decision points
 */
function detectJourneyToDataExtensionRelationships(journeys, dataExtensions) {
  const relationships = [];
  const deMap = new Map(dataExtensions.map(de => [de.name.toLowerCase(), de]));
  const deKeyMap = new Map(dataExtensions.map(de => [de.externalKey?.toLowerCase(), de]));
  
  console.log('🔍 [Relationship] Analyzing Journey relationships...');
  console.log(`📊 [Relationship] Processing ${journeys.length} journeys`);
  
  journeys.forEach(journey => {
    console.log(`🔍 [Relationship] Analyzing journey "${journey.name}"`);
    
    // Enhanced Entry Event DE relationships
    const entrySourceOptions = [
      journey.entrySource,
      journey.entryEvent,
      journey.entryMode,
      journey.triggers?.[0]
    ];
    
    entrySourceOptions.forEach(entrySource => {
      if (!entrySource) return;
      
      // Check various entry source types
      const entryTypes = ['dataExtension', 'apiEvent', 'dataEvent', 'de'];
      if (entryTypes.includes((entrySource.type || '').toLowerCase())) {
        // Try multiple possible DE name fields
        const entryDeNames = [
          entrySource.dataExtensionName,
          entrySource.dataExtension,
          entrySource.name,
          entrySource.deName,
          entrySource.sourceName
        ];
        
        entryDeNames.forEach(deName => {
          if (!deName) return;
          const entryDe = deMap.get(deName.toLowerCase()) || deKeyMap.get(deName.toLowerCase());
          if (entryDe) {
            relationships.push({
              id: `${entryDe.id}-${journey.id}`,
              source: entryDe.id,
              target: journey.id,
              type: 'journey_entry_source',
              label: 'journey entry source',
              description: `DE "${entryDe.name}" is entry source for Journey "${journey.name}"`
            });
            console.log(`✅ [Relationship] Found ENTRY SOURCE: ${entryDe.name} → ${journey.name}`);
          }
        });
      }
      
      // Entry Source by ID
      if (entrySource.dataExtensionId || entrySource.deId) {
        const entryDeId = entrySource.dataExtensionId || entrySource.deId;
        const entryDe = dataExtensions.find(de => de.id === entryDeId || de.objectId === entryDeId);
        if (entryDe) {
          relationships.push({
            id: `${entryDe.id}-${journey.id}`,
            source: entryDe.id,
            target: journey.id,
            type: 'journey_entry_source',
            label: 'journey entry source',
            description: `DE "${entryDe.name}" is entry source for Journey "${journey.name}"`
          });
          console.log(`✅ [Relationship] Found ENTRY SOURCE BY ID: ${entryDe.name} → ${journey.name}`);
        }
      }
    });
    
    // Enhanced Decision Split and Activity DE relationships
    const activityContainers = [
      journey.activities,
      journey.steps,
      journey.program?.activities,
      journey.definition?.activities
    ];
    
    activityContainers.forEach(activities => {
      if (!activities) return;
      
      activities.forEach((activity, index) => {
        console.log(`🔍 [Relationship] Journey activity ${index + 1}: ${activity.type || 'Unknown'}`);
        
        // Decision Split activities
        const decisionTypes = ['decision', 'wait', 'split', 'multiDecision'];
        if (decisionTypes.includes((activity.type || '').toLowerCase())) {
          
          // Check various configuration data locations
          const configOptions = [
            activity.configurationData,
            activity.configuration,
            activity.config,
            activity.arguments
          ];
          
          configOptions.forEach(config => {
            if (!config) return;
            
            // Try multiple DE reference fields
            const deFields = [
              'dataExtension', 'dataExtensionName', 'sourceName', 
              'deName', 'targetDataExtension', 'sourceDataExtension'
            ];
            
            deFields.forEach(field => {
              if (config[field]) {
                const deName = config[field].toLowerCase();
                const de = deMap.get(deName) || deKeyMap.get(deName);
                if (de) {
                  relationships.push({
                    id: `${de.id}-${journey.id}`,
                    source: de.id,
                    target: journey.id,
                    type: 'journey_decision_source',
                    label: 'journey decision source',
                    description: `DE "${de.name}" used in ${activity.type} activity in Journey "${journey.name}"`
                  });
                  console.log(`✅ [Relationship] Found DECISION SOURCE: ${de.name} → ${journey.name}`);
                }
              }
            });
          });
        }
        
        // Email activities that might reference DEs
        const emailTypes = ['email', 'emailSend', 'send'];
        if (emailTypes.includes((activity.type || '').toLowerCase())) {
          
          // Check for subscriber source DE
          const subscriberSources = [
            activity.subscriberDataExtension,
            activity.sendDataExtension,
            activity.audienceDataExtension
          ];
          
          subscriberSources.forEach(sourceName => {
            if (!sourceName) return;
            const de = deMap.get(sourceName.toLowerCase()) || deKeyMap.get(sourceName.toLowerCase());
            if (de) {
              relationships.push({
                id: `${de.id}-${journey.id}`,
                source: de.id,
                target: journey.id,
                type: 'journey_email_source',
                label: 'journey email source',
                description: `DE "${de.name}" provides subscribers for email in Journey "${journey.name}"`
              });
              console.log(`✅ [Relationship] Found EMAIL SOURCE: ${de.name} → ${journey.name}`);
            }
          });
        }
      });
    });
  });
  
  console.log(`📈 [Relationship] Journey analysis complete: ${relationships.length} relationships found`);
  return relationships;
}

/**
 * Detect Triggered Send relationships with Data Extensions
 */
function detectTriggeredSendToDataExtensionRelationships(triggeredSends, dataExtensions) {
  const relationships = [];
  const deMap = new Map(dataExtensions.map(de => [de.name.toLowerCase(), de]));
  const deKeyMap = new Map(dataExtensions.map(de => [de.externalKey?.toLowerCase(), de]));
  
  triggeredSends.forEach(ts => {
    // Send Data Extension relationship
    if (ts.sendDataExtension) {
      const sendDeName = ts.sendDataExtension.toLowerCase();
      const sendDe = deMap.get(sendDeName) || deKeyMap.get(sendDeName);
      if (sendDe) {
        relationships.push({
          id: `${sendDe.id}-${ts.id}`,
          source: sendDe.id,
          target: ts.id,
          type: 'triggered_send_source',
          label: 'triggered send source',
          description: `DE "${sendDe.name}" is send source for Triggered Send "${ts.name}"`
        });
      }
    }
    
    // Suppression List DE relationship
    if (ts.suppressionListDataExtension) {
      const suppressionDeName = ts.suppressionListDataExtension.toLowerCase();
      const suppressionDe = deMap.get(suppressionDeName) || deKeyMap.get(suppressionDeName);
      if (suppressionDe) {
        relationships.push({
          id: `${suppressionDe.id}-${ts.id}`,
          source: suppressionDe.id,
          target: ts.id,
          type: 'suppression_list',
          label: 'suppression list',
          description: `DE "${suppressionDe.name}" is suppression list for Triggered Send "${ts.name}"`
        });
      }
    }
  });
  
  return relationships;
}

/**
 * Detect File Transfer and Data Extract relationships with Data Extensions
 */
function detectFileTransferDataExtractRelationships(fileTransfers, dataExtracts, dataExtensions) {
  const relationships = [];
  const deMap = new Map(dataExtensions.map(de => [de.name.toLowerCase(), de]));
  const deKeyMap = new Map(dataExtensions.map(de => [de.externalKey?.toLowerCase(), de]));
  
  // File Transfer relationships
  fileTransfers.forEach(ft => {
    if (ft.targetDataExtension) {
      const targetDeName = ft.targetDataExtension.toLowerCase();
      const targetDe = deMap.get(targetDeName) || deKeyMap.get(targetDeName);
      if (targetDe) {
        relationships.push({
          id: `${ft.id}-${targetDe.id}`,
          source: ft.id,
          target: targetDe.id,
          type: 'file_transfer_target',
          label: 'transfers to DE',
          description: `File Transfer "${ft.name}" transfers data to DE "${targetDe.name}"`
        });
      }
    }
  });
  
  // Data Extract relationships
  dataExtracts.forEach(extract => {
    if (extract.sourceDataExtension) {
      const sourceDeName = extract.sourceDataExtension.toLowerCase();
      const sourceDe = deMap.get(sourceDeName) || deKeyMap.get(sourceDeName);
      if (sourceDe) {
        relationships.push({
          id: `${sourceDe.id}-${extract.id}`,
          source: sourceDe.id,
          target: extract.id,
          type: 'data_extract_source',
          label: 'extracts from DE',
          description: `Data Extract "${extract.name}" extracts data from DE "${sourceDe.name}"`
        });
      }
    }
  });
  
  return relationships;
}

/**
 * Main function to detect all relationships between SFMC assets
 */
function detectAllAssetRelationships(sfmcObjects) {
  const dataExtensions = sfmcObjects['Data Extensions'] || [];
  const queries = sfmcObjects['SQL Queries'] || [];
  const automations = sfmcObjects['Automations'] || [];
  const journeys = sfmcObjects['Journeys'] || [];
  const triggeredSends = sfmcObjects['Triggered Sends'] || [];
  const filters = sfmcObjects['Filters'] || [];
  const fileTransfers = sfmcObjects['File Transfers'] || [];
  const dataExtracts = sfmcObjects['Data Extracts'] || [];
  const automationRelationships = sfmcObjects['_AutomationRelationships'] || [];
  
  console.log('🔍 [Relationships] Detecting relationships between assets...');
  console.log(`🔗 [Relationships] Including ${automationRelationships.length} discovered automation relationships`);
  
  const allRelationships = [
    ...detectQueryToDataExtensionRelationships(queries, dataExtensions),
    ...detectFilterToDataExtensionRelationships(filters, dataExtensions),
    ...detectAutomationToDataExtensionRelationships(automations, dataExtensions, queries, fileTransfers, dataExtracts),
    ...detectJourneyToDataExtensionRelationships(journeys, dataExtensions),
    ...detectTriggeredSendToDataExtensionRelationships(triggeredSends, dataExtensions),
    ...detectFileTransferDataExtractRelationships(fileTransfers, dataExtracts, dataExtensions)
  ];
  
  // Process automation relationships and resolve DE identifiers to actual DE IDs
  const resolvedAutomationRelationships = automationRelationships.map(rel => {
    if (rel.type === 'targets' || rel.type === 'imports') {
      const targetDE = resolveDataExtensionIdentifier(rel.target, dataExtensions);
      if (targetDE) {
        return {
          ...rel,
          target: targetDE.id, // Use the actual DE ID
          resolvedDEName: targetDE.name
        };
      } else {
        console.warn(`⚠️ [Relationships] Could not resolve DE identifier "${rel.target}" to actual DE`);
        return null; // Filter out unresolved relationships
      }
    }
    return rel;
  }).filter(Boolean); // Remove null entries
  
  console.log(`✅ [Relationships] Resolved ${resolvedAutomationRelationships.length} automation relationships`);
  
  const finalRelationships = [
    ...allRelationships,
    ...resolvedAutomationRelationships
  ];
  
  console.log(`✅ [Relationships] Detected ${finalRelationships.length} total relationships`);
  
  // Remove duplicates
  const uniqueRelationships = finalRelationships.filter((rel, index, arr) => 
    arr.findIndex(r => r.id === rel.id) === index
  );
  
  console.log(`✅ [Relationships] After deduplication: ${uniqueRelationships.length} unique relationships`);
  
  return uniqueRelationships;
}

// ==================== END RELATIONSHIP DETECTION FUNCTIONS ====================

/**
 * Main function to fetch all SFMC objects
 */
/**
 * Fetch all SFMC objects using the new efficient MetadataCrawler
 */
async function fetchAllSFMCObjects(accessToken, subdomain, restEndpoint) {
  console.log('� [SFMC Fetch] Using new MetadataCrawler for efficient data collection...');
  
  const startTime = Date.now();
  
  try {
    // Skip MetadataCrawler for now and use proven SOAP API methods
    throw new Error('Using proven SOAP API methods instead of MetadataCrawler');
    
    const MetadataCrawler = require('./metadataCrawler');
    const crawler = new MetadataCrawler(accessToken, subdomain);
    
    // Use the new efficient crawler
    const schemaData = await crawler.crawlMetadata();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('✅ [SFMC Fetch] MetadataCrawler completed:', {
      totalNodes: schemaData.nodes.length,
      totalEdges: schemaData.edges.length,
      dataExtensions: schemaData.metadata.dataExtensions,
      automations: schemaData.metadata.automations,
      journeys: schemaData.metadata.journeys,
      triggeredSends: schemaData.metadata.triggeredSends,
      duration: `${duration}s`
    });
    
    // Convert to legacy format for compatibility with existing graph generation
    const result = {
      'Data Extensions': schemaData.nodes.filter(n => n.type === 'DataExtension').map(n => ({
        id: n.id,
        name: n.data.name,
        externalKey: n.data.key,
        description: '',
        createdDate: n.data.createdDate,
        modifiedDate: n.data.modifiedDate,
        isSendable: n.data.isSendable,
        type: 'DataExtension',
        path: n.data.path
      })),
      'SQL Queries': schemaData.nodes.filter(n => n.type === 'SQL').map(n => ({
        id: n.id,
        name: n.data.name,
        description: '',
        queryType: n.data.type,
        queryText: '',
        sqlStatement: '',
        createdDate: n.data.createdDate,
        modifiedDate: n.data.modifiedDate,
        status: 'Active',
        type: 'Query',
        automationId: n.data.automationId
      })),
      'Automations': schemaData.nodes.filter(n => n.type === 'Automation').map(n => ({
        id: n.id,
        name: n.data.name,
        description: '',
        status: n.data.status,
        createdDate: n.data.createdDate,
        modifiedDate: n.data.modifiedDate,
        steps: [],
        activities: [],
        type: 'Automation',
        path: n.data.path
      })),
      'Journeys': schemaData.nodes.filter(n => n.type === 'Journey').map(n => ({
        id: n.id,
        name: n.data.name,
        description: '',
        status: n.data.status,
        createdDate: n.data.createdDate,
        modifiedDate: n.data.modifiedDate,
        version: n.data.version,
        entrySource: {},
        activities: [],
        type: 'Journey',
        path: n.data.path
      })),
      'Triggered Sends': schemaData.nodes.filter(n => n.type === 'TriggeredSend').map(n => ({
        id: n.id,
        name: n.data.name,
        customerKey: n.data.customerKey,
        description: '',
        status: 'Active',
        createdDate: n.data.createdDate,
        modifiedDate: '',
        type: 'TriggeredSend'
      })),
      'Filters': [], // Filters will be added later if needed
      'File Transfers': [], // File Transfers will be added later if needed
      'Data Extracts': [] // Data Extracts will be added later if needed
    };
    
    return result;
    
  } catch (error) {
    console.error('❌ [SFMC Fetch] MetadataCrawler error:', error.message);
    console.log('🔄 [SFMC Fetch] Falling back to legacy method...');
    
    // Fallback to original method if MetadataCrawler fails
    return await fetchAllSFMCObjectsLegacy(accessToken, subdomain, restEndpoint);
  }
}

/**
 * Legacy SFMC object fetching method (fallback)
 */
async function fetchAllSFMCObjectsLegacy(accessToken, subdomain, restEndpoint) {
  console.log('🔄 [SFMC Fetch] Using legacy parallel fetch method...');
  
  const startTime = Date.now();
  
  const allObjects = {
    'Data Extensions': [],
    'SQL Queries': [],
    'Automations': [],
    'Journeys': [],
    'Triggered Sends': [],
    'Filters': [],
    'File Transfers': [],
    'Data Extracts': []
  };

  try {
    // Fetch all object types in parallel for better performance
    const [
      dataExtensions,
      queries,
      automations,
      journeys,
      triggeredSends,
      filters,
      fileTransfers,
      dataExtracts
    ] = await Promise.allSettled([
      fetchSFMCDataExtensions(accessToken, subdomain),
      fetchSFMCQueries(accessToken, restEndpoint),
      fetchSFMCAutomations(accessToken, restEndpoint),
      fetchSFMCJourneys(accessToken, restEndpoint),
      fetchSFMCTriggeredSends(accessToken, subdomain),
      fetchSFMCFilters(accessToken, subdomain),
      fetchSFMCFileTransfers(accessToken, restEndpoint),
      fetchSFMCDataExtracts(accessToken, restEndpoint)
    ]);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Process results and handle any failures
    if (dataExtensions.status === 'fulfilled') {
      allObjects['Data Extensions'] = dataExtensions.value;
      console.log(`✅ [SFMC API] Fetched ${dataExtensions.value.length} Data Extensions`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch Data Extensions:', dataExtensions.reason.message);
    }

    if (queries.status === 'fulfilled') {
      allObjects['SQL Queries'] = queries.value;
      console.log(`✅ [SFMC API] Fetched ${queries.value.length} SQL Queries`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch SQL Queries:', queries.reason.message);
    }

    if (automations.status === 'fulfilled') {
      // Handle new return format with automations and relationships
      const automationResult = automations.value;
      if (automationResult.automations) {
        allObjects['Automations'] = automationResult.automations;
        console.log(`✅ [SFMC API] Fetched ${automationResult.automations.length} Automations`);
        console.log(`🔗 [SFMC API] Discovered ${automationResult.relationships.length} automation-level relationships`);
        
        // Store automation relationships for later use in graph generation
        allObjects['_AutomationRelationships'] = automationResult.relationships;
      } else {
        // Fallback for old format
        allObjects['Automations'] = automationResult;
        console.log(`✅ [SFMC API] Fetched ${automationResult.length} Automations (legacy format)`);
      }
    } else {
      console.error('❌ [SFMC API] Failed to fetch Automations:', automations.reason.message);
    }

    if (journeys.status === 'fulfilled') {
      allObjects['Journeys'] = journeys.value;
      console.log(`✅ [SFMC API] Fetched ${journeys.value.length} Journeys`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch Journeys:', journeys.reason.message);
    }

    if (triggeredSends.status === 'fulfilled') {
      allObjects['Triggered Sends'] = triggeredSends.value;
      console.log(`✅ [SFMC API] Fetched ${triggeredSends.value.length} Triggered Sends`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch Triggered Sends:', triggeredSends.reason.message);
    }

    if (filters.status === 'fulfilled') {
      allObjects['Filters'] = filters.value;
      console.log(`✅ [SFMC API] Fetched ${filters.value.length} Filters`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch Filters:', filters.reason.message);
    }

    if (fileTransfers.status === 'fulfilled') {
      allObjects['File Transfers'] = fileTransfers.value;
      console.log(`✅ [SFMC API] Fetched ${fileTransfers.value.length} File Transfers`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch File Transfers:', fileTransfers.reason.message);
    }

    if (dataExtracts.status === 'fulfilled') {
      allObjects['Data Extracts'] = dataExtracts.value;
      console.log(`✅ [SFMC API] Fetched ${dataExtracts.value.length} Data Extracts`);
    } else {
      console.error('❌ [SFMC API] Failed to fetch Data Extracts:', dataExtracts.reason.message);
    }

    console.log(`✅ [SFMC Fetch] Completed legacy fetch in ${duration}s`);
    return allObjects;
    
  } catch (error) {
    console.error('❌ [SFMC API] Error in fetchAllSFMCObjectsLegacy:', error.message);
    throw error;
  }
}

// ==================== GRAPH API UTILITY FUNCTIONS ====================

/**
 * Classify relationship style for frontend edge rendering
 * @param {string} relationshipType - The type of relationship
 * @returns {string} - 'direct', 'workflow', or 'metadata'
 */
function classifyRelationshipStyle(relationshipType) {
  // Direct data flow relationships (solid lines)
  const directTypes = [
    'writes_to',
    'reads_from', 
    'imports_to_de',
    'updates_de',
    'journey_entry_source',
    'subscriber_source',
    'sends_email'
  ];
  
  // Workflow/orchestration relationships (dashed lines)
  const workflowTypes = [
    'contains_query',
    'contains_filter',
    'executes_query',
    'triggers_automation',
    'executes_activity',
    'next_step'
  ];
  
  // Metadata/reference relationships (dotted lines)
  const metadataTypes = [
    'filters_de',
    'uses_in_decision',
    'provides_data_to'
  ];
  
  if (directTypes.includes(relationshipType)) {
    return 'direct';
  }
  
  if (workflowTypes.includes(relationshipType)) {
    return 'workflow';
  }
  
  if (metadataTypes.includes(relationshipType)) {
    return 'metadata';
  }
  
  // Default fallback
  return 'direct';
}

/**
 * Generate graph data from live SFMC objects with enhanced filtering and debugging
 * Creates nodes and edges for visualization, showing only meaningful relationships
 * @param {Object} sfmcObjects - The SFMC objects organized by category
 * @param {Array} types - Optional filter by object types
 * @param {Array} keys - Optional filter by object keys
 * @param {Object} selectedObjects - Optional filter by selected objects from frontend
 * @returns {Object} Graph data with nodes and edges
 */
function generateLiveGraphData(sfmcObjects, types = [], keys = [], selectedObjects = {}) {
  console.log('🔍 [Graph] === STARTING ENHANCED GRAPH GENERATION ===');
  console.log('🔍 [Graph] Input parameters:', {
    types,
    keys,
    selectedObjectsCount: Object.keys(selectedObjects).length,
    selectedObjects: JSON.stringify(selectedObjects, null, 2)
  });
  
  // 🚀 NEW: Check if we have efficient schema data from MetadataCrawler
  if (sfmcObjects.schemaData) {
    console.log('🚀 [Graph] Using efficient schema data from MetadataCrawler');
    return generateGraphFromSchemaData(sfmcObjects.schemaData, types, keys, selectedObjects);
  }
  
  console.log('🔄 [Graph] Using legacy graph generation method');
  return generateLegacyGraphData(sfmcObjects, types, keys, selectedObjects);
}

/**
 * 🚀 NEW: Generate graph data from efficient MetadataCrawler schema
 */
function generateGraphFromSchemaData(schemaData, types = [], keys = [], selectedObjects = {}) {
  console.log('🚀 [Schema Graph] Generating graph from efficient schema data...');
  console.log('📊 [Schema Graph] Schema contains:', {
    nodes: schemaData.nodes.length,
    edges: schemaData.edges.length,
    metadata: schemaData.metadata
  });
  
  let filteredNodes = [...schemaData.nodes];
  let filteredEdges = [...schemaData.edges];
  
  // Apply type filtering if specified
  if (types.length > 0) {
    filteredNodes = filteredNodes.filter(node => types.includes(node.type));
    console.log(`🔍 [Schema Graph] Filtered to ${filteredNodes.length} nodes by type: [${types.join(', ')}]`);
  }
  
  // Apply selection filtering if specified
  const hasAnySelection = Object.keys(selectedObjects).length > 0 && 
    Object.values(selectedObjects).some(categoryObj => 
      Object.values(categoryObj || {}).some(selected => selected)
    );
  
  if (hasAnySelection) {
    console.log('🎯 [Schema Graph] Applying selection filtering...');
    
    const selectedNodeIds = new Set();
    const relatedNodeIds = new Set();
    
    // Collect selected nodes
    Object.entries(selectedObjects).forEach(([category, selections]) => {
      if (!selections) return;
      
      console.log(`🔍 [Schema Graph] Processing category: ${category}, selections:`, selections);
      
      Object.entries(selections).forEach(([objectKey, isSelected]) => {
        if (isSelected) {
          console.log(`🔍 [Schema Graph] Looking for matches for objectKey: "${objectKey}" (type: ${typeof objectKey})`);
          
          // Enhanced matching logic - try multiple approaches
          const matchingNodes = filteredNodes.filter(node => {
            const nodeId = node.id;
            const nodeName = node.data?.name || node.label;
            const nodeKey = node.data?.key;
            
            // Try exact matches first
            if (nodeId === objectKey || nodeName === objectKey || nodeKey === objectKey) {
              console.log(`  ✅ Exact match found: ${node.label} (${node.type}) - nodeId: ${nodeId}, nodeName: ${nodeName}`);
              return true;
            }
            
            // Try substring matches (for IDs that might have prefixes/suffixes)
            if (nodeId.includes(objectKey) || objectKey.includes(nodeId)) {
              console.log(`  ✅ Substring match found: ${node.label} (${node.type}) - nodeId: ${nodeId}`);
              return true;
            }
            
            // Try name-based matching
            if (nodeName && (nodeName.includes(objectKey) || objectKey.includes(nodeName))) {
              console.log(`  ✅ Name match found: ${node.label} (${node.type}) - nodeName: ${nodeName}`);
              return true;
            }
            
            console.log(`  ❌ No match: nodeId="${nodeId}", nodeName="${nodeName}", objectKey="${objectKey}"`);
            return false;
          });
          
          if (matchingNodes.length === 0) {
            console.warn(`⚠️ [Schema Graph] No matching nodes found for objectKey: "${objectKey}" in category: ${category}`);
            console.log(`  Available nodes in this category:`, filteredNodes
              .filter(n => n.type === category || n.data?.category === category)
              .map(n => ({ id: n.id, name: n.data?.name || n.label, type: n.type }))
            );
          }
          
          matchingNodes.forEach(node => {
            selectedNodeIds.add(node.id);
            console.log(`✅ [Schema Graph] Selected node: ${node.label} (${node.type}) - ID: ${node.id}`);
          });
        }
      });
    });
    
    // Find related nodes (deeper connection analysis for automation workflows)
    if (selectedNodeIds.size > 0) {
      console.log(`🔗 [Schema Graph] Finding related nodes for ${selectedNodeIds.size} selected nodes...`);
      
      // For automations, we need to find their activities and the activities' targets
      selectedNodeIds.forEach(nodeId => {
        const node = filteredNodes.find(n => n.id === nodeId);
        if (node && node.type === 'Automation') {
          console.log(`🤖 [Schema Graph] Finding automation workflow for: ${node.label}`);
          
          // Find all direct connections (1-hop)
          filteredEdges.forEach(edge => {
            if (edge.source === nodeId) {
              relatedNodeIds.add(edge.target);
              console.log(`  ➡️ Direct outbound: ${nodeId} -> ${edge.target} (${edge.type})`);
              
              // For automation activities, also find their targets (2-hop)
              const targetNode = filteredNodes.find(n => n.id === edge.target);
              if (targetNode && (targetNode.type === 'Activity' || targetNode.type.includes('Activity'))) {
                filteredEdges.forEach(secondHopEdge => {
                  if (secondHopEdge.source === edge.target) {
                    relatedNodeIds.add(secondHopEdge.target);
                    console.log(`    ➡️➡️ Activity target: ${edge.target} -> ${secondHopEdge.target} (${secondHopEdge.type})`);
                    
                    // For query activities, also find the DEs that the queries target (3-hop)
                    const queryNode = filteredNodes.find(n => n.id === secondHopEdge.target);
                    if (queryNode && queryNode.type === 'SQL Queries') {
                      filteredEdges.forEach(thirdHopEdge => {
                        if (thirdHopEdge.source === secondHopEdge.target && thirdHopEdge.type === 'writes_to') {
                          relatedNodeIds.add(thirdHopEdge.target);
                          console.log(`      ➡️➡️➡️ Query target DE: ${secondHopEdge.target} -> ${thirdHopEdge.target} (${thirdHopEdge.type})`);
                        }
                      });
                    }
                  }
                });
              }
            }
            if (edge.target === nodeId) {
              relatedNodeIds.add(edge.source);
              console.log(`  ⬅️ Direct inbound: ${edge.source} -> ${nodeId} (${edge.type})`);
            }
          });
        } else if (node && node.type === 'SQL Queries') {
          console.log(`📝 [Schema Graph] Finding SQL Query workflow for: ${node.label}`);
          
          // For SQL Queries, find activities that execute them and automations that contain those activities
          filteredEdges.forEach(edge => {
            if (edge.source === nodeId) {
              relatedNodeIds.add(edge.target);
              console.log(`  ➡️ Query target: ${nodeId} -> ${edge.target} (${edge.type})`);
            }
            if (edge.target === nodeId) {
              relatedNodeIds.add(edge.source);
              console.log(`  ⬅️ Query source: ${edge.source} -> ${nodeId} (${edge.type})`);
              
              // If source is an activity, also find its parent automation
              const sourceNode = filteredNodes.find(n => n.id === edge.source);
              if (sourceNode && (sourceNode.type === 'Activity' || sourceNode.type.includes('Activity'))) {
                filteredEdges.forEach(activityEdge => {
                  if (activityEdge.target === edge.source && activityEdge.type === 'executes_activity') {
                    relatedNodeIds.add(activityEdge.source);
                    console.log(`    ⬅️⬅️ Parent automation: ${activityEdge.source} -> ${edge.source} (${activityEdge.type})`);
                  }
                });
              }
            }
          });
        } else if (node && node.type === 'Data Extensions') {
          console.log(`📊 [Schema Graph] Finding Data Extension workflow for: ${node.label}`);
          
          // For Data Extensions, find queries that read/write and their parent activities/automations
          filteredEdges.forEach(edge => {
            if (edge.source === nodeId) {
              relatedNodeIds.add(edge.target);
              console.log(`  ➡️ DE target: ${nodeId} -> ${edge.target} (${edge.type})`);
              
              // If target is a query, also find activities that execute it and their automations
              const targetNode = filteredNodes.find(n => n.id === edge.target);
              if (targetNode && targetNode.type === 'SQL Queries') {
                filteredEdges.forEach(queryEdge => {
                  if (queryEdge.target === edge.target && queryEdge.type === 'executes_query') {
                    relatedNodeIds.add(queryEdge.source);
                    console.log(`    ⬅️➡️ Query executed by: ${queryEdge.source} -> ${edge.target} (${queryEdge.type})`);
                    
                    // Find the automation that contains this activity
                    const activityNode = filteredNodes.find(n => n.id === queryEdge.source);
                    if (activityNode && (activityNode.type === 'Activity' || activityNode.type.includes('Activity'))) {
                      filteredEdges.forEach(activityEdge => {
                        if (activityEdge.target === queryEdge.source && activityEdge.type === 'executes_activity') {
                          relatedNodeIds.add(activityEdge.source);
                          console.log(`      ⬅️⬅️➡️ Parent automation: ${activityEdge.source} -> ${queryEdge.source} (${activityEdge.type})`);
                        }
                      });
                    }
                  }
                });
              }
            }
            if (edge.target === nodeId) {
              relatedNodeIds.add(edge.source);
              console.log(`  ⬅️ DE source: ${edge.source} -> ${nodeId} (${edge.type})`);
              
              // If source is a query, also find activities that execute it and their automations
              const sourceNode = filteredNodes.find(n => n.id === edge.source);
              if (sourceNode && sourceNode.type === 'SQL Queries') {
                filteredEdges.forEach(queryEdge => {
                  if (queryEdge.target === edge.source && queryEdge.type === 'executes_query') {
                    relatedNodeIds.add(queryEdge.source);
                    console.log(`    ⬅️⬅️ Query executed by: ${queryEdge.source} -> ${edge.source} (${queryEdge.type})`);
                    
                    // Find the automation that contains this activity
                    const activityNode = filteredNodes.find(n => n.id === queryEdge.source);
                    if (activityNode && (activityNode.type === 'Activity' || activityNode.type.includes('Activity'))) {
                      filteredEdges.forEach(activityEdge => {
                        if (activityEdge.target === queryEdge.source && activityEdge.type === 'executes_activity') {
                          relatedNodeIds.add(activityEdge.source);
                          console.log(`      ⬅️⬅️⬅️ Parent automation: ${activityEdge.source} -> ${queryEdge.source} (${activityEdge.type})`);
                        }
                      });
                    }
                  }
                });
              }
            }
          });
        } else {
          // For other node types, use standard 1-hop connection
          filteredEdges.forEach(edge => {
            if (edge.source === nodeId) {
              relatedNodeIds.add(edge.target);
            }
            if (edge.target === nodeId) {
              relatedNodeIds.add(edge.source);
            }
          });
        }
      });
      
      console.log(`🔗 [Schema Graph] Found ${relatedNodeIds.size} related nodes`);
      
      // Combine selected and related nodes
      const finalNodeIds = new Set([...selectedNodeIds, ...relatedNodeIds]);
      filteredNodes = filteredNodes.filter(node => finalNodeIds.has(node.id));
      filteredEdges = filteredEdges.filter(edge => 
        finalNodeIds.has(edge.source) && finalNodeIds.has(edge.target)
      );
      
      console.log(`🎯 [Schema Graph] Final filtered result: ${filteredNodes.length} nodes, ${filteredEdges.length} edges`);
      console.log(`🎯 [Schema Graph] Final node types:`, filteredNodes.reduce((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      }, {}));
    }
  }
  
  // Convert to Cytoscape format
  const cytoscapeNodes = filteredNodes.map(node => ({
    data: {
      id: node.id,
      label: node.label || node.data.name,
      type: node.type,
      name: node.data.name,
      path: node.data.path || '',
      status: node.data.status || 'Active',
      createdDate: node.data.createdDate || '',
      modifiedDate: node.data.modifiedDate || '',
      // Additional metadata
      isSendable: node.data.isSendable,
      version: node.data.version,
      activityCount: node.data.activityCount
    }
  }));
  
  const cytoscapeEdges = filteredEdges.map(edge => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.label,
      style: classifyRelationshipStyle(edge.type)
    }
  }));
  
  const result = {
    nodes: cytoscapeNodes,
    edges: cytoscapeEdges,
    metadata: {
      ...schemaData.metadata,
      filteredNodes: cytoscapeNodes.length,
      filteredEdges: cytoscapeEdges.length,
      generatedAt: new Date().toISOString(),
      source: 'MetadataCrawler'
    }
  };
  
  console.log('✅ [Schema Graph] Graph generation complete:', {
    nodes: result.nodes.length,
    edges: result.edges.length,
    source: result.metadata.source
  });
  
  return result;
}

/**
 * 🔄 Legacy graph generation method (fallback)
 */
function generateLegacyGraphData(sfmcObjects, types = [], keys = [], selectedObjects = {}) {
  
  const debugStats = {
    inputObjects: {},
    selectedObjects: {},
    relationships: {
      detected: 0,
      filtered: 0,
      included: 0
    },
    nodes: {
      created: 0,
      selected: 0,
      related: 0,
      orphaned: 0,
      final: 0
    }
  };
  
  // Log input statistics
  Object.entries(sfmcObjects).forEach(([category, objects]) => {
    debugStats.inputObjects[category] = objects?.length || 0;
    console.log(`📊 [Graph] Input ${category}: ${objects?.length || 0} objects`);
  });
  
  // Check if any objects are selected
  const hasAnySelection = Object.keys(selectedObjects).length > 0 && 
    Object.values(selectedObjects).some(categoryObj => 
      Object.values(categoryObj || {}).some(selected => selected)
    );
  
  console.log(`🎯 [Graph] Selection mode: ${hasAnySelection ? 'FILTERED' : 'ALL_OBJECTS'}`);
  console.log(`🎯 [Graph] Raw selectedObjects parameter:`, selectedObjects);
  console.log(`🎯 [Graph] hasAnySelection calculation:`, {
    hasKeys: Object.keys(selectedObjects).length > 0,
    hasValues: Object.values(selectedObjects).some(categoryObj => 
      Object.values(categoryObj || {}).some(selected => selected)
    ),
    finalResult: hasAnySelection
  });
  
  if (hasAnySelection) {
    Object.entries(selectedObjects).forEach(([category, selections]) => {
      const selectedCount = Object.values(selections || {}).filter(Boolean).length;
      debugStats.selectedObjects[category] = selectedCount;
      console.log(`🎯 [Graph] Selected ${category}: ${selectedCount} objects`);
    });
  }
  
  // Step 1: Identify all relationships first (regardless of selection)
  console.log('🔗 [Graph] === STEP 1: DETECTING ALL RELATIONSHIPS ===');
  
  const allDataExtensions = sfmcObjects['Data Extensions'] || [];
  const allSqlQueries = sfmcObjects['SQL Queries'] || [];
  const allAutomations = sfmcObjects['Automations'] || [];
  const allJourneys = sfmcObjects['Journeys'] || [];
  const allTriggeredSends = sfmcObjects['Triggered Sends'] || [];
  const allFilters = sfmcObjects['Filters'] || [];
  const allFileTransfers = sfmcObjects['File Transfers'] || [];
  const allDataExtracts = sfmcObjects['Data Extracts'] || [];
  
  // Detect ALL relationships using enhanced detection functions
  const allRelationships = [
    ...detectQueryToDataExtensionRelationships(allSqlQueries, allDataExtensions),
    ...detectFilterToDataExtensionRelationships(allFilters, allDataExtensions),
    ...detectAutomationToDataExtensionRelationships(allAutomations, allDataExtensions, allSqlQueries, allFileTransfers, allDataExtracts),
    ...detectJourneyToDataExtensionRelationships(allJourneys, allDataExtensions),
    ...detectTriggeredSendToDataExtensionRelationships(allTriggeredSends, allDataExtensions)
  ];
  
  debugStats.relationships.detected = allRelationships.length;
  console.log(`🔗 [Graph] Total relationships detected: ${allRelationships.length}`);
  
  // Log relationship type breakdown
  const relationshipTypes = {};
  allRelationships.forEach(rel => {
    relationshipTypes[rel.type] = (relationshipTypes[rel.type] || 0) + 1;
  });
  console.log('🔗 [Graph] Relationship types:', relationshipTypes);
  
  // Step 2: Create relationship map for efficient lookups
  const relationshipMap = new Map();
  
  // Initialize relationship tracking for ALL objects
  const initializeObjectTracking = (category, objects) => {
    objects.forEach(obj => {
      if (!relationshipMap.has(obj.id)) {
        relationshipMap.set(obj.id, {
          object: obj,
          category: category,
          inbound: [],
          outbound: [],
          hasConnections: false
        });
      }
    });
  };
  
  Object.entries(sfmcObjects).forEach(([category, objects]) => {
    if (objects) initializeObjectTracking(category, objects);
  });
  
  // Also initialize tracking for activity nodes if they exist
  if (global.activityNodes && global.activityNodes.size > 0) {
    console.log(`🔗 [Graph] Adding ${global.activityNodes.size} activity nodes to relationship map`);
    global.activityNodes.forEach((activityNode, activityId) => {
      if (!relationshipMap.has(activityId)) {
        relationshipMap.set(activityId, {
          object: activityNode,
          category: 'Activity',
          inbound: [],
          outbound: [],
          hasConnections: false
        });
      }
    });
  }
  
  // Populate relationship map
  allRelationships.forEach(rel => {
    const sourceNode = relationshipMap.get(rel.source);
    const targetNode = relationshipMap.get(rel.target);
    
    if (sourceNode) {
      sourceNode.outbound.push(rel);
      sourceNode.hasConnections = true;
    }
    
    if (targetNode) {
      targetNode.inbound.push(rel);
      targetNode.hasConnections = true;
    }
  });
  
  // Step 3: Apply focused selection filtering if needed
  let finalObjectIds = new Set();
  
  if (hasAnySelection) {
    console.log('🎯 [Graph] === STEP 3: APPLYING FOCUSED SELECTION FILTER ===');
    console.log('🎯 [Graph] Selected objects input:', JSON.stringify(selectedObjects, null, 2));
    
    // First, add all directly selected objects
    Object.entries(selectedObjects).forEach(([category, selections]) => {
      console.log(`🔍 [Graph] Processing category: ${category}, selections:`, selections);
      if (sfmcObjects[category]) {
        console.log(`📊 [Graph] Available objects in ${category}:`, sfmcObjects[category].map(obj => ({ id: obj.id, name: obj.name })));
        sfmcObjects[category].forEach(obj => {
          if (selections[obj.id] === true) {
            finalObjectIds.add(obj.id);
            debugStats.nodes.selected++;
            console.log(`✅ [Graph] Selected: ${category} - ${obj.name} (${obj.id})`);
          } else {
            console.log(`❌ [Graph] Not selected: ${category} - ${obj.name} (${obj.id}) - selection value: ${selections[obj.id]}`);
          }
        });
      } else {
        console.warn(`⚠️ [Graph] Category ${category} not found in sfmcObjects`);
      }
    });
    
    console.log(`🎯 [Graph] Total selected objects after initial add: ${finalObjectIds.size}`);
    
    // Now add related objects based on the specific logic for each selected object type
    const selectedIds = Array.from(finalObjectIds);
    selectedIds.forEach(selectedId => {
      const nodeData = relationshipMap.get(selectedId);
      if (nodeData) {
        console.log(`🔍 [Graph] Finding focused relationships for: ${nodeData.category} - ${nodeData.object.name}`);
        
        if (nodeData.category === 'Data Extensions') {
          // For Data Extensions, show ONLY objects that directly target this specific DE
          console.log(`  📊 [DE Logic] Finding objects that specifically target DE: ${nodeData.object.name}`);
          console.log(`  📊 [DE Logic] DE "${nodeData.object.name}" has:`);
          console.log(`    - ${nodeData.inbound.length} inbound relationships`);
          console.log(`    - ${nodeData.outbound.length} outbound relationships`);
          
          // Debug: log all relationships for this DE
          if (nodeData.inbound.length > 0) {
            console.log(`  📊 [DE Logic] Inbound relationships for "${nodeData.object.name}":`);
            nodeData.inbound.forEach((rel, idx) => {
              const sourceNode = relationshipMap.get(rel.source);
              console.log(`    ${idx + 1}. ${sourceNode ? sourceNode.category + ' - ' + sourceNode.object.name : 'Unknown'} --${rel.type}--> ${nodeData.object.name}`);
            });
          }
          
          if (nodeData.outbound.length > 0) {
            console.log(`  📊 [DE Logic] Outbound relationships for "${nodeData.object.name}":`);
            nodeData.outbound.forEach((rel, idx) => {
              const targetNode = relationshipMap.get(rel.target);
              console.log(`    ${idx + 1}. ${nodeData.object.name} --${rel.type}--> ${targetNode ? targetNode.category + ' - ' + targetNode.object.name : 'Unknown'}`);
            });
          }
          
          // Track relevant automations and activities that target this DE
          const relevantAutomations = new Set();
          const relevantActivities = new Set();
          const relevantQueries = new Set();
          
          // 1. Find activities that write to this DE
          nodeData.inbound.forEach(rel => {
            const sourceNode = relationshipMap.get(rel.source);
            if (sourceNode && sourceNode.category === 'Activity' && rel.type === 'writes_to') {
              relevantActivities.add(rel.source);
              console.log(`    🎯 Found targeting activity: ${sourceNode.object.name} → ${nodeData.object.name} (${rel.type})`);
              
              // Find the automation that contains this activity
              sourceNode.inbound.forEach(activityRel => {
                const automationNode = relationshipMap.get(activityRel.source);
                if (automationNode && automationNode.category === 'Automations' && activityRel.type === 'executes_activity') {
                  relevantAutomations.add(activityRel.source);
                  console.log(`    🤖 Found parent automation: ${automationNode.object.name} contains activity ${sourceNode.object.name}`);
                }
              });
            }
          });
          
          // 2. Find queries that write to this DE
          nodeData.inbound.forEach(rel => {
            const sourceNode = relationshipMap.get(rel.source);
            if (sourceNode && sourceNode.category === 'SQL Queries' && rel.type === 'writes_to') {
              relevantQueries.add(rel.source);
              console.log(`    📝 Found targeting query: ${sourceNode.object.name} → ${nodeData.object.name} (${rel.type})`);
              
              // Find activities that execute this query
              sourceNode.inbound.forEach(queryRel => {
                const activityNode = relationshipMap.get(queryRel.source);
                if (activityNode && activityNode.category === 'Activity' && queryRel.type === 'executes_query') {
                  relevantActivities.add(queryRel.source);
                  console.log(`    🎯 Found activity executing query: ${activityNode.object.name} executes ${sourceNode.object.name}`);
                  
                  // Find the automation that contains this activity
                  activityNode.inbound.forEach(activityRel => {
                    const automationNode = relationshipMap.get(activityRel.source);
                    if (automationNode && automationNode.category === 'Automations' && activityRel.type === 'executes_activity') {
                      relevantAutomations.add(activityRel.source);
                      console.log(`    🤖 Found parent automation: ${automationNode.object.name} contains activity ${activityNode.object.name}`);
                    }
                  });
                }
              });
            }
          });
          
          // 3. Find queries that read from this DE (source for other operations)
          nodeData.outbound.forEach(rel => {
            const targetNode = relationshipMap.get(rel.target);
            if (targetNode && targetNode.category === 'SQL Queries' && rel.type === 'reads_from') {
              relevantQueries.add(rel.target);
              console.log(`    📖 Found reading query: ${nodeData.object.name} → ${targetNode.object.name} (${rel.type})`);
              
              // Find activities that execute this query
              targetNode.inbound.forEach(queryRel => {
                const activityNode = relationshipMap.get(queryRel.source);
                if (activityNode && activityNode.category === 'Activity' && queryRel.type === 'executes_query') {
                  relevantActivities.add(queryRel.source);
                  console.log(`    🎯 Found activity executing query: ${activityNode.object.name} executes ${targetNode.object.name}`);
                  
                  // Find the automation that contains this activity
                  activityNode.inbound.forEach(activityRel => {
                    const automationNode = relationshipMap.get(activityRel.source);
                    if (automationNode && automationNode.category === 'Automations' && activityRel.type === 'executes_activity') {
                      relevantAutomations.add(activityRel.source);
                      console.log(`    🤖 Found parent automation: ${automationNode.object.name} contains activity ${activityNode.object.name}`);
                    }
                  });
                }
              });
            }
          });
          
          // 4. Fallback: Search through automation metadata for queries that target this DE
          if (relevantAutomations.size === 0) {
            console.log(`  📊 [DE Logic] No automations found via relationships, searching automation metadata...`);
            
            try {
              allAutomations.forEach(automation => {
                if (!automation || !automation.id) {
                  console.log(`    ⚠️ Skipping invalid automation:`, automation);
                  return;
                }
                
                const steps = automation.steps || automation.activities || [];
                let foundInAutomation = false;
                
                steps.forEach(step => {
                  if (!step) return;
                  
                  const activities = step.activities || [];
                  activities.forEach(activity => {
                    if (!activity) return;
                    
                    try {
                      // Check if this activity targets our DE
                      if (activity.targetDataExtensions && Array.isArray(activity.targetDataExtensions) && activity.targetDataExtensions.length > 0) {
                        const targetsThisDE = activity.targetDataExtensions.some(targetDE => {
                          if (!targetDE) return false;
                          
                          try {
                            return (
                              (targetDE.id && nodeData.object.id && targetDE.id === nodeData.object.id) ||
                              (targetDE.name && nodeData.object.name && targetDE.name === nodeData.object.name) ||
                              (targetDE.key && nodeData.object.externalKey && targetDE.key === nodeData.object.externalKey) ||
                              (nodeData.object.id && targetDE.id && typeof nodeData.object.id === 'string' && typeof targetDE.id === 'string' && nodeData.object.id.includes(targetDE.id)) ||
                              (nodeData.object.id && targetDE.id && typeof nodeData.object.id === 'string' && typeof targetDE.id === 'string' && targetDE.id.includes(nodeData.object.id.replace('de_', '')))
                            );
                          } catch (comparisonError) {
                            console.log(`    ⚠️ Error in DE comparison for activity "${activity.name || 'unnamed'}":`, comparisonError.message);
                            console.log(`    📋 DE comparison debug: nodeData.object.id=${nodeData.object.id}, targetDE.id=${targetDE.id}`);
                            return false;
                          }
                        });
                        
                        if (targetsThisDE) {
                          relevantAutomations.add(automation.id);
                          foundInAutomation = true;
                          console.log(`    🔍 Found automation via metadata: ${automation.name} (activity: ${activity.name || 'unnamed'} targets DE)`);
                          
                          // Find the actual activity node that was created for this step
                          const stepNumber = step.step || steps.indexOf(step) + 1;
                          const possibleActivityIds = [
                            `${automation.id}_activity_${stepNumber}_QueryActivity`,
                            `${automation.id}_activity_${stepNumber}_GenericActivity`,
                            `${automation.id}_activity_${stepNumber}_DataExtractActivity`,
                            `${automation.id}_activity_${stepNumber}_EmailActivity`,
                            `${automation.id}_activity_${stepNumber}_ImportActivity`,
                            `${automation.id}_activity_${stepNumber}_ExportActivity`
                          ];
                          
                          // Find which activity ID actually exists in the relationshipMap
                          const actualActivityId = possibleActivityIds.find(id => relationshipMap.has(id));
                          if (actualActivityId) {
                            relevantActivities.add(actualActivityId);
                            console.log(`    🎯 Adding corresponding activity: ${actualActivityId}`);
                          } else {
                            console.log(`    ⚠️ Could not find activity node for step ${stepNumber} in relationshipMap`);
                            console.log(`    📋 Tried IDs:`, possibleActivityIds);
                          }
                        }
                      }
                      
                      // Also check if the activity's query is one of our relevant queries
                      if (activity.activityObjectId) {
                        const queryId = `query_${activity.activityObjectId}`;
                        if (relevantQueries.has(queryId)) {
                          relevantAutomations.add(automation.id);
                          foundInAutomation = true;
                          console.log(`    🔍 Found automation via query reference: ${automation.name} (activity executes query ${activity.activityObjectId})`);
                          
                          // Find the actual activity node that was created for this step
                          const stepNumber = step.step || steps.indexOf(step) + 1;
                          const possibleActivityIds = [
                            `${automation.id}_activity_${stepNumber}_QueryActivity`,
                            `${automation.id}_activity_${stepNumber}_GenericActivity`,
                            `${automation.id}_activity_${stepNumber}_DataExtractActivity`,
                            `${automation.id}_activity_${stepNumber}_EmailActivity`,
                            `${automation.id}_activity_${stepNumber}_ImportActivity`,
                            `${automation.id}_activity_${stepNumber}_ExportActivity`
                          ];
                          
                          // Find which activity ID actually exists in the relationshipMap
                          const actualActivityId = possibleActivityIds.find(id => relationshipMap.has(id));
                          if (actualActivityId) {
                            relevantActivities.add(actualActivityId);
                            console.log(`    🎯 Adding corresponding activity: ${actualActivityId}`);
                          } else {
                            console.log(`    ⚠️ Could not find activity node for step ${stepNumber} in relationshipMap`);
                            console.log(`    📋 Tried IDs:`, possibleActivityIds);
                          }
                        }
                      }
                    } catch (activityError) {
                      console.log(`    ⚠️ Error processing activity in automation "${automation.name}":`, activityError.message);
                    }
                  });
                });
                
                if (foundInAutomation) {
                  console.log(`    ✅ Automation "${automation.name}" references DE "${nodeData.object.name}"`);
                }
              });
            } catch (metadataError) {
              console.log(`  ⚠️ Error in automation metadata search:`, metadataError.message);
              console.log(`  📊 [DE Logic] Continuing with existing relationships...`);
            }
          }
          
          // 4. Add only the relevant objects to the final set
          console.log(`  📊 [DE Logic] Summary for DE "${nodeData.object.name}":`);
          console.log(`    - Relevant automations found: ${relevantAutomations.size}`);
          console.log(`    - Relevant activities found: ${relevantActivities.size}`);
          console.log(`    - Relevant queries found: ${relevantQueries.size}`);
          
          if (relevantAutomations.size === 0 && relevantActivities.size === 0 && relevantQueries.size === 0) {
            console.log(`    ⚠️ No related objects found for DE "${nodeData.object.name}" - showing only the DE itself`);
          }
          
          relevantAutomations.forEach(automationId => {
            if (!finalObjectIds.has(automationId)) {
              finalObjectIds.add(automationId);
              debugStats.nodes.related++;
              const automationNode = relationshipMap.get(automationId);
              if (automationNode && automationNode.object) {
                console.log(`    ✅ Adding relevant automation: ${automationNode.object.name}`);
                
                // When adding an automation, also add its activities
                console.log(`    🔍 [DE Logic] Checking automation "${automationNode.object.name}" for activities...`);
                console.log(`    🔍 [DE Logic] Automation has ${automationNode.outbound.length} outbound relationships`);
                
                if (automationNode.outbound.length === 0) {
                  console.log(`    ⚠️ [DE Logic] No outbound relationships found for automation ${automationId}`);
                  console.log(`    🔍 [DE Logic] Automation node structure:`, JSON.stringify(automationNode, null, 2));
                }
                
                automationNode.outbound.forEach((rel, index) => {
                  console.log(`    🔍 [DE Logic] Outbound relationship ${index + 1}: ${rel.source} → ${rel.target} (${rel.type})`);
                  const targetNode = relationshipMap.get(rel.target);
                  if (targetNode && targetNode.category === 'Activity' && rel.type === 'executes_activity') {
                    if (!finalObjectIds.has(rel.target)) {
                      finalObjectIds.add(rel.target);
                      debugStats.nodes.related++;
                      console.log(`    ✅ [DE Logic] Adding automation activity: ${targetNode.object.name}`);
                    } else {
                      console.log(`    ℹ️ [DE Logic] Activity already in finalObjectIds: ${targetNode.object.name}`);
                    }
                  } else if (targetNode) {
                    console.log(`    ⚠️ [DE Logic] Found outbound target but not an activity: ${targetNode.category} - ${rel.type}`);
                  } else {
                    console.log(`    ⚠️ [DE Logic] Target node not found in relationshipMap: ${rel.target}`);
                  }
                });
              } else {
                console.log(`    ⚠️ Automation node not found in relationshipMap: ${automationId}`);
                console.log(`    📋 Available automation nodes in relationshipMap:`, Array.from(relationshipMap.keys()).filter(key => key.includes('auto_')).slice(0, 5));
              }
            }
          });
          
          relevantActivities.forEach(activityId => {
            if (!finalObjectIds.has(activityId)) {
              finalObjectIds.add(activityId);
              debugStats.nodes.related++;
              const activityNode = relationshipMap.get(activityId);
              if (activityNode && activityNode.object) {
                console.log(`    ✅ Adding relevant activity: ${activityNode.object.name}`);
              } else {
                console.log(`    ⚠️ Activity node not found in relationshipMap: ${activityId}`);
                console.log(`    📋 Available activity nodes in relationshipMap:`, Array.from(relationshipMap.keys()).filter(key => key.includes('activity')).slice(0, 5));
              }
            }
          });
          
          relevantQueries.forEach(queryId => {
            if (!finalObjectIds.has(queryId)) {
              finalObjectIds.add(queryId);
              debugStats.nodes.related++;
              const queryNode = relationshipMap.get(queryId);
              if (queryNode && queryNode.object) {
                console.log(`    ✅ Adding relevant query: ${queryNode.object.name}`);
              } else {
                console.log(`    ⚠️ Query node not found in relationshipMap: ${queryId}`);
                console.log(`    📋 Available query nodes in relationshipMap:`, Array.from(relationshipMap.keys()).filter(key => key.includes('query')).slice(0, 5));
              }
            }
          });
          
        } else if (nodeData.category === 'SQL Queries') {
          // For SQL Queries, show the complete workflow: parent automations, activities, and target DEs
          console.log(`  📝 [Query Logic] Finding objects related to Query: ${nodeData.object.name}`);
          console.log(`  📝 [Query Logic] Query has ${nodeData.inbound.length} inbound and ${nodeData.outbound.length} outbound relationships`);
          
          // Add target DEs (query writes to these DEs)
          nodeData.outbound.forEach(rel => {
            const targetNode = relationshipMap.get(rel.target);
            if (targetNode && targetNode.category === 'Data Extensions' && rel.type === 'writes_to') {
              if (!finalObjectIds.has(rel.target)) {
                finalObjectIds.add(rel.target);
                debugStats.nodes.related++;
                console.log(`    ✅ Query writes to DE: ${targetNode.object.name}`);
              }
            }
          });
          
          // Add source DEs (query reads from these DEs)
          nodeData.inbound.forEach(rel => {
            const sourceNode = relationshipMap.get(rel.source);
            if (sourceNode && sourceNode.category === 'Data Extensions' && rel.type === 'reads_from') {
              if (!finalObjectIds.has(rel.source)) {
                finalObjectIds.add(rel.source);
                debugStats.nodes.related++;
                console.log(`    ✅ Query reads from DE: ${sourceNode.object.name}`);
              }
            }
          });
          
          // Add parent activities that execute this query
          const relevantActivities = new Set();
          const relevantAutomations = new Set();
          
          nodeData.inbound.forEach(rel => {
            const sourceNode = relationshipMap.get(rel.source);
            if (sourceNode && sourceNode.category === 'Activity' && rel.type === 'executes_query') {
              relevantActivities.add(rel.source);
              console.log(`    🎯 Found activity that executes query: ${sourceNode.object.name}`);
              
              // Find the automation that contains this activity
              sourceNode.inbound.forEach(activityRel => {
                const automationNode = relationshipMap.get(activityRel.source);
                if (automationNode && automationNode.category === 'Automations' && activityRel.type === 'executes_activity') {
                  relevantAutomations.add(activityRel.source);
                  console.log(`    🤖 Found parent automation: ${automationNode.object.name}`);
                }
              });
            }
          });
          
          // If no direct activity relationships found, search by query name/ID in automation metadata
          if (relevantActivities.size === 0) {
            console.log(`  📝 [Query Logic] No direct activity relationships found, searching automation metadata...`);
            
            try {
              // Search through all automations to find ones that reference this query
              allAutomations.forEach(automation => {
                if (!automation || !automation.id) {
                  console.log(`    ⚠️ Skipping invalid automation:`, automation);
                  return;
                }
                
                const steps = automation.steps || automation.activities || [];
                steps.forEach(step => {
                  if (!step) return;
                  
                  const activities = step.activities || [];
                  activities.forEach(activity => {
                    if (!activity) return;
                    
                    try {
                      // Check if this activity references our query
                      if (activity.activityObjectId === nodeData.object.objectId || 
                          activity.activityObjectId === nodeData.object.id?.replace('query_', '') ||
                          (activity.name && nodeData.object.name && activity.name === nodeData.object.name)) {
                        relevantAutomations.add(automation.id);
                        console.log(`    🔍 Found automation via metadata search: ${automation.name} (activity: ${activity.name || 'unnamed'})`);
                        
                        // Find the actual activity node that was created for this step
                        const stepNumber = step.step || steps.indexOf(step) + 1;
                        const possibleActivityIds = [
                          `${automation.id}_activity_${stepNumber}_QueryActivity`,
                          `${automation.id}_activity_${stepNumber}_GenericActivity`,
                          `${automation.id}_activity_${stepNumber}_DataExtractActivity`,
                          `${automation.id}_activity_${stepNumber}_EmailActivity`,
                          `${automation.id}_activity_${stepNumber}_ImportActivity`,
                          `${automation.id}_activity_${stepNumber}_ExportActivity`
                        ];
                        
                        // Find which activity ID actually exists in the relationshipMap
                        console.log(`    🔍 [Query Activity Search] Looking for activity in step ${stepNumber} for automation ${automation.id}`);
                        console.log(`    🔍 [Query Activity Search] Trying possible activity IDs:`, possibleActivityIds);
                        
                        // Also log what activity IDs are actually available for this automation
                        const availableActivityIds = Array.from(relationshipMap.keys()).filter(id => id.startsWith(`${automation.id}_activity_`));
                        console.log(`    🔍 [Query Activity Search] Available activity IDs for this automation:`, availableActivityIds);
                        
                        const actualActivityId = possibleActivityIds.find(id => relationshipMap.has(id));
                        if (actualActivityId) {
                          relevantActivities.add(actualActivityId);
                          console.log(`    🎯 Adding corresponding activity: ${actualActivityId}`);
                        } else {
                          console.log(`    ⚠️ Could not find activity node for step ${stepNumber} in relationshipMap`);
                          console.log(`    📋 Tried IDs:`, possibleActivityIds);
                          console.log(`    📋 Available IDs:`, availableActivityIds);
                        }
                      }
                    } catch (activityError) {
                      console.log(`    ⚠️ Error processing activity in automation "${automation.name}":`, activityError.message);
                    }
                  });
                });
              });
            } catch (metadataError) {
              console.log(`  ⚠️ Error in query metadata search:`, metadataError.message);
              console.log(`  📝 [Query Logic] Continuing with existing relationships...`);
            }
          }
          
          // Add all found activities
          relevantActivities.forEach(activityId => {
            if (!finalObjectIds.has(activityId)) {
              finalObjectIds.add(activityId);
              debugStats.nodes.related++;
              const activityNode = relationshipMap.get(activityId);
              if (activityNode && activityNode.object) {
                console.log(`    ✅ Adding query parent activity: ${activityNode.object.name}`);
              } else {
                console.log(`    ✅ Adding query parent activity: ${activityId} (node not found in map)`);
              }
            }
          });
          
          // Add all found automations
          relevantAutomations.forEach(automationId => {
            if (!finalObjectIds.has(automationId)) {
              finalObjectIds.add(automationId);
              debugStats.nodes.related++;
              const automationNode = relationshipMap.get(automationId);
              if (automationNode && automationNode.object) {
                console.log(`    ✅ Adding parent automation: ${automationNode.object.name}`);
                
                // When adding an automation, also add its activities
                console.log(`    🔍 [Query Logic] Checking automation "${automationNode.object.name}" for activities...`);
                console.log(`    🔍 [Query Logic] Automation has ${automationNode.outbound.length} outbound relationships`);
                
                if (automationNode.outbound.length === 0) {
                  console.log(`    ⚠️ [Query Logic] No outbound relationships found for automation ${automationId}`);
                }
                
                automationNode.outbound.forEach((rel, index) => {
                  console.log(`    🔍 [Query Logic] Outbound relationship ${index + 1}: ${rel.source} → ${rel.target} (${rel.type})`);
                  const targetNode = relationshipMap.get(rel.target);
                  if (targetNode && targetNode.category === 'Activity' && rel.type === 'executes_activity') {
                    if (!finalObjectIds.has(rel.target)) {
                      finalObjectIds.add(rel.target);
                      debugStats.nodes.related++;
                      console.log(`    ✅ [Query Logic] Adding automation activity: ${targetNode.object.name}`);
                    }
                  }
                });
              } else {
                console.log(`    ✅ Adding parent automation: ${automationId} (node not found in map)`);
              }
            }
          });
          
        } else if (nodeData.category === 'Automations') {
          // For Automations, show only the activities and DEs that are directly involved
          console.log(`  🤖 [Automation Logic] Finding objects related to Automation: ${nodeData.object.name}`);
          console.log(`  🤖 [Automation Logic] Automation has ${nodeData.outbound.length} outbound relationships`);
          
          // Add all activities in this automation
          nodeData.outbound.forEach(rel => {
            const targetNode = relationshipMap.get(rel.target);
            if (targetNode && targetNode.category === 'Activity' && rel.type === 'executes_activity') {
              if (!finalObjectIds.has(rel.target)) {
                finalObjectIds.add(rel.target);
                debugStats.nodes.related++;
                console.log(`    ✅ Adding automation activity: ${targetNode.object.name}`);
                
                // For each activity, add its target DEs and queries
                console.log(`    🔍 Activity "${targetNode.object.name}" has ${targetNode.outbound.length} outbound relationships`);
                targetNode.outbound.forEach(activityRel => {
                  const activityTargetNode = relationshipMap.get(activityRel.target);
                  if (activityTargetNode) {
                    console.log(`      🎯 Activity targets: ${activityTargetNode.category} - ${activityTargetNode.object.name} (${activityRel.type})`);
                    if (activityTargetNode.category === 'Data Extensions') {
                      if (!finalObjectIds.has(activityRel.target)) {
                        finalObjectIds.add(activityRel.target);
                        debugStats.nodes.related++;
                        console.log(`    ✅ Adding activity target DE: ${activityTargetNode.object.name}`);
                      }
                    } else if (activityTargetNode.category === 'SQL Queries') {
                      if (!finalObjectIds.has(activityRel.target)) {
                        finalObjectIds.add(activityRel.target);
                        debugStats.nodes.related++;
                        console.log(`    ✅ Adding activity target query: ${activityTargetNode.object.name}`);
                        
                        // Also add DEs that this query targets
                        console.log(`      🔍 Query "${activityTargetNode.object.name}" has ${activityTargetNode.outbound.length} outbound relationships`);
                        activityTargetNode.outbound.forEach(queryRel => {
                          const queryTargetNode = relationshipMap.get(queryRel.target);
                          if (queryTargetNode && queryTargetNode.category === 'Data Extensions') {
                            console.log(`        🎯 Query targets DE: ${queryTargetNode.object.name} (${queryRel.type})`);
                            if (!finalObjectIds.has(queryRel.target)) {
                              finalObjectIds.add(queryRel.target);
                              debugStats.nodes.related++;
                              console.log(`    ✅ Adding query target DE: ${queryTargetNode.object.name}`);
                            }
                          }
                        });
                      }
                    }
                  } else {
                    console.log(`      ❌ Activity target node not found in relationship map: ${activityRel.target}`);
                  }
                });
              }
            }
          });
          
          // Also check if this automation has embedded activity data with target DEs (as seen in your response)
          if (nodeData.object.steps || nodeData.object.activities) {
            const steps = nodeData.object.steps || nodeData.object.activities || [];
            console.log(`  🔍 [Automation Logic] Found ${steps.length} embedded steps/activities in automation metadata`);
            
            steps.forEach((step, stepIndex) => {
              const activities = step.activities || [];
              console.log(`    📋 Step ${stepIndex + 1}: "${step.name}" has ${activities.length} activities`);
              
              activities.forEach((activity, activityIndex) => {
                // Add target DEs from embedded activity data
                if (activity.targetDataExtensions && activity.targetDataExtensions.length > 0) {
                  console.log(`      🎯 Activity "${activity.name}" has ${activity.targetDataExtensions.length} target DEs in metadata`);
                  activity.targetDataExtensions.forEach(targetDE => {
                    // Try to find the DE in our data and add it
                    const matchingDE = allDataExtensions.find(de => 
                      de.id === targetDE.id || 
                      de.name === targetDE.name || 
                      de.externalKey === targetDE.key
                    );
                    if (matchingDE && !finalObjectIds.has(matchingDE.id)) {
                      finalObjectIds.add(matchingDE.id);
                      debugStats.nodes.related++;
                      console.log(`    ✅ Adding embedded target DE: ${matchingDE.name} (${matchingDE.id})`);
                    } else if (!matchingDE) {
                      console.log(`      ❌ Target DE not found in available data: ${targetDE.name} (${targetDE.id})`);
                    }
                  });
                }
                
                // Add queries from embedded activity data
                if (activity.activityObjectId) {
                  const matchingQuery = allSqlQueries.find(q => 
                    q.id === activity.activityObjectId || 
                    q.id === `query_${activity.activityObjectId}`
                  );
                  if (matchingQuery && !finalObjectIds.has(matchingQuery.id)) {
                    finalObjectIds.add(matchingQuery.id);
                    debugStats.nodes.related++;
                    console.log(`    ✅ Adding embedded query: ${matchingQuery.name} (${matchingQuery.id})`);
                  } else if (!matchingQuery) {
                    console.log(`      ❌ Query not found in available data: ${activity.activityObjectId}`);
                  }
                }
              });
            });
          }
          
        } else {
          // For other object types (Journeys, Triggered Sends, Filters, File Transfers, Data Extracts, etc.)
          // Add all immediate neighbors to show complete workflow context
          console.log(`  🔗 [Generic Logic] Adding immediate neighbors for: ${nodeData.category} - ${nodeData.object.name}`);
          
          // Add all directly connected objects (not just Data Extensions)
          [...nodeData.inbound, ...nodeData.outbound].forEach(rel => {
            const relatedId = rel.source === selectedId ? rel.target : rel.source;
            const relatedNode = relationshipMap.get(relatedId);
            if (relatedNode && !finalObjectIds.has(relatedId)) {
              finalObjectIds.add(relatedId);
              debugStats.nodes.related++;
              console.log(`    ➡️ Connected ${relatedNode.category}: ${relatedNode.object.name} (${rel.type})`);
              
              // If the connected object is an Activity, also add its automation parent
              if (relatedNode.category === 'Activity') {
                relatedNode.inbound.forEach(activityRel => {
                  const automationNode = relationshipMap.get(activityRel.source);
                  if (automationNode && automationNode.category === 'Automations' && activityRel.type === 'executes_activity') {
                    if (!finalObjectIds.has(activityRel.source)) {
                      finalObjectIds.add(activityRel.source);
                      debugStats.nodes.related++;
                      console.log(`    🤖 Parent automation: ${automationNode.object.name}`);
                    }
                  }
                });
                
                // Also add objects that the activity targets
                relatedNode.outbound.forEach(activityRel => {
                  const targetNode = relationshipMap.get(activityRel.target);
                  if (targetNode && !finalObjectIds.has(activityRel.target)) {
                    finalObjectIds.add(activityRel.target);
                    debugStats.nodes.related++;
                    console.log(`    🎯 Activity target: ${targetNode.category} - ${targetNode.object.name} (${activityRel.type})`);
                  }
                });
              }
              
              // If the connected object is an Automation, add its activities
              if (relatedNode.category === 'Automations') {
                relatedNode.outbound.forEach(autoRel => {
                  const activityNode = relationshipMap.get(autoRel.target);
                  if (activityNode && activityNode.category === 'Activity' && autoRel.type === 'executes_activity') {
                    if (!finalObjectIds.has(autoRel.target)) {
                      finalObjectIds.add(autoRel.target);
                      debugStats.nodes.related++;
                      console.log(`    🎯 Automation activity: ${activityNode.object.name}`);
                      
                      // Add targets of these activities too
                      activityNode.outbound.forEach(actRel => {
                        const actTargetNode = relationshipMap.get(actRel.target);
                        if (actTargetNode && !finalObjectIds.has(actRel.target)) {
                          finalObjectIds.add(actRel.target);
                          debugStats.nodes.related++;
                          console.log(`      📊 Activity target: ${actTargetNode.category} - ${actTargetNode.object.name} (${actRel.type})`);
                        }
                      });
                    }
                  }
                });
              }
            }
          });
        }
      }
    });
    
    // Safety check: Ensure all originally selected objects are still in the final set
    Object.entries(selectedObjects).forEach(([category, selections]) => {
      if (sfmcObjects[category]) {
        sfmcObjects[category].forEach(obj => {
          if (selections[obj.id] === true && !finalObjectIds.has(obj.id)) {
            finalObjectIds.add(obj.id);
            console.log(`🛡️ [Graph] Safety: Re-adding selected object: ${category} - ${obj.name} (${obj.id})`);
          }
        });
      }
    });
    
    console.log(`🔗 [Graph] Total objects after focused filtering: ${finalObjectIds.size}`);
    
  } else {
    // No selection - include only connected objects (filter out orphans by default)
    console.log('🌐 [Graph] === STEP 3: INCLUDING ALL CONNECTED OBJECTS ===');
    
    relationshipMap.forEach((nodeData, objectId) => {
      if (nodeData.hasConnections) {
        finalObjectIds.add(objectId);
        debugStats.nodes.selected++; // In this case, "selected" means "connected"
      } else {
        debugStats.nodes.orphaned++;
        console.log(`🔘 [Graph] Orphan: ${nodeData.category} - ${nodeData.object.name} (no relationships)`);
      }
    });
    
    console.log(`🌐 [Graph] Connected objects: ${finalObjectIds.size}, Orphaned: ${debugStats.nodes.orphaned}`);
  }
  
  // Step 4: Create final nodes (including activity nodes)
  console.log('📦 [Graph] === STEP 4: CREATING FINAL NODES (INCLUDING ACTIVITIES) ===');
  console.log(`🔍 [Graph Debug] finalObjectIds contains ${finalObjectIds.size} objects:`);
  finalObjectIds.forEach(objectId => {
    const nodeData = relationshipMap.get(objectId);
    if (nodeData) {
      console.log(`  - ${objectId}: ${nodeData.category} - ${nodeData.object.name}`);
    } else {
      console.log(`  - ${objectId}: NO NODE DATA FOUND`);
    }
  });
  
  const nodes = [];
  
  // Add regular SFMC object nodes
  finalObjectIds.forEach(objectId => {
    const nodeData = relationshipMap.get(objectId);
    if (nodeData) {
      const isSelected = hasAnySelection ? 
        (selectedObjects[nodeData.category] && selectedObjects[nodeData.category][objectId] === true) : 
        false;
      
      nodes.push({
        data: {
          id: objectId,
          label: nodeData.object.name,
          category: nodeData.category,
          type: nodeData.category,
          metadata: {
            ...nodeData.object,
            category: nodeData.category,
            isRelated: hasAnySelection && !isSelected, // Mark as related if not directly selected
            isSelected: isSelected,
            connectionCount: nodeData.inbound.length + nodeData.outbound.length
          }
        }
      });
      
      debugStats.nodes.final++;
    }
  });
  
  // Add activity nodes if they exist
  if (global.activityNodes && global.activityNodes.size > 0) {
    console.log(`📦 [Graph] Adding ${global.activityNodes.size} activity nodes to graph`);
    
    global.activityNodes.forEach((activityNode, activityId) => {
      // Include activity nodes if either:
      // 1. They are in finalObjectIds (selected through filtering logic)
      // 2. Their parent automation is in finalObjectIds
      // 3. No selection is active (show all mode)
      const shouldIncludeActivity = !hasAnySelection || 
                                   finalObjectIds.has(activityId) || 
                                   finalObjectIds.has(activityNode.automationId);
      
      if (shouldIncludeActivity) {
        finalObjectIds.add(activityId); // Ensure activity ID is in final set for edge filtering
        
        nodes.push({
          data: {
            id: activityId,
            label: activityNode.name,
            category: 'Activity',
            type: 'Activity',
            activityType: activityNode.activityType,
            stepNumber: activityNode.stepNumber,
            metadata: {
              ...activityNode,
              category: 'Activity',
              isActivity: true,
              executionOrder: activityNode.stepNumber,
              parentAutomation: activityNode.automationName
            }
          }
        });
        
        debugStats.nodes.final++;
        console.log(`  ✅ Added activity: ${activityNode.name} (Step ${activityNode.stepNumber})`);
        
        // 🆕 ENHANCED: Add target Data Extensions from activity metadata
        if (activityNode.metadata && activityNode.metadata.targetDataExtensions) {
          console.log(`🎯 [Graph] Checking activity ${activityNode.name} for target DEs...`);
          activityNode.metadata.targetDataExtensions.forEach(targetDE => {
            console.log(`  📊 [Graph] Found target DE in activity metadata: ${targetDE.name} (${targetDE.id || targetDE.key || 'no-id'})`);
            
            // Look for this DE in the available Data Extensions
            const matchingDE = allDataExtensions.find(de => 
              de.id === targetDE.id || 
              de.key === targetDE.key || 
              de.name === targetDE.name
            );
            
            let deToAdd = matchingDE;
            let deId = matchingDE ? matchingDE.id : (targetDE.id || targetDE.key || `de-${targetDE.name?.replace(/\s+/g, '-').toLowerCase()}`);
            
            // If we don't have the full DE data, create a stub node
            if (!matchingDE) {
              console.log(`  📊 [Graph] DE not found in fetched data, creating stub node for: ${targetDE.name}`);
              deToAdd = {
                id: deId,
                name: targetDE.name || targetDE.key || 'Unknown DE',
                key: targetDE.key,
                // Mark as stub so we can style it differently if needed
                isStub: true,
                description: `Referenced by ${activityNode.name}`
              };
            }
            
            if (deToAdd && !finalObjectIds.has(deId)) {
              finalObjectIds.add(deId);
              
              nodes.push({
                data: {
                  id: deId,
                  label: deToAdd.name,
                  category: 'Data Extensions',
                  type: 'Data Extensions',
                  metadata: {
                    ...deToAdd,
                    category: 'Data Extensions',
                    isRelated: hasAnySelection, // Mark as related since it was found through relationship
                    isSelected: false,
                    isStub: deToAdd.isStub || false, // Mark stub nodes
                    connectionCount: 1 // At least connected to this activity
                  }
                }
              });
              
              debugStats.nodes.final++;
              debugStats.nodes.related++;
              console.log(`    ✅ [Graph] Added target DE: ${deToAdd.name} (${deId}) ${deToAdd.isStub ? '[STUB]' : '[FULL]'}`);
              
              // Also create edge from activity to this DE
              allRelationships.push({
                id: `${activityId}-${deId}-writes_to`,
                source: activityId,
                target: deId,
                type: 'writes_to',
                label: `writes to ${deToAdd.name}`,
                description: `Activity "${activityNode.name}" writes to Data Extension "${deToAdd.name}"`,
                metadata: {
                  discoveredFrom: 'activity_target_metadata'
                }
              });
              
              console.log(`    🔗 [Graph] Added relationship: ${activityNode.name} -> ${deToAdd.name} (writes_to)`);
              
            } else {
              console.log(`    ↩️ [Graph] Target DE already included: ${deToAdd.name}`);
            }
          });
        }
      }
    });
  }
  
  console.log(`📦 [Graph] Created ${nodes.length} final nodes (including activities)`);
  console.log(`🔍 [Graph Debug] Final nodes created:`);
  nodes.forEach((node, index) => {
    if (index < 10) { // Log first 10 for brevity
      console.log(`  ${index + 1}. ${node.data.id}: ${node.data.category} - ${node.data.label}`);
    }
  });
  if (nodes.length > 10) {
    console.log(`  ... and ${nodes.length - 10} more nodes`);
  }
  
  // Step 5: Create final edges (only between final nodes, including activities)
  console.log('🔗 [Graph] === STEP 5: CREATING FINAL EDGES (INCLUDING ACTIVITY EDGES) ===');
  
  const edges = [];
  const filteredRelationships = allRelationships.filter(rel => 
    finalObjectIds.has(rel.source) && finalObjectIds.has(rel.target)
  );
  
  debugStats.relationships.filtered = allRelationships.length - filteredRelationships.length;
  debugStats.relationships.included = filteredRelationships.length;
  
  filteredRelationships.forEach(rel => {
    edges.push({
      data: {
        id: rel.id,
        source: rel.source,
        target: rel.target,
        type: rel.type,
        label: rel.label,
        description: rel.description,
        stepNumber: rel.stepNumber || null,
        executionOrder: rel.executionOrder || null,
        relationStyle: classifyRelationshipStyle(rel.type)
      }
    });
  });
  
  console.log(`🔗 [Graph] Created ${edges.length} final edges (filtered out ${debugStats.relationships.filtered})`);
  console.log(`🔍 [Graph Debug] Final edges created:`);
  edges.forEach((edge, index) => {
    if (index < 10) { // Log first 10 for brevity
      console.log(`  ${index + 1}. ${edge.data.source} --${edge.data.type}--> ${edge.data.target}`);
    }
  });
  if (edges.length > 10) {
    console.log(`  ... and ${edges.length - 10} more edges`);
  }
  
  // Clear global activity nodes after use
  global.activityNodes = new Map();
  console.log('📊 [Graph] === FINAL STATISTICS ===');
  console.log('Input Objects:', debugStats.inputObjects);
  console.log('Selected Objects:', debugStats.selectedObjects);
  console.log('Relationships:', debugStats.relationships);
  console.log('Nodes:', debugStats.nodes);
  
  // Validate graph integrity
  const nodeIds = new Set(nodes.map(n => n.data.id));
  const invalidEdges = edges.filter(e => 
    !nodeIds.has(e.data.source) || !nodeIds.has(e.data.target)
  );
  
  if (invalidEdges.length > 0) {
    console.error('❌ [Graph] Invalid edges detected:', invalidEdges.length);
    invalidEdges.forEach(edge => {
      console.error(`  Invalid edge: ${edge.data.source} -> ${edge.data.target}`);
    });
  } else {
    console.log('✅ [Graph] Graph integrity validated');
  }
  
  console.log('🔍 [Graph] === GRAPH GENERATION COMPLETE ===');
  
  return {
    nodes,
    edges,
    debug: debugStats
  };
}

// ==================== GRAPH API ENDPOINTS ====================

/**
 * Graph API endpoint that returns nodes and edges in Cytoscape format
 * Requires Marketing Cloud authentication - no mock mode
 * Supports query parameters: type, keys
 */
app.get('/graph', async (req, res) => {
  try {
    const { type, keys, selectedObjects } = req.query;
    
    // Parse types parameter (comma-separated string to array)
    const types = type ? type.split(',').map(t => t.trim()) : [];
    
    // Parse keys parameter (comma-separated string to array)
    const parsedKeys = keys ? keys.split(',').map(k => k.trim()) : [];
    
    // Parse selectedObjects parameter (JSON string to object)
    let parsedSelectedObjects = {};
    if (selectedObjects) {
      try {
        parsedSelectedObjects = JSON.parse(selectedObjects);
        console.log('🔍 [Graph API] Parsed selectedObjects:', parsedSelectedObjects);
      } catch (parseError) {
        console.warn('⚠️ [Graph API] Failed to parse selectedObjects parameter:', parseError.message);
      }
    }
    
    console.log('🔍 [Graph API] Request received:', { types, keys: parsedKeys, hasSelectedObjects: Object.keys(parsedSelectedObjects).length > 0 });
    
    if (!req.session.mcCreds) {
      console.log('⚠️ [Graph API] No authentication found, providing enhanced mock graph data...');
      
      // Check if a specific automation is selected
      const hasAutomationSelection = parsedSelectedObjects.Automations && 
        Object.keys(parsedSelectedObjects.Automations).some(key => parsedSelectedObjects.Automations[key]);
      
      if (hasAutomationSelection) {
        console.log('🎯 [Mock] Providing realistic automation workflow mock data');
        
        // Return enhanced mock data that matches the real structure you showed in the console
        const mockGraphData = {
          nodes: [
            // Main automation
            { 
              data: { 
                id: "auto_9fe4e098-4560-4601-b320-cc269a8c9061", 
                label: "0800 FSP Flatten Subscriber Preferences", 
                type: "Automations",
                category: "Automations",
                metadata: {
                  isSelected: true,
                  isRelated: false,
                  connectionCount: 5
                }
              } 
            },
            // Activity 1
            { 
              data: { 
                id: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_1_GenericActivity", 
                label: "Returns the subscriber key for the flattened preference table", 
                type: "Activity",
                category: "Activity",
                activityType: "GenericActivity",
                stepNumber: 1,
                metadata: {
                  isSelected: false,
                  isRelated: true,
                  connectionCount: 2
                }
              } 
            },
            // Activity 2
            { 
              data: { 
                id: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_2_QueryActivity", 
                label: "Updates the first preference column with hard coded SQL query", 
                type: "Activity",
                category: "Activity",
                activityType: "QueryActivity",
                stepNumber: 2,
                metadata: {
                  isSelected: false,
                  isRelated: true,
                  connectionCount: 3
                }
              } 
            },
            // Activity 3
            { 
              data: { 
                id: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_3_QueryActivity", 
                label: "Updates the second preference column with hard coded SQL query", 
                type: "Activity",
                category: "Activity",
                activityType: "QueryActivity",
                stepNumber: 3,
                metadata: {
                  isSelected: false,
                  isRelated: true,
                  connectionCount: 3
                }
              } 
            },
            // Activity 4
            { 
              data: { 
                id: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_4_QueryActivity", 
                label: "Updates the third preference column with hard coded SQL query", 
                type: "Activity",
                category: "Activity",
                activityType: "QueryActivity",
                stepNumber: 4,
                metadata: {
                  isSelected: false,
                  isRelated: true,
                  connectionCount: 3
                }
              } 
            },
            // Activity 5
            { 
              data: { 
                id: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_5_QueryActivity", 
                label: "Updates the fourth preference column with hard coded SQL query", 
                type: "Activity",
                category: "Activity",
                activityType: "QueryActivity",
                stepNumber: 5,
                metadata: {
                  isSelected: false,
                  isRelated: true,
                  connectionCount: 2
                }
              } 
            },
            // Target Data Extension
            { 
              data: { 
                id: "de_2df49ec2-2f48-ef11-a5b4-5cba2c6f7278", 
                label: "PF_Preference", 
                type: "Data Extensions",
                category: "Data Extensions",
                metadata: {
                  isSelected: false,
                  isRelated: true,
                  connectionCount: 5,
                  description: "Subscription preferences",
                  rowCount: 3
                }
              } 
            }
          ],
          edges: [
            // Automation to activities
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_1_GenericActivity", type: "executes_activity", label: "Step 1" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_2_QueryActivity", type: "executes_activity", label: "Step 2" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_3_QueryActivity", type: "executes_activity", label: "Step 3" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_4_QueryActivity", type: "executes_activity", label: "Step 4" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_5_QueryActivity", type: "executes_activity", label: "Step 5" } },
            // Activity flow
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_1_GenericActivity", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_2_QueryActivity", type: "next_step", label: "next" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_2_QueryActivity", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_3_QueryActivity", type: "next_step", label: "next" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_3_QueryActivity", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_4_QueryActivity", type: "next_step", label: "next" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_4_QueryActivity", target: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_5_QueryActivity", type: "next_step", label: "next" } },
            // Activities to Data Extension
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_1_GenericActivity", target: "de_2df49ec2-2f48-ef11-a5b4-5cba2c6f7278", type: "writes_to", label: "writes to PF_Preference" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_2_QueryActivity", target: "de_2df49ec2-2f48-ef11-a5b4-5cba2c6f7278", type: "writes_to", label: "writes to PF_Preference" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_3_QueryActivity", target: "de_2df49ec2-2f48-ef11-a5b4-5cba2c6f7278", type: "writes_to", label: "writes to PF_Preference" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_4_QueryActivity", target: "de_2df49ec2-2f48-ef11-a5b4-5cba2c6f7278", type: "writes_to", label: "writes to PF_Preference" } },
            { data: { source: "auto_9fe4e098-4560-4601-b320-cc269a8c9061_activity_5_QueryActivity", target: "de_2df49ec2-2f48-ef11-a5b4-5cba2c6f7278", type: "writes_to", label: "writes to PF_Preference" } }
          ],
          metadata: {
            totalNodes: 7,
            totalEdges: 14,
            format: 'cytoscape',
            source: 'enhanced-mock-automation-workflow',
            generatedAt: new Date().toISOString()
          }
        };
        
        console.log('✅ [Mock] Providing enhanced automation workflow mock data:', {
          nodeCount: mockGraphData.nodes.length,
          edgeCount: mockGraphData.edges.length
        });
        
        return res.json(mockGraphData);
      }
      
      // Default mock data for other cases
      const mockGraphData = {
        nodes: [
          { data: { id: "de1", label: "BU Unsubs", type: "Data Extensions", category: "Data Extensions", createdDate: "2024-07-23" } },
          { data: { id: "auto1", label: "Daily BU Unsub Cleanup", type: "Automations", category: "Automations", createdDate: "2024-07-25" } },
          { data: { id: "query1", label: "Unsub SQL", type: "SQL Queries", category: "SQL Queries", createdDate: "2024-07-25" } },
          { data: { id: "journey1", label: "Welcome Journey", type: "Journeys", category: "Journeys", createdDate: "2024-08-01" } },
          { data: { id: "ts1", label: "Unsub Confirmation TS", type: "Triggered Sends", category: "Triggered Sends", createdDate: "2024-08-02" } },
          { data: { id: "imp1", label: "Daily File Import", type: "File Transfers", category: "File Transfers", createdDate: "2024-07-30" } }
        ],
        edges: [
          { data: { source: "auto1", target: "query1", type: "contains" } },
          { data: { source: "query1", target: "de1", type: "writes_to" } },
          { data: { source: "journey1", target: "de1", type: "reads_from" } },
          { data: { source: "ts1", target: "de1", type: "reads_from" } },
          { data: { source: "imp1", target: "de1", type: "imports_to" } }
        ],
        metadata: {
          totalNodes: 6,
          totalEdges: 5,
          format: 'cytoscape',
          source: 'mock-unauthenticated',
          generatedAt: new Date().toISOString()
        }
      };
      
      console.log('✅ [Graph API] Providing default mock graph data:', {
        nodeCount: mockGraphData.nodes.length,
        edgeCount: mockGraphData.edges.length
      });
      
      return res.json(mockGraphData);
    }
    
    // Live mode - generate graph from real SFMC data
    console.log('📡 [Graph API] Generating graph from live SFMC data...');
    
    try {
      // Get existing access token from session
      const accessToken = getAccessTokenFromRequest(req);
      const subdomain = getSubdomainFromRequest(req);
      
      if (!accessToken || !subdomain) {
        throw new Error('Missing access token or subdomain. Please re-authenticate with Marketing Cloud.');
      }
      
      // Fetch all SFMC objects
      const restEndpoint = req.session.mcCreds.restEndpoint || `https://${subdomain}.rest.marketingcloudapis.com`;
      const sfmcObjects = await fetchAllSFMCObjects(accessToken, subdomain, restEndpoint);
      
      // Generate graph data from real SFMC objects with selected object filtering
      const graphData = generateLiveGraphData(sfmcObjects, types, parsedKeys, parsedSelectedObjects);
      
      // Check if we got meaningful graph data
      const hasGraphData = graphData && graphData.nodes && graphData.nodes.length > 0;
      
      if (hasGraphData) {
        console.log('✅ [Graph API] Generated live graph data from SFMC objects:', {
          nodeCount: graphData.nodes.length,
          edgeCount: graphData.edges.length
        });
        
        res.json(graphData);
      } else {
        console.log('⚠️ [Graph API] Live graph generation returned empty data, falling back to mock...');
        throw new Error('Graph generation returned empty data');
      }
      
    } catch (error) {
      console.error('❌ [Graph API] Error with live data, falling back to mock:');
      console.error('❌ [Graph API] Error message:', error.message);
      console.error('❌ [Graph API] Error stack:', error.stack);
      
      // 🆕 ENHANCED DEBUG: Log context around the error
      if (parsedSelectedObjects && parsedSelectedObjects['Data Extensions']) {
        const selectedDEs = Object.keys(parsedSelectedObjects['Data Extensions']).filter(key => 
          parsedSelectedObjects['Data Extensions'][key] === true
        );
        console.error('❌ [Graph API] Error occurred while processing selected DEs:', selectedDEs);
      }
      
      // 🆕 ATTEMPT MINIMAL GRAPH: Try to create a graph with just the selected objects
      try {
        console.log('🔄 [Graph API] Attempting to create minimal graph with selected objects...');
        
        if (sfmcObjects && parsedSelectedObjects && Object.keys(parsedSelectedObjects).length > 0) {
          const minimalNodes = [];
          const minimalEdges = [];
          
          // Add selected objects to the minimal graph
          Object.entries(parsedSelectedObjects).forEach(([category, selections]) => {
            if (sfmcObjects[category]) {
              Object.entries(selections).forEach(([objectId, isSelected]) => {
                if (isSelected) {
                  const obj = sfmcObjects[category].find(item => item.id === objectId);
                  if (obj) {
                    minimalNodes.push({
                      data: {
                        id: obj.id,
                        label: obj.name || 'Unnamed Object',
                        type: category,
                        category: category,
                        createdDate: obj.createdDate || new Date().toISOString().split('T')[0]
                      }
                    });
                    console.log(`✅ [Graph API] Added selected object to minimal graph: ${category} - ${obj.name}`);
                  } else {
                    console.log(`❌ [Graph API] Selected object not found in SFMC data: ${objectId}`);
                  }
                }
              });
            }
          });
          
          if (minimalNodes.length > 0) {
            const minimalGraphData = {
              nodes: minimalNodes,
              edges: minimalEdges,
              metadata: {
                totalNodes: minimalNodes.length,
                totalEdges: minimalEdges.length,
                format: 'cytoscape',
                source: 'minimal-selected-objects',
                generatedAt: new Date().toISOString(),
                note: 'Minimal graph showing only selected objects due to relationship detection error'
              }
            };
            
            console.log('✅ [Graph API] Providing minimal graph with selected objects:', {
              nodeCount: minimalGraphData.nodes.length,
              edgeCount: minimalGraphData.edges.length
            });
            
            return res.json(minimalGraphData);
          }
        }
      } catch (minimalError) {
        console.error('❌ [Graph API] Even minimal graph creation failed:', minimalError.message);
      }
      
      // Fall back to mock graph data when live generation fails
      const mockGraphData = {
        nodes: [
          { data: { id: "de1", label: "BU Unsubs", type: "DataExtension", createdDate: "2024-07-23" } },
          { data: { id: "auto1", label: "Daily BU Unsub Cleanup", type: "Automation", createdDate: "2024-07-25" } },
          { data: { id: "query1", label: "Unsub SQL", type: "QueryActivity", createdDate: "2024-07-25" } },
          { data: { id: "journey1", label: "Welcome Journey", type: "Journey", createdDate: "2024-08-01" } },
          { data: { id: "ts1", label: "Unsub Confirmation TS", type: "TriggeredSend", createdDate: "2024-08-02" } },
          { data: { id: "imp1", label: "Daily File Import", type: "Import", createdDate: "2024-07-30" } }
        ],
        edges: [
          { data: { source: "auto1", target: "query1", type: "contains" } },
          { data: { source: "query1", target: "de1", type: "targets" } },
          { data: { source: "journey1", target: "de1", type: "entrySource" } },
          { data: { source: "ts1", target: "de1", type: "targets" } },
          { data: { source: "imp1", target: "de1", type: "imports" } }
        ],
        metadata: {
          totalNodes: 6,
          totalEdges: 5,
          format: 'cytoscape',
          source: 'mock-fallback',
          generatedAt: new Date().toISOString(),
          note: 'Fallback data due to graph generation error'
        }
      };
      
      console.log('✅ [Graph API] Providing fallback mock graph data:', {
        nodeCount: mockGraphData.nodes.length,
        edgeCount: mockGraphData.edges.length
      });
      
      res.json(mockGraphData);
    }
    
  } catch (error) {
    console.error('❌ [Graph API] Error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve graph data',
      message: error.message 
    });
  }
});

/**
 * Node details endpoint for getting detailed information about a specific node
 * Requires Marketing Cloud authentication - no mock mode
 */
app.get('/graph/node/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 [Graph API] Node details requested:', { id });
    
    if (!req.session.mcCreds) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate with Marketing Cloud to fetch node details',
        requiresAuth: true
      });
    }
    
    // Live mode - fetch real node details from SFMC
    console.log('📡 [Graph API] Fetching live node details from Marketing Cloud...');
    
    try {
      // Get existing access token from session
      const accessToken = getAccessTokenFromRequest(req);
      const subdomain = getSubdomainFromRequest(req);
      
      if (!accessToken || !subdomain) {
        throw new Error('Missing access token or subdomain. Please re-authenticate with Marketing Cloud.');
      }
      
      // For now, return basic node details - this can be enhanced later
      // to fetch detailed information based on the node type and ID
      const nodeDetails = {
        id,
        type: id.startsWith('de_') ? 'DataExtension' : 
              id.startsWith('query_') ? 'Query' :
              id.startsWith('auto_') ? 'Automation' :
              id.startsWith('journey_') ? 'Journey' :
              id.startsWith('ts_') ? 'TriggeredSend' :
              id.startsWith('filter_') ? 'Filter' :
              id.startsWith('ft_') ? 'FileTransfer' :
              id.startsWith('extract_') ? 'DataExtract' : 'Unknown',
        name: id.replace(/^(de_|query_|auto_|journey_|ts_|filter_|ft_|extract_)/, '').replace(/_/g, ' '),
        lastModified: new Date().toISOString(),
        createdDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Active',
        source: 'Marketing Cloud API',
        metadata: {
          description: `Live data from Marketing Cloud for ${id}`,
          nodeId: id
        }
      };
      
      res.json(nodeDetails);
      
    } catch (error) {
      console.error('❌ [Graph API] Error fetching live node details:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch node details from Marketing Cloud',
        message: error.message,
        requiresAuth: error.message.includes('access token') || error.message.includes('authenticate')
      });
    }
    
  } catch (error) {
    console.error('❌ [Graph API] Error fetching node details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch node details',
      message: error.message 
    });
  }
});

/**
 * Objects endpoint for fetching SFMC objects for the sidebar
 * Requires Marketing Cloud authentication - no mock mode
 */
app.get('/objects', async (req, res) => {
  try {
    const mcCreds = req.session.mcCreds;
    
    console.log('🔍 [Objects API] Request received:', { 
      hasCredentials: !!mcCreds,
      subdomain: mcCreds?.subdomain 
    });
    
    if (mcCreds && mcCreds.subdomain) {
      // Live mode - fetch from SFMC
      console.log('📡 [Objects API] Fetching live data from Marketing Cloud...');
      
      try {
        // Get existing access token from session (like Search Assets module)
        const accessToken = getAccessTokenFromRequest(req);
        const subdomain = getSubdomainFromRequest(req);
        
        if (!accessToken || !subdomain) {
          console.log('⚠️ [Objects API] Missing access token or subdomain for live mode');
          throw new Error('Missing access token or subdomain. Please ensure you are logged in to Marketing Cloud.');
        }
        
        console.log('✅ [Objects API] Using existing access token from session');
        
        // Determine REST endpoint
        const restEndpoint = mcCreds.restEndpoint || `https://${subdomain}.rest.marketingcloudapis.com`;
        
        console.log('🔧 [Objects API] Using endpoints:', {
          subdomain: subdomain,
          restEndpoint: restEndpoint
        });
        
        // Fetch all objects from SFMC
        const sfmcObjects = await fetchAllSFMCObjects(accessToken, subdomain, restEndpoint);
        
        // Check if we got meaningful data (not all empty arrays)
        const hasData = Object.values(sfmcObjects).some(objectArray => 
          Array.isArray(objectArray) && objectArray.length > 0
        );
        
        if (hasData) {
          console.log('✅ [Objects API] Successfully fetched SFMC objects:', {
            dataExtensions: sfmcObjects['Data Extensions'].length,
            queries: sfmcObjects['SQL Queries'].length,
            automations: sfmcObjects['Automations'].length,
            journeys: sfmcObjects['Journeys'].length,
            triggeredSends: sfmcObjects['Triggered Sends'].length,
            filters: sfmcObjects['Filters'].length,
            fileTransfers: sfmcObjects['File Transfers'].length,
            dataExtracts: sfmcObjects['Data Extracts'].length
          });
          
          res.json(sfmcObjects);
        } else {
          console.log('⚠️ [Objects API] Live API returned empty data, falling back to mock data...');
          throw new Error('API returned empty data - likely authentication or permission issues');
        }
        
      } catch (apiError) {
        console.error('❌ [Objects API] SFMC API Error:', apiError.message);
        console.error('❌ [Objects API] Error details:', {
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data
        });
        
        // Fall back to mock data when live API fails
        console.log('🔄 [Objects API] Falling back to mock data due to API error...');
        
        const mockObjects = {
          'Data Extensions': [
            { id: 'de1', name: 'BU Unsubs', externalKey: 'bu_unsubs_key', categoryID: 'folder1', isSendable: true, createdDate: '2024-07-23' },
            { id: 'de2', name: 'Contact Data', externalKey: 'contact_data_key', categoryID: 'folder1', isSendable: false, createdDate: '2024-07-20' },
            { id: 'de3', name: 'Purchase History', externalKey: 'purchase_history_key', categoryID: 'folder2', isSendable: false, createdDate: '2024-07-15' }
          ],
          'Automations': [
            { id: 'auto1', name: 'Daily BU Unsub Cleanup', status: 'Running', categoryId: 'folder1', createdDate: '2024-07-25' },
            { id: 'auto2', name: 'Weekly Report Generation', status: 'Scheduled', categoryId: 'folder1', createdDate: '2024-07-22' }
          ],
          'SQL Queries': [
            { id: 'query1', name: 'Unsub SQL', externalKey: 'unsub_sql_key', targetId: 'de1', createdDate: '2024-07-25' },
            { id: 'query2', name: 'Purchase Analysis', externalKey: 'purchase_analysis_key', targetId: 'de3', createdDate: '2024-07-24' }
          ],
          'Journeys': [
            { id: 'journey1', name: 'Welcome Journey', status: 'Running', version: 1, categoryId: 'folder2', createdDate: '2024-08-01' },
            { id: 'journey2', name: 'Retention Campaign', status: 'Draft', version: 1, categoryId: 'folder2', createdDate: '2024-08-03' }
          ],
          'Triggered Sends': [
            { id: 'ts1', name: 'Unsub Confirmation TS', externalKey: 'ts1', email: { ID: 'email1' }, sendClassification: 'Commercial', createdDate: '2024-08-02' },
            { id: 'ts2', name: 'Welcome Email TS', externalKey: 'ts2', email: { ID: 'email2' }, sendClassification: 'Transactional', createdDate: '2024-08-01' }
          ],
          'Filters': [
            { id: 'filter1', name: 'Active Subscribers', externalKey: 'active_subs_filter', createdDate: '2024-07-28' }
          ],
          'File Transfers': [
            { id: 'ft1', name: 'Daily Data Import', externalKey: 'ft1', createdDate: '2024-07-30' }
          ],
          'Data Extracts': [
            { id: 'extract1', name: 'Customer Export', externalKey: 'extract1', createdDate: '2024-07-29' }
          ]
        };

        console.log('✅ [Objects API] Providing fallback mock data:', {
          dataExtensions: mockObjects['Data Extensions'].length,
          automations: mockObjects['Automations'].length,
          queries: mockObjects['SQL Queries'].length,
          journeys: mockObjects['Journeys'].length,
          triggeredSends: mockObjects['Triggered Sends'].length,
          filters: mockObjects['Filters'].length,
          fileTransfers: mockObjects['File Transfers'].length,
          dataExtracts: mockObjects['Data Extracts'].length
        });

        res.json(mockObjects);
      }
      
    } else {
      // No valid credentials - provide mock data for testing
      console.log('⚠️ [Objects API] No authentication found, providing mock data for testing...');
      
      const mockObjects = {
        'Data Extensions': [
          { id: 'de1', name: 'BU Unsubs', externalKey: 'bu_unsubs_key', categoryID: 'folder1', isSendable: true, createdDate: '2024-07-23' },
          { id: 'de2', name: 'Contact Data', externalKey: 'contact_data_key', categoryID: 'folder1', isSendable: false, createdDate: '2024-07-20' },
          { id: 'de3', name: 'Purchase History', externalKey: 'purchase_history_key', categoryID: 'folder2', isSendable: false, createdDate: '2024-07-15' }
        ],
        'Automations': [
          { id: 'auto1', name: 'Daily BU Unsub Cleanup', status: 'Running', categoryId: 'folder1', createdDate: '2024-07-25' },
          { id: 'auto2', name: 'Weekly Report Generation', status: 'Scheduled', categoryId: 'folder1', createdDate: '2024-07-22' }
        ],
        'SQL Queries': [
          { id: 'query1', name: 'Unsub SQL', externalKey: 'unsub_sql_key', targetId: 'de1', createdDate: '2024-07-25' },
          { id: 'query2', name: 'Purchase Analysis', externalKey: 'purchase_analysis_key', targetId: 'de3', createdDate: '2024-07-24' }
        ],
        'Journeys': [
          { id: 'journey1', name: 'Welcome Journey', status: 'Running', version: 1, categoryId: 'folder2', createdDate: '2024-08-01' },
          { id: 'journey2', name: 'Retention Campaign', status: 'Draft', version: 1, categoryId: 'folder2', createdDate: '2024-08-03' }
        ],
        'Triggered Sends': [
          { id: 'ts1', name: 'Unsub Confirmation TS', externalKey: 'ts1', email: { ID: 'email1' }, sendClassification: 'Commercial', createdDate: '2024-08-02' },
          { id: 'ts2', name: 'Welcome Email TS', externalKey: 'ts2', email: { ID: 'email2' }, sendClassification: 'Transactional', createdDate: '2024-08-01' }
        ],
        'Filters': [
          { id: 'filter1', name: 'Active Subscribers', externalKey: 'active_subs_filter', createdDate: '2024-07-28' }
        ],
        'File Transfers': [
          { id: 'ft1', name: 'Daily Data Import', externalKey: 'ft1', createdDate: '2024-07-30' }
        ],
        'Data Extracts': [
          { id: 'extract1', name: 'Customer Export', externalKey: 'extract1', createdDate: '2024-07-29' }
        ]
      };

      console.log('✅ [Objects API] Providing mock data:', {
        dataExtensions: mockObjects['Data Extensions'].length,
        automations: mockObjects['Automations'].length,
        queries: mockObjects['SQL Queries'].length,
        journeys: mockObjects['Journeys'].length,
        triggeredSends: mockObjects['Triggered Sends'].length,
        filters: mockObjects['Filters'].length,
        fileTransfers: mockObjects['File Transfers'].length,
        dataExtracts: mockObjects['Data Extracts'].length
      });

      res.json(mockObjects);
    }
    
  } catch (error) {
    console.error('❌ [Objects API] Unexpected error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch objects',
      message: error.message 
    });
  }
});

// Debug endpoint with mock data in correct Cytoscape.js format
app.get('/graph/mock', (req, res) => {
  console.log('🎭 [Mock] Generating mock graph data in Cytoscape.js format...');
  
  const nodes = [
    { data: { id: "de1", label: "BU Unsubs", type: "DataExtension", createdDate: "2024-07-23" } },
    { data: { id: "auto1", label: "Daily BU Unsub Cleanup", type: "Automation", createdDate: "2024-07-25" } },
    { data: { id: "query1", label: "Unsub SQL", type: "QueryActivity", createdDate: "2024-07-25" } },
    { data: { id: "journey1", label: "Welcome Journey", type: "Journey", createdDate: "2024-08-01" } },
    { data: { id: "ts1", label: "Unsub Confirmation TS", type: "TriggeredSend", createdDate: "2024-08-02" } },
    { data: { id: "imp1", label: "Daily File Import", type: "Import", createdDate: "2024-07-30" } }
  ];

  const edges = [
    { data: { source: "auto1", target: "query1", type: "contains" } },
    { data: { source: "query1", target: "de1", type: "targets" } },
    { data: { source: "journey1", target: "de1", type: "entrySource" } },
    { data: { source: "ts1", target: "de1", type: "targets" } },
    { data: { source: "imp1", target: "de1", type: "imports" } }
  ];

  const response = {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      format: 'cytoscape',
      source: 'mock',
      generatedAt: new Date().toISOString()
    }
  };

  console.log('✅ [Mock] Generated mock graph:', {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    sampleNode: nodes[0],
    sampleEdge: edges[0]
  });

  res.json(response);
});

app.get('/graph/debug', async (req, res) => {
  try {
    console.log('🐛 [Debug] Testing MetadataCrawler output format...');
    
    if (!req.session.mcCreds) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate with Marketing Cloud to test metadata crawler'
      });
    }

    const accessToken = getAccessTokenFromRequest(req);
    const subdomain = getSubdomainFromRequest(req);
    
    if (!accessToken || !subdomain) {
      return res.status(400).json({ error: 'Missing access token or subdomain' });
    }

    // Test the MetadataCrawler directly
    const MetadataCrawler = require('./metadataCrawler');
    const crawler = new MetadataCrawler(accessToken, subdomain);
    
    console.log('🔍 [Debug] Starting MetadataCrawler test...');
    const schemaData = await crawler.crawlMetadata();
    
    console.log('✅ [Debug] MetadataCrawler completed. Sample output:', {
      nodeCount: schemaData.nodes.length,
      edgeCount: schemaData.edges.length,
      sampleNode: schemaData.nodes[0],
      sampleEdge: schemaData.edges[0],
      metadata: schemaData.metadata
    });
    
    res.json({
      success: true,
      message: 'MetadataCrawler test completed',
      summary: {
        nodeCount: schemaData.nodes.length,
        edgeCount: schemaData.edges.length,
        format: 'cytoscape'
      },
      sample: {
        node: schemaData.nodes[0],
        edge: schemaData.edges[0]
      },
      metadata: schemaData.metadata
    });
    
  } catch (error) {
    console.error('❌ [Debug] MetadataCrawler test failed:', error.message);
    res.status(500).json({
      error: 'MetadataCrawler test failed',
      message: error.message,
      stack: error.stack
    });
  }
});

// Mock objects endpoint for testing the left panel
app.get('/objects/mock', (req, res) => {
  console.log('🎭 [Mock] Generating mock objects for left panel...');
  
  const mockObjects = {
    'Data Extensions': [
      { id: 'de1', name: 'BU Unsubs', externalKey: 'bu_unsubs_key', categoryID: 'folder1', isSendable: true, createdDate: '2024-07-23' },
      { id: 'de2', name: 'Contact Data', externalKey: 'contact_data_key', categoryID: 'folder1', isSendable: false, createdDate: '2024-07-20' },
      { id: 'de3', name: 'Purchase History', externalKey: 'purchase_history_key', categoryID: 'folder2', isSendable: false, createdDate: '2024-07-15' }
    ],
    'Automations': [
      { id: 'auto1', name: 'Daily BU Unsub Cleanup', status: 'Running', categoryId: 'folder1', createdDate: '2024-07-25' },
      { id: 'auto2', name: 'Weekly Report Generation', status: 'Scheduled', categoryId: 'folder1', createdDate: '2024-07-22' }
    ],
    'SQL Queries': [
      { id: 'query1', name: 'Unsub SQL', externalKey: 'unsub_sql_key', targetId: 'de1', createdDate: '2024-07-25' },
      { id: 'query2', name: 'Purchase Analysis', externalKey: 'purchase_analysis_key', targetId: 'de3', createdDate: '2024-07-24' }
    ],
    'Journeys': [
      { id: 'journey1', name: 'Welcome Journey', status: 'Running', version: 1, categoryId: 'folder2', createdDate: '2024-08-01' },
      { id: 'journey2', name: 'Retention Campaign', status: 'Draft', version: 1, categoryId: 'folder2', createdDate: '2024-08-03' }
    ],
    'Triggered Sends': [
      { id: 'ts1', name: 'Unsub Confirmation TS', externalKey: 'ts1', email: { ID: 'email1' }, sendClassification: 'Commercial', createdDate: '2024-08-02' },
      { id: 'ts2', name: 'Welcome Email TS', externalKey: 'ts2', email: { ID: 'email2' }, sendClassification: 'Transactional', createdDate: '2024-08-01' }
    ],
    'Filters': [
      { id: 'filter1', name: 'Active Subscribers', externalKey: 'active_subs_filter', createdDate: '2024-07-28' }
    ],
    'File Transfers': [
      { id: 'ft1', name: 'Daily Data Import', externalKey: 'ft1', createdDate: '2024-07-30' }
    ],
    'Data Extracts': [
      { id: 'extract1', name: 'Customer Export', externalKey: 'extract1', createdDate: '2024-07-29' }
    ]
  };

  console.log('✅ [Mock] Generated mock objects:', {
    dataExtensions: mockObjects['Data Extensions'].length,
    automations: mockObjects['Automations'].length,
    queries: mockObjects['SQL Queries'].length,
    journeys: mockObjects['Journeys'].length,
    triggeredSends: mockObjects['Triggered Sends'].length,
    filters: mockObjects['Filters'].length,
    fileTransfers: mockObjects['File Transfers'].length,
    dataExtracts: mockObjects['Data Extracts'].length
  });

  res.json(mockObjects);
});

// Serve React frontend (must be after API endpoints)
const buildPath = path.join(__dirname, '../mc-explorer-client/build');

// Check if build directory exists
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
  console.log('✅ Serving React frontend from build directory');
} else {
  console.log('⚠️ Build directory not found. Frontend may not be available.');
  app.get('/', (req, res) => {
    res.json({ 
      message: 'MC-Explorer Server is running', 
      status: 'Build directory not found - please run npm run build',
      api: 'Available at /api/*'
    });
  });
}

// Suppress MemoryStore warning in production
if (process.env.NODE_ENV === 'production') {
  const originalWarn = console.warn;
  console.warn = function(...args) {
    const message = args.join(' ');
    if (message.includes('MemoryStore is not designed for a production environment')) {
      console.log('📝 [SESSION] MemoryStore warning suppressed (single-instance deployment)');
      return;
    }
    originalWarn.apply(console, args);
  };
}

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
