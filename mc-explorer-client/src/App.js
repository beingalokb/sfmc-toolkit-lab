import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import LoginPage from './LoginPage';
import AuthCallback from './AuthCallback';

// 🔐 Check auth flag only once
const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
console.log('🔐 Local auth status:', isAuthenticated);

function App() {
  return (
    <Router>
      <Routes>
        {/* Always start here */}
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Show login page */}
        <Route path="/login" element={<LoginPage />} />

        {/* Handle redirect from MC OAuth */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Main app after auth */}
        <Route path="/explorer/*" element={isAuthenticated ? <MainApp /> : <Navigate to="/login" />} />

        {/* SetupForm is optional — remove if unused */}
        <Route path="/setup" element={isAuthenticated ? <SetupForm /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
