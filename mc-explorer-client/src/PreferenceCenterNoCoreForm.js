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

  const handleSubmit = (e) => {
    e.preventDefault();
    const config = {
      name,
      subscriberId: subscriberId === 'Custom' ? customSubscriberField : subscriberId,
      categories,
      enableOptOut,
      optOutApiName: enableOptOut ? optOutApiName : '',
      enableAudit,
      submissionType,
      redirectUrl: submissionType === 'redirect' ? redirectUrl : '',
      deOption,
      existingDeName: deOption === 'existing' ? existingDeName : '',
      newDeName: deOption === 'create' ? newDeName : '',
      newDeFolder: deOption === 'create' ? newDeFolder : ''
    };
    if (onSubmit) onSubmit(config);
    // TODO: send to backend or preview next step
  };

  return (
    <form className="bg-white rounded shadow p-6 max-w-2xl mx-auto" onSubmit={handleSubmit}>
      <h2 className="text-xl font-bold mb-4 text-indigo-700">No Salesforce Core: Preference Center Builder</h2>
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
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">How many preferences do you want to include?</label>
        <input type="number" min={1} max={10} className="border rounded px-3 py-2 w-24" value={numCategories} onChange={e => handleNumCategories(Number(e.target.value))} required />
      </div>
      <div className="mb-4">
        <label className="block mb-2 font-semibold">Preference Categories</label>
        <div className="space-y-2">
          {categories.map((cat, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-2 items-center border-b pb-2">
              <input type="text" className="border rounded px-2 py-1 flex-1" placeholder="Category Label" value={cat.label} onChange={e => handleCategoryChange(idx, 'label', e.target.value)} required />
              <input type="text" className="border rounded px-2 py-1 flex-1" placeholder="Field API Name (DE)" value={cat.apiName} onChange={e => handleCategoryChange(idx, 'apiName', e.target.value)} required />
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={cat.defaultChecked} onChange={e => handleCategoryChange(idx, 'defaultChecked', e.target.checked)} /> Default Checked
              </label>
              <input type="text" className="border rounded px-2 py-1 flex-1" placeholder="Description (optional)" value={cat.description} onChange={e => handleCategoryChange(idx, 'description', e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Enable master opt-out checkbox?</label>
        <input type="checkbox" checked={enableOptOut} onChange={e => setEnableOptOut(e.target.checked)} />
        {enableOptOut && (
          <input type="text" className="border rounded px-3 py-2 w-full mt-2" placeholder="Opt-Out Field API Name (e.g., Opt_Out_All__c)" value={optOutApiName} onChange={e => setOptOutApiName(e.target.value)} required />
        )}
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Enable preference change logging?</label>
        <input type="checkbox" checked={enableAudit} onChange={e => setEnableAudit(e.target.checked)} />
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
            <input type="text" className="border rounded px-3 py-2 w-full mt-2" placeholder="Folder Path (e.g., Data Extensions/Preference Centers)" value={newDeFolder} onChange={e => setNewDeFolder(e.target.value)} required />
          </>
        )}
      </div>
      <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded mt-2">Next: Preview & Generate</button>
    </form>
  );
}
