const { retrieveSentEventByJobId } = require('./retrieveSentEvent');
const xml2js = require('xml2js');

/**
 * GET /api/email-archive/sent-events?jobId=12345
 * Returns SentEvent details for a given JobID (SendID)
 */
module.exports = function(app) {
  app.get('/api/email-archive/sent-events', async (req, res) => {
    const jobId = req.query.jobId;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
    const accessToken = req.session.accessToken;
    const subdomain = req.session.mcCreds && req.session.mcCreds.subdomain;
    if (!accessToken || !subdomain) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const xml = await retrieveSentEventByJobId(subdomain, accessToken, jobId);
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xml);
      const results = result?.['soap:Envelope']?.['soap:Body']?.['RetrieveResponseMsg']?.['Results'];
      if (!results) return res.json([]);
      const arr = Array.isArray(results) ? results : [results];
      const mapped = arr.map(row => ({
        SubscriberKey: row.SubscriberKey || '',
        EventDate: row.EventDate || '',
        SendID: row.SendID || '',
        ListID: row.ListID || '',
        TriggeredSendDefinitionObjectID: row.TriggeredSendDefinitionObjectID || '',
        BatchID: row.BatchID || ''
      }));
      res.json(mapped);
    } catch (e) {
      console.error('❌ /api/email-archive/sent-events error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
