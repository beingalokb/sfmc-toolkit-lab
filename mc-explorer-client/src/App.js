import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';
import LoginPage from './LoginPage';

function App() {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  console.log('🔐 Local auth status:', isAuthenticated);


  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={isAuthenticated ? <SetupForm /> : <Navigate to="/login" />} />
        <Route path="/explorer/*" element={isAuthenticated ? <MainApp /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
