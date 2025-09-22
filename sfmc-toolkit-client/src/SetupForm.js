import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function SetupForm() {
  const [subdomain, setSubdomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!subdomain.trim()) {
      setError('Please enter your Marketing Cloud subdomain');
      setLoading(false);
      return;
    }

    try {
      // Start OAuth flow with subdomain
      const response = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: subdomain.trim() }),
      });

      const data = await response.json();
      
      if (response.ok && data.authUrl) {
        console.log("🔁 Redirecting to OAuth:", data.authUrl);
        window.location.href = data.authUrl;
      } else {
        setError(data.error || 'Failed to start OAuth flow. Please check your subdomain.');
        setLoading(false);
      }
    } catch (err) {
      console.error('OAuth start failed:', err);
      setError('Failed to connect to authentication service. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-indigo-700 mb-2">SFMC Toolkit Labs</h1>
          <p className="text-gray-600 text-sm">Secure OAuth Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700 mb-2">
              Marketing Cloud Subdomain
            </label>
            <input
              id="subdomain"
              type="text"
              placeholder="e.g., mc1234z9"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              required
              disabled={loading}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Find this in your Marketing Cloud URL: https://<strong>subdomain</strong>.auth.marketingcloudapis.com
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !subdomain.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Starting OAuth...
              </>
            ) : (
              'Login with Marketing Cloud'
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Secure OAuth 2.0 flow - No credentials stored locally
          </p>
        </div>
      </div>
    </div>
  );
}

export default SetupForm;
