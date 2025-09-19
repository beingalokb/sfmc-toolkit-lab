import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const baseURL = process.env.REACT_APP_BASE_URL;

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');

    if (code) {
      console.log('🟢 Auth code received:', code);

      fetch(`${baseURL}/auth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code })
      })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success && data.accessToken && data.subdomain) {
            console.log('✅ Auth callback success', data);
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('subdomain', data.subdomain);
            window.location.href = '/explorer?auth=1';
          } else {
            console.error('❌ Auth failed', data);
            alert('Authentication failed: ' + (data.error || 'Unknown error. Please try again.'));
            navigate('/login');
          }
        })
        .catch(err => {
          console.error('🚨 Auth callback error:', err);
          alert('Network error during authentication. Please try again.');
          navigate('/login');
        });
    } else {
      console.error('🚫 No auth code found in URL');
      alert('No authorization code found. Please try logging in again.');
      navigate('/login');
    }
  }, [navigate]);

  return (
    <div className="flex justify-center items-center h-screen text-lg">
      Verifying credentials and logging in...
    </div>
  );
}

export default AuthCallback;
