import React, { useState } from 'react';

const baseURL = process.env.REACT_APP_BASE_URL;

function EmailArchiving() {
  // Configuration state variables (similar to DM QS)
  const [configLoading, setConfigLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [configDetails, setConfigDetails] = useState(null);
  
  // Email list state variables
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emails, setEmails] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [addingBlockLoading, setAddingBlockLoading] = useState(false);

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
        
        // Load emails after successful setup
        if (data.contentBlockId) {
          loadEmails();
        }
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

  const loadEmails = async () => {
    setEmailsLoading(true);
    try {
      const response = await fetch(`${baseURL}/emails/list`);
      const emailData = await response.json();
      
      if (Array.isArray(emailData)) {
        setEmails(emailData);
      } else {
        console.error('Invalid email data received:', emailData);
        setEmails([]);
      }
    } catch (error) {
      console.error('Error loading emails:', error);
      setEmails([]);
    } finally {
      setEmailsLoading(false);
    }
  };

  const handleEmailSelection = (emailId, isSelected) => {
    const newSelection = new Set(selectedEmails);
    if (isSelected) {
      newSelection.add(emailId);
    } else {
      newSelection.delete(emailId);
    }
    setSelectedEmails(newSelection);
  };

  const handleSelectAll = (isSelected) => {
    if (isSelected) {
      setSelectedEmails(new Set(emails.map(email => email.id)));
    } else {
      setSelectedEmails(new Set());
    }
  };

  const handleAddArchivingBlock = async () => {
    if (selectedEmails.size === 0) {
      alert('Please select at least one email');
      return;
    }

    if (!configDetails?.contentBlockId) {
      alert('Content block ID not available');
      return;
    }

    setAddingBlockLoading(true);
    try {
      const response = await fetch(`${baseURL}/emails/add-archiving-block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailIds: Array.from(selectedEmails),
          contentBlockId: configDetails.contentBlockId
        })
      });

      const result = await response.json();
      
      if (result.status === 'completed') {
        alert(`Successfully processed ${result.successCount} emails! (${result.errorCount} errors)`);
        setSelectedEmails(new Set()); // Clear selection
      } else {
        alert('Failed to add archiving block to emails');
      }
    } catch (error) {
      console.error('Error adding archiving block:', error);
      alert('Error adding archiving block to emails');
    } finally {
      setAddingBlockLoading(false);
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

      {/* Email List Section - Show after successful setup */}
      {configDetails && configDetails.contentBlockId && (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold text-indigo-700 mb-4">
            📧 Add Archiving Block to Emails
          </h3>
          
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              💡 Select emails below to automatically add the MCX_ArchivingBlock content block. 
              This will enable email HTML archiving for those emails.
            </p>
          </div>

          {emailsLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No emails found in your account.</p>
              <button 
                onClick={loadEmails}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry Loading Emails
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedEmails.size === emails.length && emails.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">
                      Select All ({selectedEmails.size} of {emails.length} selected)
                    </span>
                  </label>
                </div>
                
                <button
                  onClick={handleAddArchivingBlock}
                  disabled={selectedEmails.size === 0 || addingBlockLoading}
                  className={`px-4 py-2 rounded text-white font-medium ${
                    selectedEmails.size === 0 || addingBlockLoading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {addingBlockLoading 
                    ? 'Adding Block...' 
                    : `Add Archiving Block to ${selectedEmails.size} Email${selectedEmails.size !== 1 ? 's' : ''}`
                  }
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Select
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subject
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {emails.map((email) => (
                      <tr key={email.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedEmails.has(email.id)}
                            onChange={(e) => handleEmailSelection(email.id, e.target.checked)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{email.name}</div>
                          <div className="text-sm text-gray-500">ID: {email.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{email.subject}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            email.status === 'Active' ? 'bg-green-100 text-green-800' :
                            email.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {email.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {email.emailType}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            email.source === 'SOAP-Classic' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {email.source === 'SOAP-Classic' ? 'Classic' : 'Content Builder'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {email.createdDate ? new Date(email.createdDate).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EmailArchiving;
