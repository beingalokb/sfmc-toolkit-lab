import React, { useState, useEffect } from 'react';
import { CSVLink } from 'react-csv';
import logo from './assets/mc-explorer-logo.jpg';
import './App.css';

const baseURL = process.env.REACT_APP_BASE_URL;

function MainApp() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  // Logout function
  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    window.location.href = '/';
  };

  // URL auth param handler + localStorage setup
  useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('auth') === '1') {
    console.log('✅ Auth param found, setting local storage...');
    localStorage.setItem('isAuthenticated', 'true');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const authStatus = localStorage.getItem('isAuthenticated') === 'true';
  console.log('🔐 LocalStorage auth status:', authStatus);
  setIsAuthenticated(authStatus);
  setLoading(false);
}, []);

useEffect(() => {
  if (!isAuthenticated) return;

  console.log('🔍 Checking session with backend...');
  fetch(`${baseURL}/business-units`, { credentials: 'include' })
    .then(res => {
      if (res.status === 401) {
        console.warn('🚫 Unauthorized session. Redirecting...');
        window.location.href = '/auth/login';
      } else {
        console.log('✅ Backend session is valid');
      }
    })
    .catch(err => {
      console.error('⚠️ Error while checking backend session:', err);
      window.location.href = '/auth/login';
    });
}, [isAuthenticated]);

useEffect(() => {
  if (!isAuthenticated) return;

  console.log('📦 Fetching data from all endpoints...');
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


  // Folder path resolver
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
    const matches = (item) =>
      Object.values(item).some(val =>
        (val || '').toString().toLowerCase().includes(term)
      );

    let filtered = [];
    if (activeTab === 'de') filtered = dataExtensions.filter(matches);
    else if (activeTab === 'automation') filtered = automations.filter(matches);
    else if (activeTab === 'datafilter') filtered = dataFilters.filter(matches);
    else if (activeTab === 'journey') filtered = journeys.filter(matches);

    return sortData(filtered);
  };

  const paginatedData = () => {
    const filtered = getFilteredData();
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(getFilteredData().length / itemsPerPage);

  if (loading) return null;

  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center text-red-600">
        Unauthorized. Please <a className="text-blue-600 underline" href="/">login</a>.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gradient-to-br from-slate-50 to-slate-200 min-h-screen font-sans">
      {/* Place your full table + UI JSX here */}
      <h1 className="text-3xl font-bold text-indigo-700 mb-6">MC Explorer</h1>
      <button onClick={handleLogout} className="text-sm bg-red-500 px-3 py-1 rounded text-white">
        Logout
      </button>
    </div>
  );
}

export default MainApp;
