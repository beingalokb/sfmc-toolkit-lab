import React from 'react';

function LoginPage() {
  const clientId = process.env.REACT_APP_CLIENT_ID;
  const authDomain = process.env.REACT_APP_AUTH_DOMAIN;
  const redirectUri = process.env.REACT_APP_REDIRECT_URI;

  console.log("🧪 env - clientId:", clientId);
  console.log("🧪 env - authDomain:", authDomain);
  console.log("🧪 env - redirectUri:", redirectUri);

  const authUrl = `https://${authDomain}/v2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

  const handleLogin = () => {
    try {
      console.log("🔁 Redirecting to:", authUrl);
      window.location.href = authUrl;  // ✅ redirect instead of fetch
    } catch (error) {
      console.error("❌ Failed to redirect to auth URL", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-indigo-700 mb-6">Welcome to MC Explorer</h1>
        <p className="mb-4 text-gray-600">Click below to login with your Marketing Cloud user</p>
        <button
          onClick={handleLogin}
          className="bg-indigo-600 text-white px-6 py-3 rounded-md text-lg font-semibold hover:bg-indigo-700 shadow"
        >
          Login with Marketing Cloud
        </button>
      </div>
    </div>
  );
}

export default LoginPage;
