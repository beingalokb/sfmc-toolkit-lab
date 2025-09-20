import React from 'react';

const AppNavigation = ({ activeTab, setActiveTab, onLogout }) => {
  const navItems = [
    { id: 'search', label: 'Search Assets', icon: '🔍' },
    { id: 'distributedMarketing', label: 'Distributed Marketing', icon: '📧' },
    { id: 'emailArchivingSetup', label: 'Email Archiving', icon: '🗃️' },
    { id: 'settings', label: 'Settings', icon: '🔧' },
  ];

  return (
    <nav className="app-nav">
      <div className="nav-links">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="mr-2">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="action-buttons">
        <button onClick={onLogout} className="btn-danger">
          Logout
        </button>
      </div>
    </nav>
  );
};

export default AppNavigation;
