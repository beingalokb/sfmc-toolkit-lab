import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Verifying credentials and logging in...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');

        if (error) {
          console.error('🚫 OAuth error:', error);
          setMessage('OAuth authorization was denied or failed');
          setTimeout(() => navigate('/setup'), 3000);
          return;
        }

        if (!code) {
          console.error('🚫 No authorization code found');
          setMessage('No authorization code received');
          setTimeout(() => navigate('/setup'), 3000);
          return;
        }

        console.log('🟢 Auth code received:', code);
        setMessage('Exchanging authorization code for access token...');

        // Exchange code for tokens using our OAuth callback endpoint
        const response = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Include session cookies
          body: JSON.stringify({ code, state })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          console.log('✅ OAuth callback success');
          setMessage('Authentication successful! Redirecting...');
          
          // Update global auth state
          if (window.updateAuthStatus) {
            window.updateAuthStatus(true);
          }
          
          // Redirect to main app
          setTimeout(() => navigate('/explorer'), 1000);
        } else {
          console.error('❌ OAuth callback failed:', data);
          setMessage(`Authentication failed: ${data.error || 'Unknown error'}`);
          setTimeout(() => navigate('/setup'), 3000);
        }
      } catch (err) {
        console.error('🚨 Auth callback error:', err);
        setMessage('Network error during authentication. Please try again.');
        setTimeout(() => navigate('/setup'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-md">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Processing Authentication</h2>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

export default AuthCallback;
