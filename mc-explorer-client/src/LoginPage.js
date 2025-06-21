import React, { useState } from 'react';

function LoginPage({ onConnect }) {
  const [formData, setFormData] = useState({
    subdomain: '',
    clientId: '',
    clientSecret: '',
    accountId: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-lg space-y-4">
        <h2 className="text-2xl font-bold text-center text-indigo-700 mb-4">Marketing Cloud Setup</h2>

        <div>
          <label className="block text-sm font-medium">Subdomain</label>
          <input
            type="text"
            name="subdomain"
            value={formData.subdomain}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
            placeholder="e.g., mc16yjrwn853grmhd9jpbgwr06f0"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Client ID</label>
          <input
            type="text"
            name="clientId"
            value={formData.clientId}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Client Secret</label>
          <input
            type="password"
            name="clientSecret"
            value={formData.clientSecret}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Account ID</label>
          <input
            type="text"
            name="accountId"
            value={formData.accountId}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition"
        >
          Connect
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
