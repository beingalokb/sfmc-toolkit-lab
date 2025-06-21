const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

let accessToken = null;

// At top
let sessionAccessToken = null;

// 🔁 OAuth2 Redirect URI
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  const redirectUri = `${process.env.BASE_URL}/callback`; // e.g., http://localhost:3001/callback

  try {
    const tokenRes = await axios.post(`https://${process.env.MC_SUBDOMAIN}.auth.marketingcloudapis.com/v2/token`, {
      grant_type: 'authorization_code',
      client_id: process.env.MC_CLIENT_ID,
      client_secret: process.env.MC_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    });

    sessionAccessToken = tokenRes.data.access_token;
    console.log('✅ Access token acquired via OAuth2');

    res.redirect('http://localhost:3000/explorer'); // or your frontend route
  } catch (err) {
    console.error('❌ OAuth callback error:', err.response?.data || err);
    res.status(500).send('OAuth callback failed');
  }
});


// 🔐 Get OAuth Token
async function getAccessToken() {
  const response = await axios.post(`https://${dynamicCreds.subdomain}.auth.marketingcloudapis.com/v2/token`, {
    grant_type: 'client_credentials',
    client_id: dynamicCreds.clientId,
    client_secret: dynamicCreds.clientSecret,
    account_id: dynamicCreds.accountId
  });
  accessToken = response.data.access_token;
  console.log('✅ Token acquired');
  return accessToken;
}

// 🔁 Retrieve Folder Map
async function getFolderMap() {
  const envelope = `
    <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <s:Header><fueloauth>${sessionAccessToken}</fueloauth></s:Header>
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

  const response = await axios.post(
    `https://${dynamicCreds.subdomain}.soap.marketingcloudapis.com/Service.asmx`,
    envelope,
    { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
  );

  const parser = new xml2js.Parser({ explicitArray: false });

  return new Promise((resolve, reject) => {
    parser.parseString(response.data, (err, result) => {
      if (err) return reject(err);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      const folders = Array.isArray(results) ? results : [results];
      const map = {};
      folders.forEach(f => {
        const id = String(f.ID);
        const parentId = f['ParentFolder']?.ID ? String(f['ParentFolder'].ID) : null;
        map[id] = { ID: id, Name: f.Name, ParentFolder: { ID: parentId }, ContentType: f.ContentType };
      });
      resolve(map);
    });
  });
}

app.get('/folders', async (req, res) => {
  try {
    if (!accessToken) await getAccessToken();
    const folderMap = await getFolderMap();
    res.json(Object.values(folderMap || {})); // <- Ensure array is returned
  } catch (err) {
    console.error('❌ /folders error:', err);
    res.status(500).json([]); // <- Return empty array on error
  }
});


app.get('/auth', async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ token });
  } catch (error) {
    console.error('❌ Token error:', error.response?.data || error);
    res.status(500).json({ error: 'Token fetch failed' });
  }
});

app.get('/search/de', async (req, res) => {
  console.log('⚙️  /search/de endpoint hit');
  try {
    if (!sessionAccessToken) {
  return res.status(401).json({ error: 'User not authenticated' });
}
    const soapEnvelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header><fueloauth>${sessionAccessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;

    const response = await axios.post(
      `https://${dynamicCreds.subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      soapEnvelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, async (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      if (!results) return res.status(200).json([]);
      const resultArray = Array.isArray(results) ? results : [results];
      const simplified = resultArray.map(de => ({
        name: de.Name || 'N/A',
        key: de.CustomerKey || 'N/A',
        createdDate: de.CreatedDate || 'N/A',
        categoryId: de.CategoryID ? String(de.CategoryID) : null
      }));
      res.json(simplified);
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch DEs' });
  }
});

app.get('/search/automation', async (req, res) => {
  try {
    if (!sessionAccessToken) {
  return res.status(401).json({ error: 'User not authenticated' });
}
    const response = await axios.get(
      `https://${dynamicCreds.subdomain}.rest.marketingcloudapis.com/automation/v1/automations`,
      { headers: { Authorization: `Bearer ${sessionAccessToken}` } }
    );
    const simplified = (response.data.items || []).map(a => ({
      name: a.name || 'N/A',
      key: a.key || a.customerKey || 'N/A',
      status: a.status || 'N/A',
      createdDate: a.createdDate || 'N/A',
      lastRunTime: a.lastRunTime || 'N/A',
      categoryId: a.categoryId || 'N/A',
    }));
    res.json(simplified);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Automations' });
  }
});

app.get('/search/datafilters', async (req, res) => {
  try {
    if (!sessionAccessToken) {
  return res.status(401).json({ error: 'User not authenticated' });
}
    const envelope = `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <s:Header><fueloauth>${sessionAccessToken}</fueloauth></s:Header>
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
      </s:Envelope>`;

    const response = await axios.post(
      `https://${dynamicCreds.subdomain}.soap.marketingcloudapis.com/Service.asmx`,
      envelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, async (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });
      const results = result['soap:Envelope']?.['soap:Body']?.RetrieveResponseMsg?.Results;
      if (!results) return res.json([]);
      const items = Array.isArray(results) ? results : [results];
      const dataFilters = items.map(item => ({
        name: item.Name || 'N/A',
        key: item.CustomerKey || 'N/A',
        description: item.Description || 'N/A',
        createdDate: item.CreatedDate || 'N/A',
        folderId: item.CategoryID || 'N/A',
      }));
      res.json(dataFilters);
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Data Filters' });
  }
});

app.get('/search/journeys', async (req, res) => {
  try {
    if (!sessionAccessToken) {
  return res.status(401).json({ error: 'User not authenticated' });
}
    const response = await axios.get(
      `https://${dynamicCreds.subdomain}.rest.marketingcloudapis.com/interaction/v1/interactions`,
      { headers: { Authorization: `Bearer ${sessionAccessToken}` } }
    );
    const simplified = (response.data.items || []).map(j => ({
      name: j.name || 'N/A',
      key: j.key || 'N/A',
      status: j.status || 'N/A',
      createdDate: j.createdDate || 'Not Available',
      lastPublishedDate: j.lastPublishedDate || 'N/A',
      versionNumber: j.versionNumber || 'N/A',
      categoryId: j.categoryId || null
    }));
    res.json(simplified);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Journeys' });
  }
});

// 🔚 Serve Frontend
app.use(express.static(path.join(__dirname, '../mc-explorer-client/build')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../mc-explorer-client/build/index.html'));
});

const PORT = process.env.PORT || 3001;

// In-memory storage for dynamic credentials
let dynamicCreds = {
  subdomain: '',
  clientId: '',
  clientSecret: '',
  accountId: ''
};

app.post('/save-credentials', (req, res) => {
  const { subdomain, clientId, clientSecret, accountId } = req.body;

  // ✅ Store in dynamicCreds (used throughout your server)
  dynamicCreds = {
    subdomain,
    clientId,
    clientSecret,
    accountId
  };

  // Optional: keep env for fallback
  process.env.MC_SUBDOMAIN = subdomain;
  process.env.MC_CLIENT_ID = clientId;
  process.env.MC_CLIENT_SECRET = clientSecret;
  process.env.MC_ACCOUNT_ID = accountId;

  // Prepare redirect URL for OAuth login
  const redirectUri = `${process.env.BASE_URL}/callback`;
  const loginUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

  res.json({ redirectUrl: loginUrl });
});


app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
