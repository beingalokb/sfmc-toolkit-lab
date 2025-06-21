// LoginPage.js
import React, { useState } from 'react';
import logo from './assets/mc-explorer-logo.jpg';

function LoginPage({ onSubmit }) {
  const [subdomain, setSubdomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!subdomain || !clientId || !clientSecret || !accountId) {
      setError('All fields are required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_BASE_URL}/save-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, clientId, clientSecret, accountId })
      });
      const data = await res.json();
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError('Connection failed. Please check your inputs.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-indigo-100 to-indigo-200 p-4">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="Logo" className="h-20 w-20 rounded-full shadow" />
          <h1 className="mt-4 text-3xl font-bold text-indigo-700">MC Explorer</h1>
          <p className="text-sm text-gray-600">Connect to your Marketing Cloud instance</p>
        </div>

        {/* We'll add the input fields and button next */}
      </div>
    </div>
  );
}

export default LoginPage;
