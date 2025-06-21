import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import LoginPage from './LoginPage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = loading

  useEffect(() => {
    fetch('/auth', { credentials: 'include' })
      .then(res => setIsAuthenticated(res.ok))
      .catch(() => setIsAuthenticated(false));
  }, []);

  if (isAuthenticated === null) return <p>Checking login...</p>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<SetupForm />} />
        <Route
          path="/explorer"
          element={
            isAuthenticated ? <MainApp /> : <Navigate to="/login" replace />
          }
        />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </Router>
  );
}

export default App;
