const axios = require('axios');

/**
 * Retrieve Send (Job) details from Salesforce Marketing Cloud using SOAP API.
 * @param {string} subdomain - Your MC subdomain (e.g., 'mc1234')
 * @param {string} accessToken - OAuth access token for MC SOAP API
 * @param {string|number} jobId - The Job ID (Email.ID) to filter on
 * @returns {Promise<string>} - The raw SOAP XML response
 */
async function retrieveSendByJobId(subdomain, accessToken, jobId) {
  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://exacttarget.com/wsdl/partnerAPI">
      <soapenv:Header>
        <ns:fueloauth>${accessToken}</ns:fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <ns:RetrieveRequestMsg>
          <ns:RetrieveRequest>
            <ns:ObjectType>Send</ns:ObjectType>
            <ns:Properties>EmailName</ns:Properties>
            <ns:Properties>ID</ns:Properties>
            <ns:Properties>Status</ns:Properties>
            <ns:Properties>Subject</ns:Properties>
            <ns:Properties>Email.ID</ns:Properties>
            <ns:Properties>SentDate</ns:Properties>
            <ns:Properties>FromAddress</ns:Properties>
            <ns:Properties>FromName</ns:Properties>
            <ns:Properties>BccEmail</ns:Properties>
            <ns:Properties>CreatedDate</ns:Properties>
            <ns:Properties>NumberSent</ns:Properties>
            <ns:Properties>Client.ID</ns:Properties>
            <ns:Filter xsi:type="ns:SimpleFilterPart" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
              <ns:Property>Email.ID</ns:Property>
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

/**
 * Retrieve Send (Job) details from Salesforce Marketing Cloud using SOAP API.
 * @param {string} subdomain - Your MC subdomain (e.g., 'mc1234')
 * @param {string} accessToken - OAuth access token for MC SOAP API
 * @param {object} filter - { property, operator, value } or { left, logicalOperator, right } for complex filters
 * @returns {Promise<string>} - The raw SOAP XML response
 */
async function retrieveSendWithFilter(subdomain, accessToken, filter) {
  // Helper to build filter XML
  function buildFilterXML(f) {
    if (f.left && f.logicalOperator && f.right) {
      // Complex filter (AND/OR)
      return `
        <ns:Filter xsi:type="ns:ComplexFilterPart" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <ns:LeftOperand>${buildFilterXML(f.left)}</ns:LeftOperand>
          <ns:LogicalOperator>${f.logicalOperator}</ns:LogicalOperator>
          <ns:RightOperand>${buildFilterXML(f.right)}</ns:RightOperand>
        </ns:Filter>
      `;
    } else {
      // Simple filter
      return `
        <ns:Filter xsi:type="ns:SimpleFilterPart" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <ns:Property>${f.property}</ns:Property>
          <ns:SimpleOperator>${f.operator}</ns:SimpleOperator>
          <ns:Value>${f.value}</ns:Value>
        </ns:Filter>
      `;
    }
  }

  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://exacttarget.com/wsdl/partnerAPI">
      <soapenv:Header>
        <ns:fueloauth>${accessToken}</ns:fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <ns:RetrieveRequestMsg>
          <ns:RetrieveRequest>
            <ns:ObjectType>Send</ns:ObjectType>
            <ns:Properties>EmailName</ns:Properties>
            <ns:Properties>ID</ns:Properties>
            <ns:Properties>Status</ns:Properties>
            <ns:Properties>Subject</ns:Properties>
            <ns:Properties>Email.ID</ns:Properties>
            <ns:Properties>SentDate</ns:Properties>
            <ns:Properties>FromAddress</ns:Properties>
            <ns:Properties>FromName</ns:Properties>
            <ns:Properties>BccEmail</ns:Properties>
            <ns:Properties>CreatedDate</ns:Properties>
            <ns:Properties>NumberSent</ns:Properties>
            <ns:Properties>Client.ID</ns:Properties>
            ${filter ? buildFilterXML(filter) : ''}
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

module.exports = { retrieveSendByJobId, retrieveSendWithFilter };
