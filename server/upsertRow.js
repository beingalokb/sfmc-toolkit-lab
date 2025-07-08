// Helper to upsert a row into a Data Extension using SOAP
const axios = require('axios');
const xml2js = require('xml2js');

/**
 * Upserts a row into a Data Extension in Marketing Cloud using SOAP API.
 * @param {string} deName - The CustomerKey of the Data Extension.
 * @param {object} row - The row object, keys are field names.
 * @param {string} accessToken - OAuth access token.
 * @param {string} subdomain - MC subdomain.
 * @returns {Promise<boolean>} - True if upsert succeeded.
 */
async function upsertRow(deName, row, accessToken, subdomain) {
  const propertiesXml = Object.entries(row)
    .map(([key, value]) => `<Property><Name>${key}</Name><Value>${value}</Value></Property>`) 
    .join('');
  const soapEnvelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
      <soapenv:Header>
        <fueloauth>${accessToken}</fueloauth>
      </soapenv:Header>
      <soapenv:Body>
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Options>
            <SaveOptions>
              <SaveOption>
                <PropertyName>*</PropertyName>
                <SaveAction>UpdateAdd</SaveAction>
              </SaveOption>
            </SaveOptions>
          </Options>
          <Objects xsi:type="DataExtensionObject" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <CustomerKey>${deName}</CustomerKey>
            <Properties>
              ${propertiesXml}
            </Properties>
          </Objects>
        </CreateRequest>
      </soapenv:Body>
    </soapenv:Envelope>
  `;
  const url = `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`;
  const resp = await axios.post(url, soapEnvelope, {
    headers: { 'Content-Type': 'text/xml', SOAPAction: 'Create' }
  });
  if (!resp.data.includes('<OverallStatus>OK</OverallStatus>')) {
    throw new Error('Failed to upsert row in DE: ' + deName);
  }
  return true;
}

module.exports = upsertRow;
