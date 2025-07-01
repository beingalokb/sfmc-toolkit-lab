import React, { useState } from 'react';

export default function CredentialSetup({ onSetup }) {
  const [subdomain, setSubdomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Save to localStorage
      localStorage.setItem('mc_subdomain', subdomain);
      localStorage.setItem('mc_clientId', clientId);
      localStorage.setItem('mc_clientSecret', clientSecret);
      // Call backend
      const res = await fetch('/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, clientId, clientSecret })
      });
      if (!res.ok) throw new Error('Failed to save credentials');
      // Redirect to login
      window.location.href = '/auth/login';
      if (onSetup) onSetup();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-indigo-700">Enter Marketing Cloud Credentials</h2>
        {error && <div className="text-red-600 mb-4">{error}</div>}
        <label className="block mb-2 font-semibold">Subdomain</label>
        <input type="text" className="border rounded px-3 py-2 w-full mb-4" value={subdomain} onChange={e => setSubdomain(e.target.value)} required placeholder="e.g. mc1234xxx" />
        <label className="block mb-2 font-semibold">Client ID</label>
        <input type="text" className="border rounded px-3 py-2 w-full mb-4" value={clientId} onChange={e => setClientId(e.target.value)} required />
        <label className="block mb-2 font-semibold">Client Secret</label>
        <input type="password" className="border rounded px-3 py-2 w-full mb-6" value={clientSecret} onChange={e => setClientSecret(e.target.value)} required />
        <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-semibold" disabled={loading}>
          {loading ? 'Saving...' : 'Save & Login'}
        </button>
      </form>
    </div>
  );
}
