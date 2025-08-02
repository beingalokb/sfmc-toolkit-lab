import React, { useState } from 'react';

const baseURL = process.env.REACT_APP_BASE_URL;

function EmailArchiving() {
  // Configuration state variables (similar to DM QS)
  const [configLoading, setConfigLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [configDetails, setConfigDetails] = useState(null);

  const handleEmailArchiveConfiguration = async () => {
    setConfigLoading(true);
    setConfigStatus("Creating Email Archive Data Extension...");
    setConfigDetails(null);
    
    try {
      const response = await fetch(`${baseURL}/createEmailArchiveDE`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderName: 'MC_Explorer_Email_Archive',
          deName: 'HTML_Log',
          description: 'Stores archived email HTML at send time',
          isSendable: false,
          fields: [
            { name: 'SubscriberKey', fieldType: 'Text', length: 100, isPrimaryKey: true },
            { name: 'EmailAddress', fieldType: 'EmailAddress' },
            { name: 'JobID', fieldType: 'Number' },
            { name: 'SendDate', fieldType: 'Date' },
            { name: '_DataSourceName', fieldType: 'Text', length: 100 },
            { name: 'HTML', fieldType: 'Text' },
            { name: 'BatchID', fieldType: 'Number' },
            { name: 'ListID', fieldType: 'Number' },
            { name: 'SubID', fieldType: 'Number' }
          ]
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'OK') {
        setConfigStatus("✅ All set!");
        setConfigDetails({
          deName: data.deName,
          dePath: `/Data Extensions / MC_Explorer_Email_Archive`,
          description: data.description
        });
      } else {
        setConfigStatus("❌ Setup failed.");
      }
    } catch (error) {
      setConfigStatus("❌ Error during setup.");
      console.error('Error:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
        🗄️ Email Archiving Configuration
      </h2>

      <button
        className={`px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 ${configLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={handleEmailArchiveConfiguration}
        disabled={configLoading}
      >
        {configLoading ? "Working..." : "✨ Create Email Archive Setup"}
      </button>

      <div className="mt-6 text-gray-700 space-y-2">
        {configStatus && <p className="text-lg font-medium">{configStatus}</p>}
        {configDetails && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p>🔹 <strong>DE name:</strong> {configDetails.deName}</p>
            <p>🔹 <strong>DE path:</strong> {configDetails.dePath}</p>
            <p>🔹 <strong>Description:</strong> {configDetails.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailArchiving;
