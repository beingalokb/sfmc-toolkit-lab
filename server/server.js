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

// Serve React frontend
app.use(express.static(path.join(__dirname, '../mc-explorer-client/build')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../mc-explorer-client/build/index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
