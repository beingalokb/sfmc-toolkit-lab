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
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            console.log('✅ Auth callback success');
            localStorage.setItem('isAuthenticated', 'true');
            //navigate('/explorer');
            window.location.href = '/explorer?auth=1';

          } else {
            console.error('❌ Auth failed', data);
            navigate('/login');
          }
        })
        .catch(err => {
          console.error('🚨 Auth callback error:', err);
          navigate('/login');
        });
    } else {
      console.error('🚫 No auth code found in URL');
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
