import React, { useState } from 'react';

const baseURL = process.env.REACT_APP_BASE_URL;

function EmailArchiving() {
  const [archivingStep, setArchivingStep] = useState(0);
  const [archivingStatus, setArchivingStatus] = useState("");
  const [archivingDEName, setArchivingDEName] = useState("");
  const [archivingBlockName, setArchivingBlockName] = useState("");
  
  // Configuration state variables
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
        setConfigStatus("✅ Email Archive Data Extension created successfully!");
        setConfigDetails({
          deName: data.deName,
          dePath: data.dePath || `/Data Extensions / ${data.folderName}`,
          folderName: data.folderName,
          description: data.description
        });
      } else {
        setConfigStatus("❌ Failed to create Email Archive Data Extension");
      }
    } catch (error) {
      setConfigStatus("❌ Error creating Email Archive Data Extension");
      console.error('Error:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleCreateArchivingDE = async () => {
    setArchivingStatus("Creating Email Archiving Data Extension...");
    try {
      const res = await fetch('/api/email-archiving/create-de', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'OK') {
        setArchivingDEName(data.deName);
        setArchivingStatus("✅ Data Extension created successfully!");
        setArchivingStep(1);
      } else {
        setArchivingStatus("❌ Failed to create Data Extension");
      }
    } catch (error) {
      setArchivingStatus("❌ Error creating Data Extension");
    }
  };

  const handleCreateContentBlock = async () => {
    setArchivingStatus("Creating Email Archiving Content Block...");
    try {
      const res = await fetch('/api/email-archiving/create-content-block', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'OK') {
        setArchivingBlockName(data.blockName);
        setArchivingStatus("✅ Content Block created successfully!");
        setArchivingStep(2);
      } else {
        setArchivingStatus("❌ Failed to create Content Block");
      }
    } catch (error) {
      setArchivingStatus("❌ Error creating Content Block");
    }
  };

  const handleApplyArchiving = async () => {
    setArchivingStatus("Applying archiving to future emails...");
    try {
      const res = await fetch('/api/email-archiving/apply-future-emails', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'OK') {
        setArchivingStatus("✅ Email Archiving setup completed!");
        setArchivingStep(3);
      } else {
        setArchivingStatus("❌ Failed to apply archiving");
      }
    } catch (error) {
      setArchivingStatus("❌ Error applying archiving");
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6 text-indigo-700">Email Archiving Setup</h2>
      
      <div className="mb-6">
        <button
          className={`px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 mb-6 ${configLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={handleEmailArchiveConfiguration}
          disabled={configLoading}
        >
          {configLoading ? "Creating..." : "Email Archiving Configuration"}
        </button>
        
        {/* Configuration Status and Details */}
        {configStatus && (
          <div className="mt-4 text-gray-700 space-y-2">
            <p className="text-lg font-medium">{configStatus}</p>
            {configDetails && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p>🔹 <strong>DE Name:</strong> {configDetails.deName}</p>
                <p>🔹 <strong>DE Path:</strong> {configDetails.dePath}</p>
                <p>🔹 <strong>Folder:</strong> {configDetails.folderName}</p>
                <p>🔹 <strong>Description:</strong> {configDetails.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="mb-6">
        <div className="flex justify-center mb-4">
          {['Create DE', 'Create Block', 'Apply Archiving'].map((step, index) => (
            <div
              key={index}
              className={`px-4 py-2 mx-2 rounded-lg border ${
                archivingStep >= index
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              Step {index + 1}: {step}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {archivingStep === 0 && (
          <div>
            <p className="mb-4 text-gray-700">
              Step 1: Create a Data Extension to store email archiving logs.
            </p>
            <button
              onClick={handleCreateArchivingDE}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create Archiving Data Extension
            </button>
          </div>
        )}

        {archivingStep === 1 && (
          <div>
            <p className="mb-4 text-gray-700">
              Step 2: Create a Content Block for email archiving.
            </p>
            <p className="mb-4 text-sm text-gray-600">
              Data Extension: <strong>{archivingDEName}</strong>
            </p>
            <button
              onClick={handleCreateContentBlock}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create Content Block
            </button>
          </div>
        )}

        {archivingStep === 2 && (
          <div>
            <p className="mb-4 text-gray-700">
              Step 3: Apply archiving block to future emails.
            </p>
            <p className="mb-4 text-sm text-gray-600">
              Content Block: <strong>{archivingBlockName}</strong>
            </p>
            <button
              onClick={handleApplyArchiving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Apply to Future Emails
            </button>
          </div>
        )}

        {archivingStep === 3 && (
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h3 className="text-lg font-semibold text-green-800 mb-2">Setup Complete!</h3>
            <p className="text-green-700">
              Email archiving has been successfully configured for future emails.
            </p>
          </div>
        )}
      </div>

      {archivingStatus && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
          <p className="text-lg font-medium">{archivingStatus}</p>
        </div>
      )}
    </div>
  );
}

export default EmailArchiving;
