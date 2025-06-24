import React, { useState } from 'react';

const ROUTE_OPTIONS = [
  { value: 'noCore', label: 'Standalone (No Salesforce Core)' },
  { value: 'withCore', label: 'With Salesforce Core (Leads/Contacts)' },
  { value: 'withConsent', label: 'With Consent Management' }
];

export default function PreferenceCenterProjectForm({ onSuccess }) {
  const [name, setName] = useState('');
  const [routeType, setRouteType] = useState('noCore');
  const [targetBU, setTargetBU] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch('/api/preference-center/project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        },
        body: JSON.stringify({ name, routeType, targetBU })
      });
      if (!res.ok) throw new Error('Failed to create project');
      setSuccess(true);
      setName('');
      setRouteType('noCore');
      setTargetBU('');
      if (onSuccess) onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="bg-white rounded shadow p-6 max-w-lg mx-auto" onSubmit={handleSubmit}>
      <h2 className="text-xl font-bold mb-4 text-indigo-700">Create Preference Center Project</h2>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Preference Center Name</label>
        <input type="text" className="border rounded px-3 py-2 w-full" value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Route Type</label>
        <select className="border rounded px-3 py-2 w-full" value={routeType} onChange={e => setRouteType(e.target.value)}>
          {ROUTE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">CloudPage Target BU</label>
        <input type="text" className="border rounded px-3 py-2 w-full" value={targetBU} onChange={e => setTargetBU(e.target.value)} required />
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {success && <div className="text-green-600 mb-2">Project created successfully!</div>}
      <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded" disabled={loading}>
        {loading ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
