import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import LoginPage from './LoginPage';
import AuthCallback from './AuthCallback'; // 👈 import it

// 🔐 Global auth flag setter
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === '1') {
  console.log('✅ Auth param detected. Setting localStorage.');
  localStorage.setItem('isAuthenticated', 'true');
  window.history.replaceState({}, document.title, window.location.pathname);
}

function App() {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  console.log('🔐 Local auth status:', isAuthenticated);

  return (
<Router>
<Routes>
<Route path="/login" element={<LoginPage />} />
<Route path="/" element={isAuthenticated ? <SetupForm /> : <Navigate to="/login" />} />
<Route path="/auth/callback" element={<AuthCallback />} />  {/* 👈 add this */}
<Route path="/explorer/*" element={isAuthenticated ? <MainApp /> : <Navigate to="/login" />} />
</Routes>
</Router>
  );
}

export default App;
