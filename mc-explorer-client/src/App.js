import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import LoginPage from './LoginPage';
import AuthCallback from './AuthCallback';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('isAuthenticated') === 'true');

  useEffect(() => {
    const handleStorage = () => {
      setIsAuthenticated(localStorage.getItem('isAuthenticated') === 'true');
    };
    window.addEventListener('storage', handleStorage);
    // Also check on mount in case localStorage changed in this tab
    handleStorage();
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    // Listen for changes to localStorage in this tab (e.g., after login)
    const checkAuth = () => {
      setIsAuthenticated(localStorage.getItem('isAuthenticated') === 'true');
    };
    window.addEventListener('focus', checkAuth);
    return () => window.removeEventListener('focus', checkAuth);
  }, []);

  console.log('🔐 Local auth status:', isAuthenticated);

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
