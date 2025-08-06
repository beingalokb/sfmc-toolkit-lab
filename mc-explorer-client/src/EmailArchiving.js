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
            { name: 'SendID', fieldType: 'Number', isPrimaryKey: true },
            { name: 'JobID', fieldType: 'Number' },
            { name: 'SubscriberKey', fieldType: 'Text', maxLength: 254 },
            { name: 'EmailAddress', fieldType: 'EmailAddress' },
            { name: 'EmailName', fieldType: 'Text', maxLength: 100 },
            { name: 'ListID', fieldType: 'Number' },
            { name: 'EmailHTML', fieldType: 'Text' }, // No maxLength = unlimited
            { name: 'LoggedDate', fieldType: 'Date' }
          ]
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'OK') {
        setConfigStatus("✅ Email archiving setup complete!");
        setConfigDetails({
          deName: data.deName,
          dePath: `/Data Extensions / MC_Explorer_Email_Archive`,
          description: data.description,
          contentFolderName: data.contentFolderName,
          contentBlockName: data.contentBlockName,
          contentBlockId: data.contentBlockId,
          contentBlockAction: data.contentBlockAction,
          message: data.message
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

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-medium text-blue-800 mb-2">What this creates:</h3>
        <ul className="text-blue-700 space-y-1 text-sm">
          <li>• A Data Extension folder and DE to store archived email HTML</li>
          <li>• A Content Builder folder and AMPscript content block</li>
          <li>• The content block logs email HTML to the Data Extension at send time</li>
        </ul>
      </div>

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
            <p>🔹 <strong>Data Extension:</strong> {configDetails.deName}</p>
            <p>🔹 <strong>DE Location:</strong> {configDetails.dePath}</p>
            <p>🔹 <strong>Description:</strong> {configDetails.description}</p>
            {configDetails.contentFolderName && (
              <p>🔹 <strong>Content Folder:</strong> {configDetails.contentFolderName}</p>
            )}
            {configDetails.contentBlockName && (
              <p>🔹 <strong>Content Block:</strong> {configDetails.contentBlockName} 
                {configDetails.contentBlockId && ` (ID: ${configDetails.contentBlockId})`}
                {configDetails.contentBlockAction && (
                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                    configDetails.contentBlockAction === 'created' ? 'bg-green-100 text-green-800' :
                    configDetails.contentBlockAction === 'updated' ? 'bg-blue-100 text-blue-800' :
                    configDetails.contentBlockAction === 'skipped_no_folder' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {configDetails.contentBlockAction === 'created' ? 'CREATED' :
                     configDetails.contentBlockAction === 'updated' ? 'UPDATED' :
                     configDetails.contentBlockAction === 'skipped_no_folder' ? 'SKIPPED' :
                     configDetails.contentBlockAction === 'search_failed' ? 'SEARCH FAILED' :
                     configDetails.contentBlockAction === 'create_failed' ? 'CREATE FAILED' :
                     configDetails.contentBlockAction === 'update_failed' ? 'UPDATE FAILED' :
                     configDetails.contentBlockAction?.toUpperCase()}
                  </span>
                )}
              </p>
            )}
            {configDetails.message && (
              <p className="mt-2 text-sm text-gray-600">💡 {configDetails.message}</p>
            )}
          </div>
        )}
        {configDetails && configDetails.contentBlockName && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-medium text-green-800 mb-2">✅ Next Steps:</h3>
            <ol className="text-green-700 space-y-1 text-sm list-decimal list-inside">
              <li>Go to Content Builder → {configDetails.contentFolderName}</li>
              <li>Find the "{configDetails.contentBlockName}" content block</li>
              <li>Add this block to any email template where you want to archive HTML</li>
              <li>The block will automatically log email HTML to the Data Extension when emails are sent</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailArchiving;
