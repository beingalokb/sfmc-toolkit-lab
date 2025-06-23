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
    console.log('✅ Token response:', tokenResponse.data);
    // Don't store in memory, return to frontend
    res.json({ success: true, accessToken, refreshToken });
  } catch (err) {
    console.error('❌ OAuth Token Exchange Error (POST):', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// Update all data endpoints to use access token from Authorization header
function getAccessTokenFromRequest(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

app.get('/folders', async (req, res) => {
  const accessToken = getAccessTokenFromRequest(req);
  try {
    if (!accessToken || !dynamicCreds.subdomain) {
      console.error('❌ /folders missing accessToken or subdomain', { accessToken, subdomain: dynamicCreds.subdomain });
      return res.status(401).json([]);
    }
    const folderMap = await getFolderMap(accessToken);
    res.json(Object.values(folderMap));
  } catch (err) {
    console.error('❌ /folders error:', {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
      config: err.config
    });
    res.status(500).json([]);
  }
});

async function getFolderMap(accessToken) {
  const envelope = `
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

const resourceMap = {
  de: 'dataextension',
  automation: 'automation',
  datafilters: 'datafilter',
  journeys: 'journey'
};

Object.entries(resourceMap).forEach(([route, resource]) => {
  app.get(`/search/${route}`, async (req, res) => {
    const accessToken = getAccessTokenFromRequest(req);
    if (!accessToken || !dynamicCreds.subdomain) {
      console.error(`❌ /search/${route} missing accessToken or subdomain`, { accessToken, subdomain: dynamicCreds.subdomain });
      return res.status(401).json([]);
    }
    try {
      const response = await axios.get(
        `https://${dynamicCreds.subdomain}.rest.marketingcloudapis.com/asset/v1/content/assets?$filter=assetType.name%20eq%20'${resource}'`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const items = response.data?.items || [];
      const simplified = items.map(item => ({
        id: item.id,
        name: item.name,
        createdDate: item.createdDate,
        categoryId: item.category?.id || item.folder?.id,
        status: item.status,
        versionNumber: item.version?.versionNumber
      }));
      res.json(simplified);
    } catch (err) {
      console.error(`❌ /search/${route} error:`, {
        message: err.message,
        stack: err.stack,
        response: err.response?.data,
        config: err.config
      });
      res.status(500).json([]);
    }
  });
});

// Serve React frontend
app.use(express.static(path.join(__dirname, '../mc-explorer-client/build')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../mc-explorer-client/build/index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
