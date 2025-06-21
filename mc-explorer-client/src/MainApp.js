import React, { useState, useEffect } from 'react';
import { CSVLink } from 'react-csv';
import logo from './assets/mc-explorer-logo.jpg';
import './App.css';

const baseURL = process.env.REACT_APP_BASE_URL;

function MainApp() {
  const [activeTab, setActiveTab] = useState('de');
  const [dataExtensions, setDataExtensions] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [dataFilters, setDataFilters] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [folderMap, setFolderMap] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';

  // 🚪 Logout
  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    window.location.href = '/';
  };

  // 🔐 Auth check
  useEffect(() => {
    if (!isAuthenticated) return;

    fetch(`${baseURL}/business-units`, { credentials: 'include' })
      .then(res => {
        if (res.status === 401) window.location.href = '/auth/login';
      })
      .catch(() => window.location.href = '/auth/login');
  }, [isAuthenticated]);

  // ✅ Set auth from URL param
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === '1') {
      localStorage.setItem('isAuthenticated', 'true');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // 📦 Fetch everything
  useEffect(() => {
    if (!isAuthenticated) return;

    fetch(`${baseURL}/search/de`).then(res => res.json()).then(setDataExtensions);
    fetch(`${baseURL}/search/automation`).then(res => res.json()).then(setAutomations);
    fetch(`${baseURL}/search/datafilters`).then(res => res.json()).then(setDataFilters);
    fetch(`${baseURL}/search/journeys`).then(res => res.json()).then(setJourneys);

    fetch(`${baseURL}/folders`)
      .then(res => res.json())
      .then(folders => {
        const map = {};
        (folders || []).forEach(f => map[f.ID] = f);
        setFolderMap(map);
      });
  }, [isAuthenticated]);

  const buildFolderPath = (id) => {
    if (!id || !folderMap[id]) return 'N/A';
    const path = [];
    let current = folderMap[id];
    while (current) {
      path.unshift(current.Name);
      current = folderMap[current.ParentFolder?.ID];
    }
    return '/' + path.join(' / ');
  };

  const sortData = (data) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key]?.toString().toLowerCase() || '';
      const bVal = b[sortConfig.key]?.toString().toLowerCase() || '';
      return sortConfig.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  };

  const requestSort = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const getFilteredData = () => {
    const term = searchTerm.toLowerCase();
    const matches = (item) => Object.values(item).some(val =>
      (val || '').toString().toLowerCase().includes(term)
    );

    let filtered = [];
    if (activeTab === 'de') filtered = dataExtensions.filter(matches);
    else if (activeTab === 'automation') filtered = automations.filter(matches);
    else if (activeTab === 'datafilter') filtered = dataFilters.filter(matches);
    else if (activeTab === 'journey') filtered = journeys.filter(matches);

    return sortData(filtered);
  };

  const renderSortArrow = (key) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : null;

  const paginatedData = () => {
    const filtered = getFilteredData();
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(getFilteredData().length / itemsPerPage);

  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center text-red-600">
        Unauthorized. Please <a className="text-blue-600 underline" href="/">login</a>.
      </div>
    );
  }

  // ✅ Everything else (UI, table, export...) remains the same
  // Paste your full `return (...)` JSX block starting from `<div className="p-6 max-w-7xl ...">` below here.

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gradient-to-br from-slate-50 to-slate-200 min-h-screen font-sans">
      {/* Keep your existing JSX UI block here unchanged */}
      {/* (To reduce clutter, I’ve truncated it here) */}
    </div>
  );
}

export default MainApp;
