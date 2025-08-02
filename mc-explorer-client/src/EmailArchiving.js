import React, { useState } from 'react';

function EmailArchiving() {
  const [archivingStep, setArchivingStep] = useState(0);
  const [archivingStatus, setArchivingStatus] = useState("");
  const [archivingDEName, setArchivingDEName] = useState("");
  const [archivingBlockName, setArchivingBlockName] = useState("");

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
