import React, { useState } from 'react';

const SUBSCRIBER_OPTIONS = [
  { value: 'EmailAddress', label: 'Email Address' },
  { value: 'SubscriberKey', label: 'Subscriber Key' },
  { value: 'Custom', label: 'Custom Field' }
];

export default function PreferenceCenterNoCoreForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [subscriberId, setSubscriberId] = useState('EmailAddress');
  const [customSubscriberField, setCustomSubscriberField] = useState('');
  const [numCategories, setNumCategories] = useState(1);
  const [categories, setCategories] = useState([
    { label: '', apiName: '', defaultChecked: false, description: '' }
  ]);
  const [enableOptOut, setEnableOptOut] = useState(false);
  const [optOutApiName, setOptOutApiName] = useState('');
  const [enableAudit, setEnableAudit] = useState(false);
  const [submissionType, setSubmissionType] = useState('message');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [deOption, setDeOption] = useState('create');
  const [existingDeName, setExistingDeName] = useState('');
  const [newDeName, setNewDeName] = useState('');
  const [newDeFolder, setNewDeFolder] = useState('');
  const [queryParam, setQueryParam] = useState(''); // NEW: Query Parameter for Subscriber
  const [showCategories, setShowCategories] = useState(true); // Collapsible
  const [reorderMode, setReorderMode] = useState(false); // Reorder toggle
  const [auditDeName, setAuditDeName] = useState(''); // Audit log DE name
  const [auditDeFolder, setAuditDeFolder] = useState(''); // Audit log DE folder
  const [folderValidation, setFolderValidation] = useState(null); // Folder validation result
  const [customFields, setCustomFields] = useState({ timestamp: false, ip: false, region: false });
  const [theme, setTheme] = useState('default');
  const [logoUrl, setLogoUrl] = useState('');
  const [buttonColor, setButtonColor] = useState('#4f46e5');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [enableErrorLog, setEnableErrorLog] = useState(false);
  const [errorLogDeName, setErrorLogDeName] = useState('');
  const [errorLogDeFolder, setErrorLogDeFolder] = useState('');
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState('');

  // Handle dynamic category rows
  const handleNumCategories = (n) => {
    setNumCategories(n);
    setCategories(prev => {
      const arr = [...prev];
      while (arr.length < n) arr.push({ label: '', apiName: '', defaultChecked: false, description: '' });
      return arr.slice(0, n);
    });
  };

  const handleCategoryChange = (idx, field, value) => {
    setCategories(prev => prev.map((cat, i) => i === idx ? { ...cat, [field]: value } : cat));
  };

  // Preference reorder logic
  const moveCategory = (from, to) => {
    setCategories(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  };

  // Opt-out field validation
  const optOutConflict = enableOptOut && categories.some(cat => cat.apiName === optOutApiName);

  // Folder validation handler (dummy, to be replaced with API call)
  const handleValidateFolder = async () => {
    // TODO: Call backend /folders API
    setFolderValidation('Validating...');
    // Simulate async
    setTimeout(() => setFolderValidation('Valid (demo)'), 1000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rawJsonMode) {
      try {
        const parsed = JSON.parse(rawJson);
        if (onSubmit) onSubmit(parsed);
      } catch (err) {
        alert('Invalid JSON');
      }
      return;
    }
    if (optOutConflict) {
      alert('Opt-out field name cannot match any preference field API name.');
      return;
    }
    // Build full MC project JSON structure
    const projectJson = {
      appVersion: '240.3.42',
      id: '',
      name,
      version: 1,
      modelVersion: '4',
      references: {}, // TODO: Build references from form if needed
      input: [], // TODO: Build input array from form if needed
      config: {
        preserveCategories: true,
        storeImagesAsReferences: false
      },
      entities: {
        categories: {}, // TODO: Build categories from form
        dataExtensions: {}, // TODO: Build DEs from form
        automations: {}, // TODO: Build automations from form
        landingPages: {}, // TODO: Build landingPages from form
        primaryLandingPages: {}, // TODO: Build primaryLandingPages from form
        queryActivities: {}, // TODO: Build queryActivities from form
        cloudPageCollections: {}, // TODO: Build cloudPageCollections from form
        // ...add other entity types as needed
      },
      selectedEntities: {
        assets: [],
        attributeGroups: [],
        automations: [],
        cloudPageCollections: [],
        dataExtensions: [],
        journeys: [],
        journeyTemplates: [],
        sharedDataExtensions: []
      }
    };
    // TODO: Populate projectJson.entities and references from form state
    if (onSubmit) onSubmit(projectJson);
  };

  return (
    <form className="bg-white rounded shadow p-6 max-w-2xl mx-auto" onSubmit={handleSubmit}>
      <h2 className="text-xl font-bold mb-4 text-indigo-700">No Salesforce Core: Preference Center Builder</h2>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Mode</label>
        <select className="border rounded px-3 py-2 w-full" value={rawJsonMode ? 'raw' : 'form'} onChange={e => setRawJsonMode(e.target.value === 'raw')}>
          <option value="form">Form Mode</option>
          <option value="raw">Raw JSON</option>
        </select>
      </div>
      {rawJsonMode ? (
        <div className="mb-4">
          <label className="block mb-1 font-semibold">Paste/Edit Full MC Project JSON</label>
          <textarea className="border rounded px-3 py-2 w-full h-96 font-mono text-xs" value={rawJson} onChange={e => setRawJson(e.target.value)} placeholder="Paste full MC project JSON here..." />
        </div>
      ) : (
        <>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Preference Center Name</label>
            <input type="text" className="border rounded px-3 py-2 w-full" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Subscriber Identifier</label>
            <select className="border rounded px-3 py-2 w-full" value={subscriberId} onChange={e => setSubscriberId(e.target.value)}>
              {SUBSCRIBER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {subscriberId === 'Custom' && (
              <input type="text" className="border rounded px-3 py-2 w-full mt-2" placeholder="Custom Field Name" value={customSubscriberField} onChange={e => setCustomSubscriberField(e.target.value)} required />
            )}
            <input type="text" className="border rounded px-3 py-2 w-full mt-2" placeholder="Query Parameter (optional)" value={queryParam} onChange={e => setQueryParam(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">How many preferences do you want to include?</label>
            <input type="number" min={1} max={10} className="border rounded px-3 py-2 w-24" value={numCategories} onChange={e => handleNumCategories(Number(e.target.value))} required />
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-semibold">Preference Categories</label>
            {categories.length > 4 && (
              <div className="flex items-center gap-4 mb-2">
                <button type="button" className="text-indigo-600 underline" onClick={() => setShowCategories(v => !v)}>{showCategories ? 'Hide' : 'Show'} Preferences</button>
                <button type="button" className="text-indigo-600 underline" onClick={() => setReorderMode(v => !v)}>{reorderMode ? 'Done Reordering' : 'Reorder'}</button>
              </div>
            )}
            {showCategories && (
              <div className="space-y-2">
                {categories.map((cat, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row gap-2 items-center border-b pb-2">
                    <input type="text" className="border rounded px-2 py-1 flex-1" placeholder="Category Label" value={cat.label} onChange={e => handleCategoryChange(idx, 'label', e.target.value)} required />
                    <input type="text" className="border rounded px-2 py-1 flex-1" placeholder="Field API Name (DE)" value={cat.apiName} onChange={e => handleCategoryChange(idx, 'apiName', e.target.value)} required />
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={cat.defaultChecked} onChange={e => handleCategoryChange(idx, 'defaultChecked', e.target.checked)} /> Default Checked
                    </label>
                    <input type="text" className="border rounded px-2 py-1 flex-1" placeholder="Description (optional)" value={cat.description} onChange={e => handleCategoryChange(idx, 'description', e.target.value)} />
                    {reorderMode && (
                      <div className="flex flex-col gap-1 ml-2">
                        <button type="button" disabled={idx === 0} onClick={() => moveCategory(idx, idx - 1)} className="text-xs">↑</button>
                        <button type="button" disabled={idx === categories.length - 1} onClick={() => moveCategory(idx, idx + 1)} className="text-xs">↓</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Enable master opt-out checkbox?</label>
            <input type="checkbox" checked={enableOptOut} onChange={e => setEnableOptOut(e.target.checked)} />
            {enableOptOut && (
              <input type="text" className={`border rounded px-3 py-2 w-full mt-2 ${optOutConflict ? 'border-red-500' : ''}`} placeholder="Opt-Out Field API Name (e.g., Opt_Out_All__c)" value={optOutApiName} onChange={e => setOptOutApiName(e.target.value)} required />
            )}
            {optOutConflict && <div className="text-red-600 text-sm mt-1">Opt-out field name cannot match any preference field API name.</div>}
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Enable preference change logging?</label>
            <input type="checkbox" checked={enableAudit} onChange={e => setEnableAudit(e.target.checked)} />
            {enableAudit && (
              <div className="flex flex-col gap-2 mt-2">
                <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Audit Log DE Name" value={auditDeName} onChange={e => setAuditDeName(e.target.value)} />
                <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Audit Log DE Folder" value={auditDeFolder} onChange={e => setAuditDeFolder(e.target.value)} />
              </div>
            )}
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">After submission, show confirmation message or redirect?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1">
                <input type="radio" name="submissionType" value="message" checked={submissionType === 'message'} onChange={() => setSubmissionType('message')} /> Confirmation Message
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="submissionType" value="redirect" checked={submissionType === 'redirect'} onChange={() => setSubmissionType('redirect')} /> Redirect to URL
              </label>
            </div>
            {submissionType === 'redirect' && (
              <input type="url" className="border rounded px-3 py-2 w-full mt-2" placeholder="Redirect URL" value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)} required />
            )}
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Create new Data Extension or use existing?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1">
                <input type="radio" name="deOption" value="create" checked={deOption === 'create'} onChange={() => setDeOption('create')} /> Create New
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="deOption" value="existing" checked={deOption === 'existing'} onChange={() => setDeOption('existing')} /> Use Existing
              </label>
            </div>
            {deOption === 'existing' && (
              <input type="text" className="border rounded px-3 py-2 w-full mt-2" placeholder="Existing DE Name" value={existingDeName} onChange={e => setExistingDeName(e.target.value)} required />
            )}
            {deOption === 'create' && (
              <>
                <input type="text" className="border rounded px-3 py-2 w-full mt-2" placeholder="New DE Name" value={newDeName} onChange={e => setNewDeName(e.target.value)} required />
                <div className="flex gap-2 mt-2">
                  <input type="text" className="border rounded px-3 py-2 flex-1" placeholder="Folder Path (e.g., Data Extensions/Preference Centers)" value={newDeFolder} onChange={e => setNewDeFolder(e.target.value)} required />
                  <button type="button" className="bg-gray-200 px-2 rounded" onClick={handleValidateFolder}>Validate Folder Path</button>
                </div>
                {folderValidation && <div className="text-sm mt-1">{folderValidation}</div>}
              </>
            )}
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Advanced Field Mapping</label>
            <div className="flex gap-4">
              <label><input type="checkbox" checked={customFields.timestamp} onChange={e => setCustomFields(f => ({ ...f, timestamp: e.target.checked }))} /> Timestamp</label>
              <label><input type="checkbox" checked={customFields.ip} onChange={e => setCustomFields(f => ({ ...f, ip: e.target.checked }))} /> IP Address</label>
              <label><input type="checkbox" checked={customFields.region} onChange={e => setCustomFields(f => ({ ...f, region: e.target.checked }))} /> Region</label>
            </div>
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Form Styling</label>
            <div className="flex flex-col gap-2">
              <select className="border rounded px-3 py-2" value={theme} onChange={e => setTheme(e.target.value)}>
                <option value="default">Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <input type="text" className="border rounded px-3 py-2" placeholder="Logo URL (optional)" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
              <input type="color" className="w-12 h-8" value={buttonColor} onChange={e => setButtonColor(e.target.value)} />
            </div>
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Custom Success/Error Messages</label>
            <input type="text" className="border rounded px-3 py-2 w-full mb-2" placeholder="Success Message" value={successMsg} onChange={e => setSuccessMsg(e.target.value)} />
            <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Error Message" value={errorMsg} onChange={e => setErrorMsg(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Enable error logging to DE?</label>
            <input type="checkbox" checked={enableErrorLog} onChange={e => setEnableErrorLog(e.target.checked)} />
            {enableErrorLog && (
              <div className="flex flex-col gap-2 mt-2">
                <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Error Log DE Name" value={errorLogDeName} onChange={e => setErrorLogDeName(e.target.value)} />
                <input type="text" className="border rounded px-3 py-2 w-full" placeholder="Error Log DE Folder" value={errorLogDeFolder} onChange={e => setErrorLogDeFolder(e.target.value)} />
              </div>
            )}
          </div>
        </>
      )}
      <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded mt-2">{rawJsonMode ? 'Submit JSON' : 'Next: Preview & Generate'}</button>
    </form>
  );
}
