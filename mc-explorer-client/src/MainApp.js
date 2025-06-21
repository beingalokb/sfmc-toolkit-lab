import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CSVLink } from 'react-csv';
import logo from './assets/mc-explorer-logo.jpg';
import './App.css';


function MainApp() {

  const baseURL = process.env.REACT_APP_BASE_URL;
const handleLogout = () => {
  localStorage.removeItem('isAuthenticated');
  window.location.href = '/';
};
  const [results, setResults] = useState([]);
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
  const fetchData = () => {
  fetch(`${baseURL}/search/de`)
    .then(res => res.json())
    .then(data => setDataExtensions(Array.isArray(data) ? data : []));

  useEffect(() => {
  if (!isAuthenticated) return;
  fetchData();
}, [isAuthenticated]);

  useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('auth') === '1') {
    localStorage.setItem('isAuthenticated', 'true');
    window.history.replaceState({}, document.title, window.location.pathname); // Clean URL
  }
}, []);

  
  // 🔐 Auth check
  useEffect(() => {
    fetch('`${baseURL}/business-units', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) {
          window.location.href = '/auth/login';
        }
      })
      .catch(() => {
        window.location.href = '/auth/login';
      });
  }, []);

  // 📦 Fetch data
  useEffect(() => {
  fetch(`${baseURL}/search/de`)
    .then(res => res.json())
    .then(data => setDataExtensions(Array.isArray(data) ? data : []));

  fetch(`${baseURL}/search/automation`)
    .then(res => res.json())
    .then(data => setAutomations(Array.isArray(data) ? data : []));

  fetch(`${baseURL}/search/datafilters`)
    .then(res => res.json())
    .then(data => setDataFilters(Array.isArray(data) ? data : []));

  fetch(`${baseURL}/search/journeys`)
    .then(res => res.json())
    .then(data => setJourneys(Array.isArray(data) ? data : []));

  fetch(`${baseURL}/folders`)
    .then(res => res.json())
    .then(folders => {
      if (!Array.isArray(folders)) folders = [];
      const map = {};
      folders.forEach(f => map[f.ID] = f);
      setFolderMap(map);
    });
}, []);


  const buildFolderPath = (id) => {
    if (!id || !folderMap[id]) return 'N/A';
    let path = [];
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
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getFilteredData = () => {
    const term = searchTerm.toLowerCase();
    const matches = (item) => Object.values(item).some(val => (val || '').toString().toLowerCase().includes(term));

    let filtered = [];
    if (activeTab === 'de') filtered = dataExtensions.filter(matches);
    else if (activeTab === 'automation') filtered = automations.filter(matches);
    else if (activeTab === 'datafilter') filtered = dataFilters.filter(matches);
    else if (activeTab === 'journey') filtered = journeys.filter(matches);

    return sortData(filtered);
  };

  const renderSortArrow = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const paginatedData = () => {
    const filtered = getFilteredData();
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(getFilteredData().length / itemsPerPage);

  return (

    !localStorage.getItem('isAuthenticated') ? (
    <div className="p-6 text-center text-red-600">
      Unauthorized. Please <a className="text-blue-600 underline" href="/">login</a>.
    </div>
  ) : (

    <div className="p-6 max-w-7xl mx-auto bg-gradient-to-br from-slate-50 to-slate-200 min-h-screen font-sans">
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-6">
        <img src={logo} alt="App Logo" className="h-24 w-24 object-contain rounded-full border-4 border-indigo-500 shadow" />
        <h1 className="text-5xl font-extrabold text-indigo-700 tracking-tight drop-shadow-sm text-center sm:text-left">
          MC Explorer
        </h1>
    <button
  onClick={handleLogout}
  className="ml-auto px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded"
>
  Logout
</button>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {['de', 'automation', 'datafilter', 'journey'].map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
            disabled={activeTab === tab}
            className={`px-4 py-2 rounded-lg font-semibold shadow transition ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-500 text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            {tab === 'de' ? 'Data Extensions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
          <CSVLink
  data={getFilteredData().map(row => ({
    ...row,
    folderPath:
      activeTab === 'datafilter'
        ? buildFolderPath(row.folderId)
        : buildFolderPath(row.categoryId),
  }))}
  filename={`${activeTab}-results.csv`}
  className="text-blue-700 underline"
>
  Export to CSV
</CSVLink>


          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Results per page:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {[10, 25, 50, 100].map(num => (
                <option key={num} value={num}>{num}</option>
              ))}
            </select>
          </div>

          <p className="text-sm text-gray-600">
            Showing {getFilteredData().length} result{getFilteredData().length !== 1 ? 's' : ''}
          </p>
        </div>

        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          className="p-2 border border-gray-300 rounded w-full max-w-xl mb-4"
        />

        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-collapse border border-gray-200 rounded overflow-hidden">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                {['name', 'key'].map(col => (
                  <th key={col} onClick={() => requestSort(col)} className="cursor-pointer border px-4 py-2 text-left text-sm font-medium text-gray-700">
                    {col.charAt(0).toUpperCase() + col.slice(1)}{renderSortArrow(col)}
                  </th>
                ))}

                {activeTab === 'de' && (
                  <>
                    <th onClick={() => requestSort('createdDate')} className="cursor-pointer border px-4 py-2 text-sm">Created Date{renderSortArrow('createdDate')}</th>
                    <th className="border px-4 py-2 text-sm">Folder Path</th>
                  </>
                )}

                {activeTab === 'automation' && (
                  <>
                    <th onClick={() => requestSort('status')} className="cursor-pointer border px-4 py-2 text-sm">Status{renderSortArrow('status')}</th>
                    <th onClick={() => requestSort('createdDate')} className="cursor-pointer border px-4 py-2 text-sm">Created Date{renderSortArrow('createdDate')}</th>
                    <th onClick={() => requestSort('lastRunTime')} className="cursor-pointer border px-4 py-2 text-sm">Last Run{renderSortArrow('lastRunTime')}</th>
                    <th className="border px-4 py-2 text-sm">Folder Path</th>
                  </>
                )}

                {activeTab === 'datafilter' && (
                  <>
                    <th onClick={() => requestSort('description')} className="cursor-pointer border px-4 py-2 text-sm">Description{renderSortArrow('description')}</th>
                    <th onClick={() => requestSort('createdDate')} className="cursor-pointer border px-4 py-2 text-sm">Created Date{renderSortArrow('createdDate')}</th>
                    <th className="border px-4 py-2 text-sm">Folder Path</th>
                  </>
                )}

                {activeTab === 'journey' && (
                  <>
                    <th onClick={() => requestSort('status')} className="cursor-pointer border px-4 py-2 text-sm">Status{renderSortArrow('status')}</th>
                    <th onClick={() => requestSort('createdDate')} className="cursor-pointer border px-4 py-2 text-sm">Created Date{renderSortArrow('createdDate')}</th>
                    <th className="border px-4 py-2 text-sm">Folder Path</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedData().map((item, index) => (
                <tr key={index} className="hover:bg-blue-50 text-sm">
                  <td className="border px-4 py-2">{item.name}</td>
                  <td className="border px-4 py-2">{item.key}</td>

                  {activeTab === 'de' && (
                    <>
                      <td className="border px-4 py-2">{item.createdDate}</td>
                      <td className="border px-4 py-2">{buildFolderPath(item.categoryId)}</td>
                    </>
                  )}
                  {activeTab === 'automation' && (
                    <>
                      <td className="border px-4 py-2">{item.status}</td>
                      <td className="border px-4 py-2">{item.createdDate}</td>
                      <td className="border px-4 py-2">{item.lastRunTime}</td>
                      <td className="border px-4 py-2">{buildFolderPath(item.categoryId)}</td>
                    </>
                  )}
                  {activeTab === 'datafilter' && (
                    <>
                      <td className="border px-4 py-2">{item.description}</td>
                      <td className="border px-4 py-2">{item.createdDate}</td>
                      <td className="border px-4 py-2">{buildFolderPath(item.folderId)}</td>
                    </>
                  )}
                  {activeTab === 'journey' && (
                    <>
                      <td className="border px-4 py-2">{item.status}</td>
                      <td className="border px-4 py-2">{item.createdDate}</td>
                      <td className="border px-4 py-2">{buildFolderPath(item.categoryId)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center items-center space-x-3">
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-gray-700 text-sm">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
    )
  );
}
}
export default MainApp;
