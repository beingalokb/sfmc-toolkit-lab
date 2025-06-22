import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import LoginPage from './LoginPage';

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
        <Route path="/" element={<LoginPage />} />
        <Route path="/setup" element={<SetupForm />} />
        <Route path="/explorer/*" element={isAuthenticated ? <MainApp /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
