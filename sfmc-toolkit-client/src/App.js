import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import AuthCallback from './AuthCallback';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Check authentication status on mount and when storage changes
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status', {
          credentials: 'include' // Include session cookies
        });
        
        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(data.authenticated);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth status check failed:', error);
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuthStatus();

    // Listen for storage changes (login/logout in other tabs)
    const handleStorage = () => {
      checkAuthStatus();
    };
    window.addEventListener('storage', handleStorage);
    
    // Check auth when window gains focus
    window.addEventListener('focus', checkAuthStatus);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', checkAuthStatus);
    };
  }, []);

  // Global auth state updater for components
  window.updateAuthStatus = (authenticated) => {
    setIsAuthenticated(authenticated);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  console.log('🔐 Auth status:', isAuthenticated);

  return (
    <Router>
      <Routes>
        {/* Default route */}
        <Route path="/" element={
          isAuthenticated ? <Navigate to="/explorer" /> : <Navigate to="/setup" />
        } />

        {/* OAuth setup/login page */}
        <Route path="/setup" element={
          isAuthenticated ? <Navigate to="/explorer" /> : <SetupForm />
        } />

        {/* Handle OAuth callback */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Main app after authentication */}
        <Route path="/explorer/*" element={
          isAuthenticated ? <MainApp /> : <Navigate to="/setup" />
        } />

        {/* Catch all other routes */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
