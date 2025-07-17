const axios = require('axios');

/**
 * Retrieve SentEvent details from Salesforce Marketing Cloud using SOAP API.
 * @param {string} subdomain - MC subdomain
 * @param {string} accessToken - OAuth access token
 * @param {string|number} jobId - The Job ID (SendID) to filter on
 * @returns {Promise<string>} - The raw SOAP XML response
 */
async function retrieveSentEventByJobId(subdomain, accessToken, jobId) {
  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:ns=\"http://exacttarget.com/wsdl/partnerAPI\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">
      <soapenv:Header>
        <ns:fueloauth>${accessToken}</ns:fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <ns:RetrieveRequestMsg>
          <ns:RetrieveRequest>
            <ns:ObjectType>SentEvent</ns:ObjectType>
            <ns:Properties>SubscriberKey</ns:Properties>
            <ns:Properties>EventDate</ns:Properties>
            <ns:Properties>SendID</ns:Properties>
            <ns:Properties>TriggeredSendDefinitionObjectID</ns:Properties>
            <ns:Properties>BatchID</ns:Properties>
            <ns:Properties>ListID</ns:Properties>
            <ns:Filter xsi:type=\"ns:SimpleFilterPart\">
              <ns:Property>SendID</ns:Property>
              <ns:SimpleOperator>equals</ns:SimpleOperator>
              <ns:Value>${jobId}</ns:Value>
            </ns:Filter>
          </ns:RetrieveRequest>
        </ns:RetrieveRequestMsg>
      </soapenv:Body>
    </soapenv:Envelope>
  `;
  const url = `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`;
  const response = await axios.post(url, soapEnvelope, {
    headers: {
      'Content-Type': 'text/xml',
      'SOAPAction': 'Retrieve',
    },
    timeout: 20000
  });
  return response.data;
}

module.exports = { retrieveSentEventByJobId };
