import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import SetupForm from './SetupForm';
import MainApp from './MainApp';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SetupForm />} />
        <Route path="/explorer" element={<MainApp />} />
      </Routes>
    </Router>
  );
}

export default App;
