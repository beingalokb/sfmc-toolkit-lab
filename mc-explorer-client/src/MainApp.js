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
  const [pendingFetches, setPendingFetches] = useState(0);
  const [deDetailModal, setDeDetailModal] = useState({ open: false, loading: false, error: null, details: null, name: null });
  const [automationDetailModal, setAutomationDetailModal] = useState({ open: false, loading: false, error: null, details: null, name: null });

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
  // Don't setLoading(false) here!
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

    setLoading(true);
    setPendingFetches(5); // 5 fetches: DE, Automation, DataFilter, Journey, Folders

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
          setter([]);
        } else {
          const json = await res.json();
          console.log(`✅ ${label} fetched`, json);
          setter(Array.isArray(json) ? json : []);
        }
      } catch (e) {
        console.error(`❌ Failed to fetch ${label}`, e);
        setter([]);
      } finally {
        setPendingFetches(prev => prev - 1);
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

  // Fetch data for the selected tab when activeTab changes
  useEffect(() => {
    if (!isAuthenticated) return;
    const accessToken = localStorage.getItem('accessToken');
    const subdomain = localStorage.getItem('subdomain');
    if (!accessToken || !subdomain) return;
    setLoading(true);
    setPendingFetches(1);
    const fetchWithLogging = async (path, setter, label) => {
      try {
        const res = await fetch(`${baseURL}${path}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-mc-subdomain': subdomain
          }
        });
        if (res.status === 401) {
          setter([]);
        } else {
          const json = await res.json();
          setter(Array.isArray(json) ? json : []);
        }
      } catch (e) {
        setter([]);
      } finally {
        setPendingFetches(prev => prev - 1);
      }
    };
    if (activeTab === 'de') fetchWithLogging('/search/de', setDataExtensions, 'Data Extensions');
    if (activeTab === 'automation') fetchWithLogging('/search/automation', setAutomations, 'Automations');
    if (activeTab === 'datafilter') fetchWithLogging('/search/datafilters', setDataFilters, 'Data Filters');
    if (activeTab === 'journey') fetchWithLogging('/search/journeys', setJourneys, 'Journeys');
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    if (pendingFetches === 0 && isAuthenticated) setLoading(false);
  }, [pendingFetches, isAuthenticated]);

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

  // Returns filtered and sorted data across all tabs if searchTerm is not empty, otherwise just the active tab
  const getFilteredData = () => {
    const term = searchTerm.toLowerCase();
    const matches = (item) =>
      Object.values(item || {}).some(val =>
        (val || '').toString().toLowerCase().includes(term)
      );

    let filtered = [];
    if (term) {
      // Search across all modules
      filtered = [
        ...(dataExtensions || []).map(item => ({ ...item, _type: 'Data Extension' })),
        ...(automations || []).map(item => ({ ...item, _type: 'Automation' })),
        ...(dataFilters || []).map(item => ({ ...item, _type: 'Data Filter' })),
        ...(journeys || []).map(item => ({ ...item, _type: 'Journey' }))
      ].filter(matches);
    } else {
      // Only show active tab
      if (activeTab === 'de') filtered = (dataExtensions || []).map(item => ({ ...item, _type: 'Data Extension' }));
      else if (activeTab === 'automation') filtered = (automations || []).map(item => ({ ...item, _type: 'Automation' }));
      else if (activeTab === 'datafilter') filtered = (dataFilters || []).map(item => ({ ...item, _type: 'Data Filter' }));
      else if (activeTab === 'journey') filtered = (journeys || []).map(item => ({ ...item, _type: 'Journey' }));
    }
    return sortData(filtered);
  };

  const paginatedData = () => {
    const filtered = getFilteredData();
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(getFilteredData().length / itemsPerPage);

  // CSV download functionality
  const downloadCSV = () => {
    const filtered = getFilteredData();
    const headers = ['Name', 'Created', 'Path'];
    const rows = filtered.map(item => [
      '"' + (item.name || '').replace(/"/g, '""') + '"',
      '"' + (item.createdDate || 'N/A').replace(/"/g, '""') + '"',
      '"' + (item.path || 'N/A').replace(/"/g, '""') + '"'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to group by created date
  const getDateGroups = (items) => {
    const now = new Date();
    const daysAgo = (d) => {
      if (!d) return Infinity;
      const dt = new Date(d);
      return (now - dt) / (1000 * 60 * 60 * 24);
    };
    let last7 = 0, last30 = 0, last180 = 0, last365 = 0;
    items.forEach(item => {
      const days = daysAgo(item.createdDate);
      if (days <= 7) last7++;
      if (days <= 30) last30++;
      if (days <= 180) last180++;
      if (days <= 365) last365++;
    });
    return { last7, last30, last180, last365 };
  };

  const deGroups = getDateGroups(dataExtensions);
  const autoGroups = getDateGroups(automations);
  const dfGroups = getDateGroups(dataFilters);
  const journeyGroups = getDateGroups(journeys);

  // Fetch DE details on demand
  const fetchDeDetails = async (name) => {
    setDeDetailModal({ open: true, loading: true, error: null, details: null, name });
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch(`${baseURL}/de/details?name=${encodeURIComponent(name)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        }
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const details = await res.json();
      setDeDetailModal({ open: true, loading: false, error: null, details, name });
    } catch (e) {
      setDeDetailModal({ open: true, loading: false, error: e.message, details: null, name });
    }
  };

  // Fetch Automation details on demand
  const fetchAutomationDetails = async (name, id) => {
    setAutomationDetailModal({ open: true, loading: true, error: null, details: null, name });
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch(`${baseURL}/automation/details?programId=${encodeURIComponent(id)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        }
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const details = await res.json();
      setAutomationDetailModal({ open: true, loading: false, error: null, details, name });
    } catch (e) {
      setAutomationDetailModal({ open: true, loading: false, error: e.message, details: null, name });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="p-8 bg-white rounded-lg shadow-lg text-center max-w-md">
          <div className="mb-4 animate-spin inline-block">
            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-indigo-700">Loading data, please wait...</h2>
        </div>
      </div>
    );
  }

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded shadow p-4">
          <div className="text-lg font-bold text-indigo-700">Data Extensions</div>
          <div className="text-2xl font-bold">{dataExtensions.length}</div>
          <div className="text-xs text-gray-500 mt-2">Last 7d: {deGroups.last7} | 30d: {deGroups.last30} | 6mo: {deGroups.last180} | 1yr: {deGroups.last365}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-lg font-bold text-indigo-700">Automations</div>
          <div className="text-2xl font-bold">{automations.length}</div>
          <div className="text-xs text-gray-500 mt-2">Last 7d: {autoGroups.last7} | 30d: {autoGroups.last30} | 6mo: {autoGroups.last180} | 1yr: {autoGroups.last365}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-lg font-bold text-indigo-700">Data Filters</div>
          <div className="text-2xl font-bold">{dataFilters.length}</div>
          <div className="text-xs text-gray-500 mt-2">Last 7d: {dfGroups.last7} | 30d: {dfGroups.last30} | 6mo: {dfGroups.last180} | 1yr: {dfGroups.last365}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-lg font-bold text-indigo-700">Journeys</div>
          <div className="text-2xl font-bold">{journeys.length}</div>
          <div className="text-xs text-gray-500 mt-2">Last 7d: {journeyGroups.last7} | 30d: {journeyGroups.last30} | 6mo: {journeyGroups.last180} | 1yr: {journeyGroups.last365}</div>
        </div>
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
        <button
          onClick={downloadCSV}
          className="bg-green-600 text-white px-3 py-1 rounded text-sm ml-2"
        >
          Download CSV
        </button>
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
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2 cursor-pointer" onClick={() => requestSort('name')}>Name</th>
              {/* Remove Created column for Automations */}
              <th className="text-left p-2 cursor-pointer" onClick={() => requestSort('path')}>Path</th>
              <th className="text-left p-2">View in folder</th>
              {(!searchTerm && (activeTab === 'automation' || activeTab === 'journey')) || (searchTerm && getFilteredData().some(item => item._type === 'Automation' || item._type === 'Journey')) ? (
                <th className="text-left p-2 cursor-pointer" onClick={() => requestSort('status')}>Status</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {paginatedData().map((item, idx) => (
              <tr key={idx} className={`border-t ${item._type === 'Data Extension' ? 'cursor-pointer hover:bg-indigo-50' : item._type === 'Automation' ? 'cursor-pointer hover:bg-green-50' : ''}`}
                onClick={() => {
                  if (item._type === 'Data Extension') fetchDeDetails(item.name);
                  if (item._type === 'Automation') fetchAutomationDetails(item.name, item.id);
                }}
              >
                <td className="p-2">{item._type}</td>
                <td className="p-2 font-medium">{item.name}</td>
                {/* Remove Created column for Automations */}
                <td className="p-2">{item.path || 'N/A'}</td>
                <td className="p-2">
                  {item._type === 'Data Extension' && item.categoryId && item.id && (
                    <a
                      href={`https://mc.s4.exacttarget.com/cloud/#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers/CustomObjects/${item.categoryId}/?ts=${item.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800"
                      onClick={e => e.stopPropagation()}
                    >
                      View
                    </a>
                  )}
                  {item._type === 'Data Filter' && item.customerKey && (
                    <a
                      href={`https://mc.s4.exacttarget.com/cloud/#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers/DataFilters/${item.customerKey}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800 ml-2"
                      onClick={e => e.stopPropagation()}
                    >
                      View
                    </a>
                  )}
                </td>
                {((!searchTerm && (activeTab === 'automation' || activeTab === 'journey')) || (searchTerm && (item._type === 'Automation' || item._type === 'Journey'))) && (
                  <td className="p-2">{item.status || 'N/A'}</td>
                )}
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

      {/* Modal for DE details */}
      {deDetailModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw] relative">
            <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600" onClick={() => setDeDetailModal({ open: false, loading: false, error: null, details: null, name: null })}>&#10005;</button>
            <h2 className="text-lg font-bold mb-4 text-indigo-700">Data Extension Details: {deDetailModal.name}</h2>
            {deDetailModal.loading && <div className="text-center py-4">Loading details...</div>}
            {deDetailModal.error && <div className="text-red-600">{deDetailModal.error}</div>}
            {deDetailModal.details && (
              <div className="space-y-2">
                <div><span className="font-semibold">Created By:</span> {deDetailModal.details.createdByName}</div>
                <div><span className="font-semibold">Modified By:</span> {deDetailModal.details.modifiedByName}</div>
                <div><span className="font-semibold">Row Count:</span> {deDetailModal.details.rowCount}</div>
                <div><span className="font-semibold">Is Sendable:</span> {deDetailModal.details.isSendable.toString()}</div>
                <div><span className="font-semibold">Is Testable:</span> {deDetailModal.details.isTestable.toString()}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal for Automation details */}
      {automationDetailModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw] relative">
            <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600" onClick={() => setAutomationDetailModal({ open: false, loading: false, error: null, details: null, name: null })}>&#10005;</button>
            <h2 className="text-lg font-bold mb-4 text-green-700">Automation Details: {automationDetailModal.name}</h2>
            {automationDetailModal.loading && <div className="text-center py-4">Loading details...</div>}
            {automationDetailModal.error && <div className="text-red-600">{automationDetailModal.error}</div>}
            {automationDetailModal.details && (
              <div className="space-y-2">
                <div><span className="font-semibold">Start Date:</span> {automationDetailModal.details.startDate}</div>
                <div><span className="font-semibold">End Date:</span> {automationDetailModal.details.endDate}</div>
                <div><span className="font-semibold">Last Run Time:</span> {automationDetailModal.details.lastRunTime}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Add date formatting helper at the top of the file
function formatDate(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'Not Available') return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

export default MainApp;
