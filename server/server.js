// Revised and cleaned-up version of server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const path = require('path');

console.log("Client ID:", process.env.CLIENT_ID);
console.log("Client Secret:", process.env.CLIENT_SECRET);
console.log("Auth Domain:", process.env.AUTH_DOMAIN);
console.log("Redirect URI:", process.env.REDIRECT_URI);


const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const PORT = process.env.PORT || 3001;
let sessionAccessToken = null;
let dynamicCreds = {
  subdomain: '',
  clientId: '',
  clientSecret: '',
  accountId: ''
};

// 📥 Store credentials and construct login URL
app.post('/save-credentials', (req, res) => {
  const { subdomain, clientId, clientSecret, accountId } = req.body;
  dynamicCreds = { subdomain, clientId, clientSecret, accountId };

  const redirectUri = `${process.env.BASE_URL}/callback`;
  const loginUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
  res.json({ redirectUrl: loginUrl });
});

// OAuth Redirect to Marketing Cloud
app.get('/auth/login', (req, res) => {
  const loginUrl = `https://${process.env.MC_SUBDOMAIN}.auth.marketingcloudapis.com/v2/authorize?client_id=${process.env.MC_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.BASE_URL + '/auth/callback')}&response_type=code`;
  res.redirect(loginUrl);
});



// OAuth Callback: Exchange code for access token
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokenResponse = await axios.post(
      `https://${process.env.AUTH_DOMAIN}/v2/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token } = tokenResponse.data;
    console.log('✅ Access token:', access_token);

    res.redirect('/explorer?auth=1');
  } catch (err) {
    console.error('❌ OAuth Token Exchange Failed:', err?.response?.data || err.message);
    res.status(500).send('OAuth callback failed');
  }
});




// 🔍 Retrieve folder map
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

// 📂 Routes
app.get('/folders', async (req, res) => {
  try {
    if (!sessionAccessToken) return res.status(401).json([]);
    const folderMap = await getFolderMap();
    res.json(Object.values(folderMap));
  } catch (err) {
    console.error('❌ /folders error:', err);
    res.status(500).json([]);
  }
});

app.get('/search/de', async (req, res) => {
  try {
    if (!sessionAccessToken) return res.status(401).json({ error: 'Not authenticated' });
    const envelope = `
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
      envelope,
      { headers: { 'Content-Type': 'text/xml', SOAPAction: 'Retrieve' } }
    );

    const parser = new xml2js.Parser({ explicitArray: false });
    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'XML Parse Error' });
      const results = result?.['soap:Envelope']?.['soap:Body']?.RetrieveResponseMsg?.Results;
      if (!results) return res.json([]);
      const list = Array.isArray(results) ? results : [results];
      const simplified = list.map(de => ({
        name: de.Name,
        key: de.CustomerKey,
        createdDate: de.CreatedDate,
        categoryId: de.CategoryID
      }));
      res.json(simplified);
    });
  } catch (err) {
    console.error('/search/de error', err);
    res.status(500).json({ error: 'SOAP DE fetch failed' });
  }
});

app.get('/search/automation', async (req, res) => {
  try {
    if (!sessionAccessToken) return res.status(401).json({ error: 'Not authenticated' });
    const response = await axios.get(
      `https://${dynamicCreds.subdomain}.rest.marketingcloudapis.com/automation/v1/automations`,
      { headers: { Authorization: `Bearer ${sessionAccessToken}` } }
    );
    const list = response.data.items || [];
    const simplified = list.map(item => ({
      name: item.name,
      key: item.key || item.customerKey,
      status: item.status,
      createdDate: item.createdDate,
      lastRunTime: item.lastRunTime,
      categoryId: item.categoryId
    }));
    res.json(simplified);
  } catch (err) {
    console.error('/search/automation error', err);
    res.status(500).json({ error: 'REST Automation fetch failed' });
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

    parser.parseString(response.data, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to parse XML' });

      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      if (!results) return res.status(200).json([]);

      const items = Array.isArray(results) ? results : [results];

      const dataFilters = items.map(df => ({
        name: df.Name || 'N/A',
        key: df.CustomerKey || 'N/A',
        description: df.Description || 'N/A',
        createdDate: df.CreatedDate || 'N/A',
        folderId: df.CategoryID ? String(df.CategoryID) : null
      }));

      res.json(dataFilters);
    });
  } catch (err) {
    console.error('❌ /search/datafilters error:', err);
    res.status(500).json({ error: 'Failed to fetch Data Filters' });
  }
});


// Add /search/datafilters and /search/journeys similar to above...

app.get('/search/journeys', async (req, res) => {
  try {
    if (!sessionAccessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const response = await axios.get(
      `https://${dynamicCreds.subdomain}.rest.marketingcloudapis.com/interaction/v1/interactions`,
      { headers: { Authorization: `Bearer ${sessionAccessToken}` } }
    );

    const journeys = response.data.items || [];
    const simplified = journeys.map(j => ({
      name: j.name || 'N/A',
      key: j.key || 'N/A',
      status: j.status || 'N/A',
      createdDate: j.createdDate || 'N/A',
      lastPublishedDate: j.lastPublishedDate || 'N/A',
      versionNumber: j.versionNumber || 'N/A',
      categoryId: j.categoryId || 'N/A'
    }));

    res.json(simplified);
  } catch (err) {
    console.error('❌ Error in /search/journeys:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch journeys' });
  }
});



// 🧾 Serve React Frontend
app.use(express.static(path.join(__dirname, '../mc-explorer-client/build')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../mc-explorer-client/build/index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
