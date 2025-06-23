import React, { useState, useEffect } from 'react';
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

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    window.location.href = '/';
  };

 useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('auth') === '1') {
    localStorage.setItem('isAuthenticated', 'true');
    urlParams.delete('auth');
    if (urlParams.get('reload') === '1') {
      urlParams.delete('reload');
      const cleanUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.location.replace(cleanUrl); // force a reload
    } else {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
  const authStatus = localStorage.getItem('isAuthenticated') === 'true';
  setIsAuthenticated(authStatus);
  setLoading(false);
}, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    fetch(`${baseURL}/business-units`, { credentials: 'include' })
  .then(res => {
    console.log("🔁 Session check /business-units response:", res.status);
    if (res.status === 401) {
      console.warn('⚠️ Session expired or unauthorized. Redirecting to login...');
      localStorage.removeItem('isAuthenticated');
      window.location.href = '/login';
    }
      })
      .catch(err => {
        console.error('🚨 Error while checking session:', err);
        localStorage.removeItem('isAuthenticated');
        window.location.href = '/login';
      });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const accessToken = localStorage.getItem('accessToken');
    const subdomain = localStorage.getItem('subdomain');
    if (!accessToken || !subdomain) {
      console.warn('⚠️ No access token or subdomain found. Redirecting to login...');
      localStorage.removeItem('isAuthenticated');
      window.location.href = '/login';
      return;
    }

    const fetchWithLogging = async (path, setter, label) => {
      try {
        const res = await fetch(`${baseURL}${path}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-mc-subdomain': subdomain
          }
        });
        if (res.status === 401) {
          console.warn(`🚫 ${label} fetch unauthorized`);
          return setter([]);
        }
        const json = await res.json();
        console.log(`✅ ${label} fetched`, json);
        setter(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error(`❌ Failed to fetch ${label}`, e);
        setter([]);
      }
    };

    fetchWithLogging('/search/de', setDataExtensions, 'Data Extensions');
    fetchWithLogging('/search/automation', setAutomations, 'Automations');
    fetchWithLogging('/search/datafilters', setDataFilters, 'Data Filters');
    fetchWithLogging('/search/journeys', setJourneys, 'Journeys');
    fetchWithLogging('/folders', folders => {
      const map = {};
      (folders || []).forEach(f => map[f.ID] = f);
      setFolderMap(map);
    }, 'Folders');
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
      let aVal, bVal;
      if (sortConfig.key === 'path') {
        aVal = (a.path || '').toString().toLowerCase();
        bVal = (b.path || '').toString().toLowerCase();
      } else {
        aVal = a[sortConfig.key]?.toString().toLowerCase() || '';
        bVal = b[sortConfig.key]?.toString().toLowerCase() || '';
      }
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
      Object.values(item || {}).some(val =>
        (val || '').toString().toLowerCase().includes(term)
      );

    let filtered = [];
    if (activeTab === 'de') filtered = (dataExtensions || []).filter(matches);
    else if (activeTab === 'automation') filtered = (automations || []).filter(matches);
    else if (activeTab === 'datafilter') filtered = (dataFilters || []).filter(matches);
    else if (activeTab === 'journey') filtered = (journeys || []).filter(matches);

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
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="p-8 bg-white rounded-lg shadow-lg text-center max-w-md">
          <h1 className="text-2xl font-bold text-indigo-700 mb-4">Welcome to MC Explorer</h1>
          <p className="mb-4 text-gray-700">
            Click below to login with your Marketing Cloud user
          </p>
          <a
            href={`${baseURL}/auth/login`}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Login with Marketing Cloud
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gradient-to-br from-slate-50 to-slate-200 min-h-screen font-sans">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-indigo-700">MC Explorer</h1>
        <button onClick={handleLogout} className="text-sm bg-red-500 px-3 py-1 rounded text-white">
          Logout
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        {['de', 'automation', 'datafilter', 'journey'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded text-sm ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border'}`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search..."
          className="ml-auto border px-3 py-1 rounded"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto bg-white shadow rounded">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2 cursor-pointer" onClick={() => requestSort('name')}>Name</th>
              <th className="text-left p-2 cursor-pointer" onClick={() => requestSort('createdDate')}>Created</th>
              <th className="text-left p-2 cursor-pointer" onClick={() => requestSort('path')}>Path</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData().map((item, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-2 font-medium">{item.name}</td>
                <td className="p-2">{item.createdDate || 'N/A'}</td>
                <td className="p-2">{item.path || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 text-sm">
        <div>
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex gap-2">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-2 py-1 border rounded">Prev</button>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-2 py-1 border rounded">Next</button>
        </div>
      </div>
    </div>
  );
}

export default MainApp;
