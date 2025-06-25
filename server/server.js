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
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const PORT = process.env.PORT || 3001;
let dynamicCreds = {
  subdomain: '',
  clientId: '',
  clientSecret: '',
  accountId: ''
};

console.log("✅ Env loaded:", {
  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  AUTH_DOMAIN: process.env.AUTH_DOMAIN,
  REDIRECT_URI: process.env.REDIRECT_URI
});

app.post('/save-credentials', (req, res) => {
  const { subdomain, clientId, clientSecret, accountId } = req.body;
  dynamicCreds = { subdomain, clientId, clientSecret, accountId };

  const redirectUri = `${process.env.BASE_URL}/auth/callback`;
  const loginUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
  console.log('🔐 Generated Login URL:', loginUrl);
  res.json({ redirectUrl: loginUrl });
});

app.get('/auth/login', (req, res) => {
  const loginUrl = `https://${process.env.AUTH_DOMAIN}/v2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code`;
  console.log('🔐 Redirecting to login URL:', loginUrl);
  res.redirect(loginUrl);
});

app.get('/auth/callback', (req, res) => {
  // Serve the React app for SPA routing; do NOT handle code exchange here
  res.sendFile(path.join(__dirname, '../mc-explorer-client/build/index.html'));
});

app.post('/auth/callback', async (req, res) => {
  const code = req.body.code;
  console.log('🔔 POST /auth/callback called with code:', code);
  if (!code) {
    console.error('❌ No code provided in POST /auth/callback');
    return res.status(400).json({ success: false, error: 'Missing authorization code' });
  }
  try {
    console.log('🔗 Requesting token from:', `https://${process.env.AUTH_DOMAIN}/v2/token`);
    const tokenResponse = await axios.post(
      `https://${process.env.AUTH_DOMAIN}/v2/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    // Extract subdomain from AUTH_DOMAIN
    const match = process.env.AUTH_DOMAIN.match(/^([^.]+)\./);
    const subdomain = match ? match[1] : null;
    console.log('✅ Token response:', tokenResponse.data);
    res.json({ success: true, accessToken, refreshToken, subdomain });
  } catch (err) {
    console.error('❌ OAuth Token Exchange Error (POST):', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

function getAccessTokenFromRequest(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}
function getSubdomainFromRequest(req) {
  return req.headers['x-mc-subdomain'] || null;
}

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
  const accessToken = getAccessTokenFromRequest(req);
  const subdomain = getSubdomainFromRequest(req);
  if (!accessToken || !subdomain) {
    return res.status(401).json([]);
  }
  try {
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header>
          <fueloauth>${accessToken}</fueloauth>
        </s:Header>
        <s:Body>
          <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <RetrieveRequest>
              <ObjectType>EmailSendDefinition</ObjectType>
              <Properties>Name</Properties>
              <Properties>BccEmail</Properties>
              <Properties>CCEmail</Properties>
              <Properties>CreatedDate</Properties>
              <Properties>CustomerKey</Properties>
              <Properties>DeliveryScheduledTime</Properties>
              <Properties>DomainType</Properties>
              <Properties>EmailSubject</Properties>
              <Properties>ExclusionFilter</Properties>
              <Properties>FooterContentArea</Properties>
              <Properties>FromAddress</Properties>
              <Properties>FromName</Properties>
              <Properties>HeaderContentArea</Properties>
              <Properties>MessageDeliveryType</Properties>
              <Properties>ModifiedDate</Properties>
              <Properties>PreHeader</Properties>
              <Properties>PrivateDomain</Properties>
              <Properties>DeliveryProfile</Properties>
              <Properties>PrivateIP</Properties>
              <Properties>ReplyToAddress</Properties>
              <Properties>ReplyToDisplayName</Properties>
              <Properties>SendClassification</Properties>
              <Properties>SendDefinitionList</Properties>
              <Properties>SenderProfile</Properties>
              <Properties>SendLimit</Properties>
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
        const sendDefs = resultArray.map(item => ({
          Name: item.Name || '',
          BccEmail: item.BccEmail || '',
          CCEmail: item.CCEmail || '',
          CreatedDate: item.CreatedDate || '',
          CustomerKey: item.CustomerKey || '',
          DeliveryScheduledTime: item.DeliveryScheduledTime || '',
          DomainType: item.DomainType || '',
          EmailSubject: item.EmailSubject || '',
          ExclusionFilter: item.ExclusionFilter || '',
          FooterContentArea: item.FooterContentArea || '',
          FromAddress: item.FromAddress || '',
          FromName: item.FromName || '',
          HeaderContentArea: item.HeaderContentArea || '',
          MessageDeliveryType: item.MessageDeliveryType || '',
          ModifiedDate: item.ModifiedDate || '',
          PreHeader: item.PreHeader || '',
          PrivateDomain: item.PrivateDomain || '',
          DeliveryProfile: item.DeliveryProfile || '',
          PrivateIP: item.PrivateIP || '',
          ReplyToAddress: item.ReplyToAddress || '',
          ReplyToDisplayName: item.ReplyToDisplayName || '',
          SendClassification: item.SendClassification || '',
          SendDefinitionList: item.SendDefinitionList || '',
          SenderProfile: item.SenderProfile || '',
          SendLimit: item.SendLimit || ''
        }));
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

// Serve React frontend
app.use(express.static(path.join(__dirname, '../mc-explorer-client/build')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../mc-explorer-client/build/index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
