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
            { name: 'EmailAddress', fieldType: 'EmailAddress' },
            { name: 'SendTime', fieldType: 'Date' },
            { name: 'EmailName', fieldType: 'Text', maxLength: 100 },
            { name: 'HTML', fieldType: 'Text' }, // No maxLength = unlimited
            { name: 'ListID', fieldType: 'Number' },
            { name: 'JobID', fieldType: 'Number' },
            { name: 'DataSourceName', fieldType: 'Text', maxLength: 500 }
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
      console.log('📧 [Frontend] Loading emails...');
      const response = await fetch(`${baseURL}/emails/list`);
      const emailData = await response.json();
      
      console.log('📧 [Frontend] Email data received:', emailData);
      
      if (Array.isArray(emailData)) {
        console.log(`📧 [Frontend] Setting ${emailData.length} emails`);
        // Initialize emails with archiveReady as undefined (checking state)
        const emailsWithArchiveStatus = emailData.map(email => ({
          ...email,
          archiveReady: undefined
        }));
        setEmails(emailsWithArchiveStatus);
        
        // Check archive status for each email
        checkArchiveStatus(emailsWithArchiveStatus);
      } else {
        console.error('📧 [Frontend] Invalid email data received:', emailData);
        setEmails([]);
      }
    } catch (error) {
      console.error('📧 [Frontend] Error loading emails:', error);
      setEmails([]);
    } finally {
      setEmailsLoading(false);
    }
  };

  const checkArchiveStatus = async (emailList) => {
    console.log('📧 [Frontend] Checking archive status for emails...');
    try {
      const response = await fetch(`${baseURL}/emails/check-archive-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emailIds: emailList.map(email => email.id)
        })
      });

      const statusData = await response.json();
      console.log('📧 [Frontend] Archive status received:', statusData);

      if (statusData && statusData.results) {
        // Update emails with archive status
        setEmails(prevEmails => 
          prevEmails.map(email => {
            const statusResult = statusData.results.find(result => result.emailId === email.id);
            return {
              ...email,
              archiveReady: statusResult ? statusResult.hasArchiveBlock : false
            };
          })
        );
      }
    } catch (error) {
      console.error('📧 [Frontend] Error checking archive status:', error);
      // Set all emails to false if check fails
      setEmails(prevEmails => 
        prevEmails.map(email => ({
          ...email,
          archiveReady: false
        }))
      );
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
        let message = `Processing completed!\n\n`;
        message += `✅ Successfully updated: ${result.successCount} emails\n`;
        if (result.skippedCount > 0) {
          message += `⏭️ Skipped: ${result.skippedCount} emails (already had archiving block or no HTML content)\n`;
        }
        if (result.errorCount > 0) {
          message += `❌ Errors: ${result.errorCount} emails\n`;
        }
        
        message += `\nSee console for detailed results.`;
        
        // Log detailed results to console
        console.log('📧 [Email Archive Block] Detailed Results:', result.results);
        
        alert(message);
        setSelectedEmails(new Set()); // Clear selection
        
        // Refresh archive status after updates
        checkArchiveStatus(emails);
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
            <div className="text-green-700 space-y-1 text-sm">
              <p className="font-medium">To archive complete email HTML content without truncation, please follow these one-time steps:</p>
              <ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
                <li>Go to the HTML_Log data extension</li>
                <li>Click Edit Fields</li>
                <li>Locate the HTML field and clear the "Length" value</li>
                <li>Save the changes</li>
              </ol>
            </div>
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
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Archive Ready
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {emails.map((email, index) => {
                      if (!email || !email.id) {
                        console.warn(`📧 [Frontend] Invalid email at index ${index}:`, email);
                        return null;
                      }
                      
                      return (
                        <tr key={`${email.id}-${index}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedEmails.has(email.id)}
                              onChange={(e) => handleEmailSelection(email.id, e.target.checked)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{email.id}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{email.name || 'Untitled'}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              email.archiveReady === true ? 'bg-green-100 text-green-800' :
                              email.archiveReady === false ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {email.archiveReady === true ? 'True' :
                               email.archiveReady === false ? 'False' :
                               'Checking...'}
                            </span>
                          </td>
                        </tr>
                      );
                    }).filter(Boolean)}
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
