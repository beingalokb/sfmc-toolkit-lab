import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';


function SetupForm() {
  const [formData, setFormData] = useState({
    subdomain: '',
    clientId: '',
    clientSecret: '',
    accountId: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');

  try {
    const response = await fetch('/save-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    if (data.redirectUrl) {
      console.log("Redirecting to:", data.redirectUrl);
      window.location.href = data.redirectUrl;
    } else {
      setError('Failed to receive redirect URL from server.');
    }
  } catch (err) {
    console.error('Credential submission failed:', err);
    setError('Failed to save credentials. Please double-check and try again.');
  }
};


  

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-indigo-700 mb-6">Marketing Cloud Setup</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="subdomain"
            placeholder="MC Subdomain (e.g., mc1234z9)"
            value={formData.subdomain}
            onChange={handleChange}
            required
            className="w-full p-3 border border-gray-300 rounded"
          />
          <input
            type="text"
            name="clientId"
            placeholder="Client ID"
            value={formData.clientId}
            onChange={handleChange}
            required
            className="w-full p-3 border border-gray-300 rounded"
          />
          <input
            type="text"
            name="clientSecret"
            placeholder="Client Secret"
            value={formData.clientSecret}
            onChange={handleChange}
            required
            className="w-full p-3 border border-gray-300 rounded"
          />
          <input
            type="text"
            name="accountId"
            placeholder="MID / Account ID"
            value={formData.accountId}
            onChange={handleChange}
            required
            className="w-full p-3 border border-gray-300 rounded"
          />
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
          >
            Continue to Explorer
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}
      </div>
    </div>
  );
}

export default SetupForm;
