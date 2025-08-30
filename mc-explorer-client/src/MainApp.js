import React, { useState, useEffect } from 'react';
import './App.css';
import PreferenceCenterProjectForm from './PreferenceCenterProjectForm';
import PreferenceCenterNoCoreForm from './PreferenceCenterNoCoreForm';
import PreferenceCenterConfigForm from './PreferenceCenterConfigForm';
import EmailArchiving from './EmailArchiving';
import Settings from './Settings';
import ExportMenu from './components/ExportMenu';
import SchemaBuilder from './SchemaBuilder';

const baseURL = process.env.REACT_APP_BASE_URL;

// Enhanced Design System Components
const Btn = ({children, variant = 'ghost', size = 'default', ...props}) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-brand text-white border-brand hover:bg-brand-600 shadow-sm",
    secondary: "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 shadow-sm",
    ghost: "bg-transparent text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900",
    danger: "bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-sm"
  };
  const sizes = {
    sm: "px-3 py-1.5 text-sm h-8",
    default: "px-4 py-2 text-sm h-9",
    lg: "px-6 py-2.5 text-base h-10"
  };
  return <button type="button" className={`${base} ${variants[variant]} ${sizes[size]}`} {...props}>{children}</button>;
};

const Tab = ({label, active, onClick, ...props}) => {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-8 px-3 rounded-md border transition-all duration-200 text-sm font-medium ${
        active
          ? 'bg-brand text-white border-brand shadow-[0_0_0_2px_rgba(59,130,246,.25)]'
          : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300'
      }`}
      {...props}
    >
      {label}
    </button>
  );
};

const Tag = ({children, variant = 'default'}) => {
  const variants = {
    default: "bg-gray-100 text-gray-700 border-gray-200",
    success: "bg-green-100 text-green-700 border-green-200",
    warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
    error: "bg-red-100 text-red-700 border-red-200"
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>
      {children}
    </span>
  );
};

function KpiCard({title, value, subtitle, trend, icon}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">{title}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
          {trend && (
            <div className={`mt-1 text-sm ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.positive ? '↗' : '↘'} {trend.value}
            </div>
          )}
          {subtitle && <div className="mt-2 text-xs text-gray-500 line-clamp-2">{subtitle}</div>}
        </div>
        {icon && <div className="ml-4 p-3 bg-brand/10 rounded-lg text-slate-400">{icon}</div>}
      </div>
    </div>
  );
}

export default function MainApp() {
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
  const [emailSendDefinitions, setEmailSendDefinitions] = useState([]);

  const [senderProfiles, setSenderProfiles] = useState([]);
  const [sendClassifications, setSendClassifications] = useState([]);
  const [deliveryProfiles, setDeliveryProfiles] = useState([]);
  const [sendClassModal, setSendClassModal] = useState({ open: false, loading: false, error: null, details: null, name: null });
  const [senderProfileModal, setSenderProfileModal] = useState({ open: false, loading: false, error: null, details: null, name: null });
  const [updateSenderProfileModal, setUpdateSenderProfileModal] = useState({ open: false, loading: false, error: null, customerKey: null, selectedKey: '', success: false });
  const [configJson, setConfigJson] = useState('');
  const [parsedRelationships, setParsedRelationships] = useState([]);
  const [configError, setConfigError] = useState('');
  const [resolvedEmailSendDefs, setResolvedEmailSendDefs] = useState([]);
  const [resolvedError, setResolvedError] = useState('');

  // Add new state for edit modal
  const [editESDModal, setEditESDModal] = useState({ open: false, loading: false, error: null, esd: null, sendClassification: '', senderProfile: '', deliveryProfile: '', bccEmail: '', ccEmail: '' });

  // State for mass selection
  const [selectedESDKeys, setSelectedESDKeys] = useState([]);
  const allSelected = resolvedEmailSendDefs.length > 0 && selectedESDKeys.length === resolvedEmailSendDefs.length;

  // State for mass edit modal
  const [massEditModal, setMassEditModal] = useState({ open: false, sendClassification: '', senderProfile: '', deliveryProfile: '', bccEmail: '', ccEmail: '', loading: false, error: null });

  // Publications state
  const [publications, setPublications] = useState([]);

  // Add new top-level tab for Distributed Marketing
  const [dmStep, setDMStep] = useState(1);
  const [dmDEPath, setDMDEPath] = useState('');
  const [dmJourneyPath, setDMJourneyPath] = useState('');
  const [dmStatus, setDMStatus] = useState('');

  // Add new state for DM Quick Send
  const [qsStatus, setQSStatus] = useState("");
  const [qsDetails, setQSDetails] = useState(null);
  const [qsLoading, setQSLoading] = useState(false);

  // Add separate state for Preference Center success
  const [preferenceCenterStatus, setPreferenceCenterStatus] = useState("");

  // Add projectName state
  const [projectName, setProjectName] = useState('');

  // --- Email Auditing State ---
  const [emailArchiveResults, setEmailArchiveResults] = useState([]);
  const [emailArchiveLoading, setEmailArchiveLoading] = useState(false);
  const [emailArchiveError, setEmailArchiveError] = useState('');
  const [archiveSearch, setArchiveSearch] = useState({ jobId: '', emailName: '', subject: '' });
  const [archivePage, setArchivePage] = useState(1);
  const [archiveRowsPerPage, setArchiveRowsPerPage] = useState(10); // Set pagination to 10 for Table 1
  const [selectedSendId, setSelectedSendId] = useState(null);
  const [sentEventResults, setSentEventResults] = useState([]);
  const [sentEventLoading, setSentEventLoading] = useState(false);
  const [sentEventError, setSentEventError] = useState('');
  const [sentEventPage, setSentEventPage] = useState(1);
  const [sentEventRowsPerPage, setSentEventRowsPerPage] = useState(10); // Set pagination to 10 for Table 2
  const [sentEventSubscriberKey, setSentEventSubscriberKey] = useState('');
  const [archiveSort, setArchiveSort] = useState({ key: null, direction: 'asc' });
  const [sentEventSort, setSentEventSort] = useState({ key: null, direction: 'asc' });

  // --- Email Archiving Setup State ---
  const [archivingStep, setArchivingStep] = useState(0);
  const [archivingStatus, setArchivingStatus] = useState("");
  const [archivingDEName, setArchivingDEName] = useState("");
  const [archivingBlockName, setArchivingBlockName] = useState("");
  const [archivingSelectedEmails, setArchivingSelectedEmails] = useState([]);
  const [archivingAllSelected, setArchivingAllSelected] = useState(false);

  // Helper to get human-readable name for related fields
  function getProfileName(profiles, key) {
    if (!key) return '';
    const found = profiles.find(p => p.CustomerKey === key);
    return found ? found.Name : key;
  }
  function getProfileDesc(profiles, key) {
    if (!key) return '';
    const found = profiles.find(p => p.CustomerKey === key);
    return found ? found.Description : '';
  }

  // Helper function to clean up email strings (remove duplicates and normalize)
  function cleanEmailString(emailStr) {
    if (!emailStr) return '';
    // Split by semicolon, trim whitespace, remove duplicates, filter empty strings
    const emails = emailStr.split(';')
      .map(email => email.trim())
      .filter(email => email.length > 0);
    const uniqueEmails = [...new Set(emails)];
    return uniqueEmails.join('; ');
  }

  // Parent navigation state
  const [parentNav, setParentNav] = useState('search'); // 'search' or 'preference'
  const [previewResult, setPreviewResult] = useState(null);
  const [guidedPrefOption, setGuidedPrefOption] = useState('');

  const handleLogout = async () => {
    // Clear local/session storage
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('mc_subdomain');
    localStorage.removeItem('mc_clientId');
    localStorage.removeItem('mc_clientSecret');
    localStorage.removeItem('mc_accountId');
    sessionStorage.clear();
    // Call backend to clear session
    try {
      await fetch('/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // Ignore errors
    }
    // Redirect to setup
    window.location.href = '/setup';
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
    setPendingFetches(6); // 6 fetches: DE, Automation, DataFilter, Journey, Folders, Publications

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
    fetchWithLogging('/search/publication', setPublications, 'Publications');
  }, [isAuthenticated]);

  // Fetch data for the selected tab when activeTab changes
  useEffect(() => {
    if (!isAuthenticated) return;
    console.log('Current activeTab:', activeTab); // DEBUG
    const accessToken = localStorage.getItem('accessToken');
    const subdomain = localStorage.getItem('subdomain');
    if (!accessToken || !subdomain) return;
    setLoading(true);
    setPendingFetches(1);
    const fetchWithLogging = async (path, setter, label) => {
      try {
        console.log('Fetching', label, 'from', path); // DEBUG
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
    if (activeTab === 'emailsenddefinition') {
      console.log('Fetching EmailSendDefinition'); // DEBUG
      fetchWithLogging('/search/emailsenddefinition', setEmailSendDefinitions, 'EmailSendDefinitions');
      // Fetch related profiles/classifications
      fetchWithLogging('/search/senderprofile', setSenderProfiles, 'SenderProfiles');
      fetchWithLogging('/search/sendclassification', setSendClassifications, 'SendClassifications');
      fetchWithLogging('/search/deliveryprofile', setDeliveryProfiles, 'DeliveryProfiles');
    }
    if (activeTab === 'publication') fetchWithLogging('/search/publication', setPublications, 'Publications');
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
      // Search across all modules, including EmailSendDefinition
      filtered = [
        ...(dataExtensions || []).map(item => ({ ...item, _type: 'Data Extension' })),
        ...(automations || []).map(item => ({ ...item, _type: 'Automation' })),
        ...(dataFilters || []).map(item => ({ ...item, _type: 'Data Filter' })),
        ...(journeys || []).map(item => ({ ...item, _type: 'Journey' })),
        ...(resolvedEmailSendDefs || []).map(item => ({ ...item, _type: 'EmailSendDefinition' })),
        ...(publications || []).map(item => ({ ...item, _type: 'Publication' }))
      ].filter(matches);
    } else {
      // Only show active tab
      if (activeTab === 'de') filtered = (dataExtensions || []).map(item => ({ ...item, _type: 'Data Extension' }));
      else if (activeTab === 'automation') filtered = (automations || []).map(item => ({ ...item, _type: 'Automation' }));
      else if (activeTab === 'datafilter') filtered = (dataFilters || []).map(item => ({ ...item, _type: 'Data Filter' }));
      else if (activeTab === 'journey') filtered = (journeys || []).map(item => ({ ...item, _type: 'Journey' }));
      else if (activeTab === 'emailsenddefinition') filtered = (resolvedEmailSendDefs || []).map(item => ({ ...item, _type: 'EmailSendDefinition' }));
      else if (activeTab === 'publication') filtered = (publications || []).map(item => ({ ...item, _type: 'Publication' }));
    }
    return sortData(filtered);
  };

  const paginatedData = () => {
    const filtered = getFilteredData();
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(getFilteredData().length / itemsPerPage);

  // CSV download functionality (dynamic columns per tab)
  const downloadCSV = () => {
    let headers = [];
    let rows = [];
    if (activeTab === 'de') {
      headers = ['Type', 'Name', 'Path', 'Created By', 'Modified By', 'Row Count', 'Is Sendable', 'Is Testable'];
      rows = (searchTerm ? getFilteredData().filter(item => item._type === 'Data Extension') : dataExtensions).map(item => [
        '"' + (item._type || 'Data Extension') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"',
        '"' + (item.createdByName || item.CreatedByName || '') + '"',
        '"' + (item.modifiedByName || item.ModifiedByName || '') + '"',
        '"' + (item.rowCount != null ? item.rowCount : (item.RowCount != null ? item.RowCount : '')) + '"',
        '"' + (item.isSendable != null ? (item.isSendable ? 'Yes' : 'No') : (item.IsSendable ? 'Yes' : 'No')) + '"',
        '"' + (item.isTestable != null ? (item.isTestable ? 'Yes' : 'No') : (item.IsTestable ? 'Yes' : 'No')) + '"'
      ]);
    } else if (activeTab === 'automation') {
      headers = ['Type', 'Name', 'Path', 'Status', 'Start Date', 'End Date', 'Last Run Time'];
      rows = (searchTerm ? getFilteredData().filter(item => item._type === 'Automation') : automations).map(item => [
        '"' + (item._type || 'Automation') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"',
        '"' + (item.status || item.Status || '') + '"',
        '"' + (item.startDate || item.StartDate || '') + '"',
        '"' + (item.endDate || item.EndDate || '') + '"',
        '"' + (item.lastRunTime || item.LastRunTime || '') + '"'
      ]);
    } else if (activeTab === 'datafilter') {
      headers = ['Type', 'Name', 'Path'];
      rows = (searchTerm ? getFilteredData().filter(item => item._type === 'Data Filter') : dataFilters).map(item => [
        '"' + (item._type || 'Data Filter') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"'
      ]);
    } else if (activeTab === 'journey') {
      headers = ['Type', 'Name', 'Path', 'Status'];
      rows = (searchTerm ? getFilteredData().filter(item => item._type === 'Journey') : journeys).map(item => [
        '"' + (item._type || 'Journey') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"',
        '"' + (item.status || item.Status || '') + '"'
      ]);
    } else if (activeTab === 'emailsenddefinition') {
      headers = ['Name', 'Send Classification', 'Sender Profile', 'Delivery Profile'];
      rows = (searchTerm ? getFilteredData().filter(item => item._type === 'EmailSendDefinition') : resolvedEmailSendDefs).map(esd => [
        '"' + (esd.Name || '') + '"',
        '"' + (esd.SendClassification?.CustomerKey || '') + '"',
        '"' + (esd.SenderProfile?.CustomerKey || '') + '"',
        '"' + (esd.DeliveryProfile?.CustomerKey || '') + '"'
      ]);
    } else if (activeTab === 'publication') {
      headers = ['ID', 'Name', 'Category', 'Customer Key', 'Business Unit'];
      rows = (searchTerm ? getFilteredData().filter(item => item._type === 'Publication') : publications).map(pub => [
        '"' + (pub.id || '') + '"',
        '"' + (pub.name || '') + '"',
        '"' + (pub.category || '') + '"',
        '"' + (pub.customerKey || '') + '"',
        '"' + (pub.businessUnit || '') + '"'
      ]);
    } else {
      // fallback: export whatever is in getFilteredData()
      const filtered = getFilteredData();
      if (filtered.length > 0) {
        headers = Object.keys(filtered[0]);
        rows = filtered.map(item => headers.map(h => '"' + (item[h] || '').toString().replace(/"/g, '""') + '"'));
      }
    }
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

  // Enhanced export functions for different contexts
  const exportSearchResults = () => {
    const filteredData = getFilteredData();
    if (filteredData.length === 0) return;
    
    exportDataAsCSV(filteredData, `${activeTab}_search_results`);
    console.log(`Exported ${filteredData.length} search results for ${getActiveTabLabel()}`);
  };

  const exportAllInCategory = () => {
    let allData = [];
    if (activeTab === 'de') allData = dataExtensions.map(item => ({ ...item, _type: 'Data Extension' }));
    else if (activeTab === 'automation') allData = automations.map(item => ({ ...item, _type: 'Automation' }));
    else if (activeTab === 'datafilter') allData = dataFilters.map(item => ({ ...item, _type: 'Data Filter' }));
    else if (activeTab === 'journey') allData = journeys.map(item => ({ ...item, _type: 'Journey' }));
    else if (activeTab === 'emailsenddefinition') allData = resolvedEmailSendDefs.map(item => ({ ...item, _type: 'EmailSendDefinition' }));
    else if (activeTab === 'publication') allData = publications.map(item => ({ ...item, _type: 'Publication' }));
    
    exportDataAsCSV(allData, `${activeTab}_all_data`);
    console.log(`Exported all ${allData.length} items in ${getActiveTabLabel()}`);
  };

  const exportDataAsCSV = (data, filename) => {
    if (data.length === 0) return;
    
    let headers = [];
    let rows = [];
    
    // Get the first item type to determine columns
    const firstItem = data[0];
    const itemType = firstItem._type || 'Unknown';
    
    if (itemType === 'Data Extension') {
      headers = ['Type', 'Name', 'Path', 'Created By', 'Modified By', 'Row Count', 'Is Sendable', 'Is Testable'];
      rows = data.map(item => [
        '"' + (item._type || 'Data Extension') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"',
        '"' + (item.createdByName || item.CreatedByName || '') + '"',
        '"' + (item.modifiedByName || item.ModifiedByName || '') + '"',
        '"' + (item.rowCount != null ? item.rowCount : (item.RowCount != null ? item.RowCount : '')) + '"',
        '"' + (item.isSendable != null ? (item.isSendable ? 'Yes' : 'No') : (item.IsSendable ? 'Yes' : 'No')) + '"',
        '"' + (item.isTestable != null ? (item.isTestable ? 'Yes' : 'No') : (item.IsTestable ? 'Yes' : 'No')) + '"'
      ]);
    } else if (itemType === 'Automation') {
      headers = ['Type', 'Name', 'Path', 'Status', 'Start Date', 'End Date', 'Last Run Time'];
      rows = data.map(item => [
        '"' + (item._type || 'Automation') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"',
        '"' + (item.status || item.Status || '') + '"',
        '"' + (item.startDate || item.StartDate || '') + '"',
        '"' + (item.endDate || item.EndDate || '') + '"',
        '"' + (item.lastRunTime || item.LastRunTime || '') + '"'
      ]);
    } else if (itemType === 'Data Filter') {
      headers = ['Type', 'Name', 'Path'];
      rows = data.map(item => [
        '"' + (item._type || 'Data Filter') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"'
      ]);
    } else if (itemType === 'Journey') {
      headers = ['Type', 'Name', 'Path', 'Status'];
      rows = data.map(item => [
        '"' + (item._type || 'Journey') + '"',
        '"' + (item.name || item.Name || '') + '"',
        '"' + (item.path || item.Path || '') + '"',
        '"' + (item.status || item.Status || '') + '"'
      ]);
    } else if (itemType === 'EmailSendDefinition') {
      headers = ['Name', 'Send Classification', 'Sender Profile', 'Delivery Profile'];
      rows = data.map(esd => [
        '"' + (esd.Name || '') + '"',
        '"' + (esd.SendClassification?.CustomerKey || '') + '"',
        '"' + (esd.SenderProfile?.CustomerKey || '') + '"',
        '"' + (esd.DeliveryProfile?.CustomerKey || '') + '"'
      ]);
    } else if (itemType === 'Publication') {
      headers = ['ID', 'Name', 'Category', 'Customer Key', 'Business Unit'];
      rows = data.map(pub => [
        '"' + (pub.id || '') + '"',
        '"' + (pub.name || '') + '"',
        '"' + (pub.category || '') + '"',
        '"' + (pub.customerKey || '') + '"',
        '"' + (pub.businessUnit || '') + '"'
      ]);
    } else {
      // Fallback: use all available keys
      headers = Object.keys(firstItem);
      rows = data.map(item => headers.map(h => '"' + (item[h] || '').toString().replace(/"/g, '""') + '"'));
    }
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getActiveTabLabel = () => {
    const tabLabels = {
      'de': 'Data Extensions',
      'automation': 'Automations', 
      'datafilter': 'Data Filters',
      'journey': 'Journeys',
      'emailsenddefinition': 'Email Send Definitions',
      'publication': 'Publications'
    };
    return tabLabels[activeTab] || 'Assets';
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
  const pubGroups = getDateGroups(publications);

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

  // Handler for Preference Center Builder form submission
  const handlePreferenceCenterSubmit = async (config) => {
    try {
      setPreviewResult({ loading: true });
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch('/preference-center/project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      setPreviewResult({ loading: false, data });
      console.log('✅ Preference Center generated:', data);
    } catch (e) {
      setPreviewResult({ loading: false, error: e.message });
      console.error('❌ Preference Center generation failed:', e);
    }
  };

  // Handler to fetch SendClassification details by name
  const fetchSendClassDetails = async (name) => {
    setSendClassModal({ open: true, loading: true, error: null, details: null, name });
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch(`${baseURL}/search/sendclassification?name=${encodeURIComponent(name)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        }
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const details = await res.json();
      setSendClassModal({ open: true, loading: false, error: null, details, name });
    } catch (e) {
      setSendClassModal({ open: true, loading: false, error: e.message, details: null, name });
    }
  };

  // Handler to fetch SenderProfile details by name
  const fetchSenderProfileDetails = async (name) => {
    setSenderProfileModal({ open: true, loading: true, error: null, details: null, name });
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch(`${baseURL}/search/senderprofile?name=${encodeURIComponent(name)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        }
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const details = await res.json();
      setSenderProfileModal({ open: true, loading: false, error: null, details, name });
    } catch (e) {
      setSenderProfileModal({ open: true, loading: false, error: e.message, details: null, name });
    }
  };

  // Handler to open update modal
  const openUpdateSenderProfileModal = (customerKey) => {
    setUpdateSenderProfileModal({ open: true, loading: false, error: null, customerKey, selectedKey: '', success: false });
  };

  // Handler to update sender profile
  const handleUpdateSenderProfile = async () => {
    setUpdateSenderProfileModal(modal => ({ ...modal, loading: true, error: null, success: false }));
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const res = await fetch(`${baseURL}/update/emailsenddefinition-senderprofile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        },
        body: JSON.stringify({
          customerKey: updateSenderProfileModal.customerKey,
          newSenderProfileKey: updateSenderProfileModal.selectedKey
        })
      });
      if (!res.ok) throw new Error('Update failed');
      setUpdateSenderProfileModal(modal => ({ ...modal, loading: false, error: null, success: true }));
      // Refresh EmailSendDefinition data after update
      setPendingFetches(prev => prev + 1);
      fetch(`${baseURL}/search/emailsenddefinition`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'x-mc-subdomain': localStorage.getItem('subdomain')
        }
      })
        .then(r => r.json())
        .then(data => setEmailSendDefinitions(Array.isArray(data) ? data : []))
        .finally(() => setPendingFetches(prev => prev - 1));
    } catch (e) {
      setUpdateSenderProfileModal(modal => ({ ...modal, loading: false, error: e.message, success: false }));
    }
  };

  // Handler to open edit modal
  function openEditESDModal(esd) {
    // Always use the most up-to-date data from resolvedEmailSendDefs
    const currentEsd = resolvedEmailSendDefs.find(item => item.CustomerKey === esd.CustomerKey) || esd;
    
    setEditESDModal({
      open: true,
      loading: false,
      error: null,
      esd: currentEsd, // Keep reference to original data for display
      sendClassification: currentEsd.SendClassification?.CustomerKey || '',
      senderProfile: currentEsd.SenderProfile?.CustomerKey || '',
      deliveryProfile: currentEsd.DeliveryProfile?.CustomerKey || '',
      // Start with empty fields - user must explicitly enter what they want
      bccEmail: '',
      ccEmail: ''
    });
  }

  // Handler to close edit modal
  function closeEditESDModal() {
    setEditESDModal({ open: false, loading: false, error: null, esd: null, sendClassification: '', senderProfile: '', deliveryProfile: '', bccEmail: '', ccEmail: '' });
  }

  // Handler for dropdown changes
  function handleEditESDChange(field, value) {
    setEditESDModal(prev => ({ ...prev, [field]: value }));
  }

  // Helper to get CustomerKey from name or key
  function getCustomerKey(profiles, value) {
    if (!value) return '';
    // If value matches a CustomerKey, return it
    if (profiles.some(p => p.CustomerKey === value)) return value;
    // Otherwise, try to find by Name
    const found = profiles.find(p => p.Name === value);
    return found ? found.CustomerKey : value;
  }

  // Handler to submit update
  async function submitEditESDModal() {
    setEditESDModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const sendClassificationKey = getCustomerKey(sendClassifications, editESDModal.sendClassification);
      const senderProfileKey = getCustomerKey(senderProfiles, editESDModal.senderProfile);
      const deliveryProfileKey = getCustomerKey(deliveryProfiles, editESDModal.deliveryProfile);
      
      // Update the record
      const res = await fetch(`${baseURL}/update/emailsenddefinition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        },
        body: JSON.stringify({
          CustomerKey: editESDModal.esd.CustomerKey,
          SendClassification: sendClassificationKey,
          SenderProfile: senderProfileKey,
          DeliveryProfile: deliveryProfileKey,
          BccEmail: '', // Hidden from UI - always clear
          CCEmail: ''   // Hidden from UI - always clear
        })
      });
      const data = await res.json();
      
      if (data.status === 'OK') {
        setEditESDModal(prev => ({ ...prev, loading: false, open: false }));
        alert('✅ Updated successfully');
        
        // Always refresh after any update - cache-busting with timestamp
        setTimeout(async () => {
          await refreshResolvedEmailSendDefs();
        }, 3000); // 3 second delay for Marketing Cloud propagation
      } else {
        setEditESDModal(prev => ({ ...prev, loading: false, error: data.message || 'Update failed' }));
        alert('❌ Update failed: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      setEditESDModal(prev => ({ ...prev, loading: false, error: err.message }));
      alert('❌ Update failed: ' + err.message);
    }
  }

  // Handler for config upload
  const handleConfigFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setConfigJson(evt.target.result);
    };
    reader.readAsText(file);
  };

  // Handler for config submit
  const handleConfigSubmit = async () => {
    setConfigError('');
    setParsedRelationships([]);
    let json;
    try {
      json = JSON.parse(configJson);
    } catch (e) {
      setConfigError('Invalid JSON');
      return;
    }
    try {
      const res = await fetch(`${baseURL}/parse/emailsenddefinition-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      if (!res.ok) throw new Error('Failed to parse config');
      const data = await res.json();
      setParsedRelationships(data);
    } catch (e) {
      setConfigError(e.message);
    }
  };

  // Helper to refresh resolved EmailSendDefinitions
  async function refreshResolvedEmailSendDefs() {
    const accessToken = localStorage.getItem('accessToken');
    const subdomain = localStorage.getItem('subdomain');
    if (!accessToken || !subdomain) return;
    try {
      // Add cache-busting parameter to ensure fresh data
      const cacheBuster = Date.now();
      const res = await fetch(`${baseURL}/resolved/emailsenddefinition-relationships?_t=${cacheBuster}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        }
      });
      if (!res.ok) throw new Error('Failed to fetch resolved relationships');
      const data = await res.json();
      setResolvedEmailSendDefs(Array.isArray(data) ? data : []);
    } catch (e) {
      setResolvedError(e.toString());
    }
  }

  useEffect(() => {
    if (activeTab === 'emailsenddefinition' && isAuthenticated) {
      setResolvedError('');
      setResolvedEmailSendDefs([]);
      refreshResolvedEmailSendDefs();
    }
  }, [activeTab, isAuthenticated]);

  // State for mass selection
  function toggleSelectAllESD() {
    if (allSelected) setSelectedESDKeys([]);
    else setSelectedESDKeys(resolvedEmailSendDefs.map(r => r.CustomerKey));
  }
  function toggleSelectESD(key) {
    setSelectedESDKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  // State for mass edit modal
  // (already declared at the top)

  // Handler for dropdown changes in mass edit modal
  function handleMassEditChange(field, value) {
    setMassEditModal(prev => ({ ...prev, [field]: value }));
  }

  // Handler to submit mass update
  async function submitMassEditModal() {
    setMassEditModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      const accessToken = localStorage.getItem('accessToken');
      const subdomain = localStorage.getItem('subdomain');
      const sendClassificationKey = getCustomerKey(sendClassifications, massEditModal.sendClassification);
      const senderProfileKey = getCustomerKey(senderProfiles, massEditModal.senderProfile);
      const deliveryProfileKey = getCustomerKey(deliveryProfiles, massEditModal.deliveryProfile);
      const res = await fetch(`${baseURL}/update/emailsenddefinition-mass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-mc-subdomain': subdomain
        },
        body: JSON.stringify({
          CustomerKeys: selectedESDKeys,
          SendClassification: sendClassificationKey,
          SenderProfile: senderProfileKey,
          DeliveryProfile: deliveryProfileKey,
          BccEmail: '', // Hidden from UI - always clear
          CCEmail: ''   // Hidden from UI - always clear
        })
      });
      const data = await res.json();
      if (data.status === 'OK') {
        setMassEditModal({ open: false, sendClassification: '', senderProfile: '', deliveryProfile: '', bccEmail: '', ccEmail: '', loading: false, error: null });
        setSelectedESDKeys([]);
        alert('✅ Bulk update successful');
        // Add a longer delay (3 seconds) to ensure Marketing Cloud has fully propagated the update
        setTimeout(async () => {
          await refreshResolvedEmailSendDefs();
        }, 3000);
      } else {
        setMassEditModal(prev => ({ ...prev, loading: false, error: data.message || 'Update failed' }));
        alert('❌ Bulk update failed: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      setMassEditModal(prev => ({ ...prev, loading: false, error: err.message }));
      alert('❌ Bulk update failed: ' + err.message);
    }
  }

  // --- Email Auditing Fetch Logic ---
  const fetchEmailArchive = async () => {
    setEmailArchiveLoading(true);
    setEmailArchiveError('');
    setSelectedSendId(null);
    setSentEventResults([]);
    setSentEventPage(1);
    try {
      const params = new URLSearchParams();
      if (archiveSearch.jobId) params.append('jobId', archiveSearch.jobId);
      if (archiveSearch.emailName) params.append('emailName', archiveSearch.emailName);
      if (archiveSearch.subject) params.append('subject', archiveSearch.subject);
      const res = await fetch(`/api/email-archive/send?${params.toString()}`);
      const data = await res.json();
      let arr = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
      setEmailArchiveResults(arr);
      setArchivePage(1);
    } catch (e) {
      setEmailArchiveError('Failed to fetch email archive results.');
      setEmailArchiveResults([]);
    } finally {
      setEmailArchiveLoading(false);
    }
  };
  useEffect(() => {
    if (!selectedSendId) return;
    setSentEventLoading(true);
    setSentEventError('');
    fetch(`/api/email-archive/sent-events?jobId=${encodeURIComponent(selectedSendId)}`)
      .then(res => res.json())
      .then(data => {
        let arr = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
        setSentEventResults(arr);
        setSentEventPage(1);
      })
      .catch(() => setSentEventError('Failed to fetch sent events.'))
      .finally(() => setSentEventLoading(false));
  }, [selectedSendId]);

  // Pagination logic for Email Auditing table
  const paginatedArchiveResults = emailArchiveResults.slice((archivePage - 1) * archiveRowsPerPage, archivePage * archiveRowsPerPage);
  const totalArchivePages = Math.ceil(emailArchiveResults.length / archiveRowsPerPage);

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

  // Render navigation tabs
  const renderNavigation = () => (
    <div className="flex space-x-4 mb-6">
      <button
        className={`px-4 py-2 rounded-lg ${activeTab === 'de' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
        onClick={() => setActiveTab('de')}
      >
        Data Extensions
      </button>
      <button
        className={`px-4 py-2 rounded-lg ${activeTab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
        onClick={() => setActiveTab('dm')}
      >
        Distributed Marketing
      </button>
      <button
        className={`px-4 py-2 rounded-lg ${activeTab === 'preferencecenter' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
        onClick={() => setActiveTab('preferencecenter')}
      >
        Preference Center
      </button>
      <button
        className={`px-4 py-2 rounded-lg ${activeTab === 'emailarchiving' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}
        onClick={() => setActiveTab('emailarchiving')}
      >
        Email Archiving
      </button>
      <button
        className={`px-4 py-2 rounded-lg ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}
        onClick={() => setActiveTab('settings')}
      >
        Settings
      </button>
    </div>
  );

  // Render main content for DM Quick Send
  const renderDMQuickSend = () => (
    <div>
      <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
        Single Click Distributed Marketing Quick Send Journey Setup
      </h2>
      <button
        onClick={async () => {
          setQSLoading(true);
          setQSStatus(""); // Only clear DM QS status
          setQSDetails(null);
          try {
            const res = await fetch(`${baseURL}/create/dm-dataextension`, { method: 'POST' });
            const json = await res.json();
            if (json.status === "OK") {
              setQSStatus("✅ All set!");
              setQSDetails({
                deName: json.deName,
                dePath: json.folderName ? `/Data Extensions / ${json.folderName}` : '',
                eventName: json.eventName || json.eventDefinitionKey || '',
                journeyName: json.journeyName || '',
              });
            } else {
              setQSStatus("❌ Setup failed.");
            }
          } catch (e) {
            setQSStatus("❌ Error during setup.");
          } finally {
            setQSLoading(false);
          }
        }}
        disabled={qsLoading}
        className={`mt-4 px-6 py-2 rounded-md ${qsLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}
      >
        {qsLoading ? 'Processing...' : 'Create DM QS'}
      </button>
      <div className="mt-6 text-gray-700 space-y-2">
        {qsStatus && <p className="text-lg font-medium">{qsStatus}</p>}
        {qsDetails && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p>🔹 <strong>QS DE name:</strong> {qsDetails.deName}</p>
            {qsDetails.dePath && <p>🔹 <strong>QS DE path:</strong> {qsDetails.dePath}</p>}
            {qsDetails.eventName && <p>🔹 <strong>QS Event name:</strong> {qsDetails.eventName}</p>}
            {qsDetails.journeyName && <p>🔹 <strong>QS Journey name:</strong> {qsDetails.journeyName}</p>}
            <p>🔹 <strong>Now go ahead and update the Journey with the email activity.</strong></p>
            <p>🔹 <strong>Edit the journey settings to select contact re-entry mode and email attribute from Entry Source.</strong></p>
            <p>🔹 <strong>Validate and activate the journey.</strong></p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl">
        {/* Product-Grade Header with Logo */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-gray-900">MC Explorer</h1>
                <p className="text-xs text-gray-500">Marketing Cloud Management Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                Connected
              </span>
              <Btn variant="ghost" onClick={handleLogout}>Logout</Btn>
            </div>
          </div>

          {/* Refined Navigation Tabs */}
          <nav className="mt-4" role="tablist" aria-label="Main navigation">
            <div className="flex items-center gap-1 overflow-x-auto">
              {['Search Assets','Schema Builder','Distributed Marketing','Preference Center','Email Auditing','Email Archiving','Settings'].map(label => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={
                    (label === 'Search Assets' && parentNav === 'search') ||
                    (label === 'Schema Builder' && parentNav === 'schemaBuilder') ||
                    (label === 'Distributed Marketing' && parentNav === 'distributedMarketing') ||
                    (label === 'Preference Center' && parentNav === 'preferencecenter') ||
                    (label === 'Email Auditing' && parentNav === 'emailArchiving') ||
                    (label === 'Email Archiving' && parentNav === 'emailArchivingSetup') ||
                    (label === 'Settings' && parentNav === 'settings')
                  }
                  className={`px-4 py-2 text-sm font-medium rounded-lg border border-transparent hover:bg-gray-50 transition-all duration-200 whitespace-nowrap ${
                    ((label === 'Search Assets' && parentNav === 'search') ||
                    (label === 'Schema Builder' && parentNav === 'schemaBuilder') ||
                    (label === 'Distributed Marketing' && parentNav === 'distributedMarketing') ||
                    (label === 'Preference Center' && parentNav === 'preferencecenter') ||
                    (label === 'Email Auditing' && parentNav === 'emailArchiving') ||
                    (label === 'Email Archiving' && parentNav === 'emailArchivingSetup') ||
                    (label === 'Settings' && parentNav === 'settings'))
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-gray-600'
                  }`}
                  onClick={() => {
                    if (label === 'Search Assets') setParentNav('search');
                    else if (label === 'Schema Builder') setParentNav('schemaBuilder');
                    else if (label === 'Distributed Marketing') setParentNav('distributedMarketing');
                    else if (label === 'Preference Center') setParentNav('preferencecenter');
                    else if (label === 'Email Auditing') setParentNav('emailArchiving');
                    else if (label === 'Email Archiving') setParentNav('emailArchivingSetup');
                    else if (label === 'Settings') setParentNav('settings');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        </header>

        {/* Main Content */}
        <main className="px-6 py-8 space-y-8">
        {/* Render content based on parentNav */}
        {parentNav === 'search' ? (
          <>
            {/* Enhanced KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard 
                title="Data Extensions" 
                value={dataExtensions.length} 
                subtitle={`Last 7d: ${deGroups.last7} · 30d: ${deGroups.last30} · 6mo: ${deGroups.last180} · 1yr: ${deGroups.last365}`}
                icon={
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                  </svg>
                }
              />
              <KpiCard 
                title="Automations" 
                value={automations.length}  
                subtitle={`Last 7d: ${autoGroups.last7} · 30d: ${autoGroups.last30} · 6mo: ${autoGroups.last180} · 1yr: ${autoGroups.last365}`}
                icon={
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                }
              />
              <KpiCard 
                title="Data Filters" 
                value={dataFilters.length} 
                subtitle={`Last 7d: ${dfGroups.last7} · 30d: ${dfGroups.last30} · 6mo: ${dfGroups.last180} · 1yr: ${dfGroups.last365}`}
                icon={
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                }
              />
              <KpiCard 
                title="Journeys" 
                value={journeys.length} 
                subtitle={`Last 7d: ${journeyGroups.last7} · 30d: ${journeyGroups.last30} · 6mo: ${journeyGroups.last180} · 1yr: ${journeyGroups.last365}`}
                icon={
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                }
              />
            </div>

            {/* Modern Search & Filter Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-6 border-b border-gray-200">
                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="search"
                      placeholder="Search across all assets..."
                      aria-label="Search assets"
                      className="h-9 w-full pl-10 pr-4 border border-slate-200 rounded-md bg-white text-sm placeholder-slate-400 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,.35)] transition-colors"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button 
                    type="button"
                    className="h-9 px-3 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
                  >
                    Search
                  </button>
                  
                  {/* Enhanced Export Menu */}
                  <ExportMenu
                    searchCount={getFilteredData().length}
                    category={getActiveTabLabel()}
                    onExportSearch={exportSearchResults}
                    onExportAll={exportAllInCategory}
                  />
                </div>
                
                {/* Asset Type Filters with clear separation */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Asset type filters">
                    {[
                      { key: 'de', label: 'Data Extensions' },
                      { key: 'automation', label: 'Automations' },
                      { key: 'datafilter', label: 'Data Filters' },
                      { key: 'journey', label: 'Journeys' },
                      { key: 'emailsenddefinition', label: 'Email Send Definitions' },
                      { key: 'publication', label: 'Publications' }
                    ].map(tab => (
                      <Tab
                        key={tab.key}
                        label={tab.label}
                        active={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Helper text for export clarity */}
                <div className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-md p-3">
                  <div className="flex items-start gap-4">
                    <div>
                      <span className="font-medium text-slate-700">Export search results</span> downloads only what's shown in the table below ({getFilteredData().length} items).
                    </div>
                    <div className="text-slate-300">•</div>
                    <div>
                      <span className="font-medium text-slate-700">Export all in category</span> downloads every item in {getActiveTabLabel()}.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modern Table Container */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {activeTab === 'emailsenddefinition' ? (
                <>
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Email Send Definitions</h3>
                        <p className="text-sm text-gray-600">Manage and configure your email send definitions</p>
                      </div>
                      {selectedESDKeys.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Tag variant="success">{selectedESDKeys.length} selected</Tag>
                          <Btn variant="primary" onClick={() => setMassEditModal({ open: true, sendClassification: '', senderProfile: '', deliveryProfile: '', bccEmail: '', ccEmail: '', loading: false, error: null })}>
                            Bulk Edit
                          </Btn>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">
                            <input 
                              type="checkbox" 
                              checked={allSelected} 
                              onChange={toggleSelectAllESD}
                              aria-label="Select all email send definitions"
                              className="rounded border-gray-300 text-brand focus:ring-brand"
                            />
                          </th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Name</th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Send Classification</th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Sender Profile</th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Delivery Profile</th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(searchTerm ? getFilteredData().filter(item => item._type === 'EmailSendDefinition') : resolvedEmailSendDefs).map((esd, index) => (
                          <tr key={esd.CustomerKey} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <td className="px-6 py-4">
                              <input 
                                type="checkbox" 
                                checked={selectedESDKeys.includes(esd.CustomerKey)} 
                                onChange={() => toggleSelectESD(esd.CustomerKey)}
                                aria-label={`Select ${esd.Name}`}
                                className="rounded border-gray-300 text-brand focus:ring-brand"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{esd.Name}</div>
                              <div className="text-sm text-gray-500">{esd.CustomerKey}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-900">{getProfileName(sendClassifications, esd.SendClassification?.CustomerKey)}</td>
                            <td className="px-6 py-4 text-gray-900">{getProfileName(senderProfiles, esd.SenderProfile?.CustomerKey)}</td>
                            <td className="px-6 py-4 text-gray-900">{getProfileName(deliveryProfiles, esd.DeliveryProfile?.CustomerKey)}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Btn variant="ghost" size="sm" onClick={() => openEditESDModal(esd)} title="Edit email send definition" aria-label={`Edit ${esd.Name}`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </Btn>
                                <Btn variant="ghost" size="sm" title="Open in Marketing Cloud" aria-label={`Open ${esd.Name} in Marketing Cloud`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </Btn>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : activeTab === 'publication' ? (
                <>
                  <div className="p-3 border-b border-border">
                    <h2 className="text-sm font-semibold">Publication Details</h2>
                  </div>
                  <div className="max-h-[72vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-panel text-faint border-b border-border">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">ID</th>
                          <th className="text-left font-medium px-3 py-2">Name</th>
                          <th className="text-left font-medium px-3 py-2">Category</th>
                          <th className="text-left font-medium px-3 py-2">Customer Key</th>
                          <th className="text-left font-medium px-3 py-2">Business Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(searchTerm ? getFilteredData().filter(item => item._type === 'Publication') : publications).map((pub, idx) => (
                          <tr key={pub.id || idx} className="hover:bg-white/5">
                            <td className="px-3 py-2 border-t border-border/60">{pub.id}</td>
                            <td className="px-3 py-2 border-t border-border/60 font-medium">{pub.name}</td>
                            <td className="px-3 py-2 border-t border-border/60">{pub.category}</td>
                            <td className="px-3 py-2 border-t border-border/60">{pub.customerKey || ''}</td>
                            <td className="px-3 py-2 border-t border-border/60">{pub.businessUnit || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {activeTab === 'de' ? 'Data Extensions' :
                           activeTab === 'automation' ? 'Automations' :
                           activeTab === 'datafilter' ? 'Data Filters' :
                           activeTab === 'journey' ? 'Journeys' :
                           activeTab === 'publication' ? 'Publications' :
                           activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {activeTab === 'de' ? 'Manage and configure your data extensions' :
                           activeTab === 'automation' ? 'View and monitor automation workflows' :
                           activeTab === 'datafilter' ? 'Manage data filtering criteria' :
                           activeTab === 'journey' ? 'View and monitor customer journeys' :
                           activeTab === 'publication' ? 'Manage publication lists and settings' :
                           `Browse and manage ${activeTab} assets`}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500">
                        {getFilteredData().length} items
                      </div>
                    </div>
                  </div>
                  <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full">{/* Modern table styling to match Email Send Definitions */}
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Type</th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => requestSort('name')}>
                            <span className="flex items-center gap-1">
                              Name
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                              </svg>
                            </span>
                          </th>
                          <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => requestSort('path')}>
                            <span className="flex items-center gap-1">
                              Path
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                              </svg>
                            </span>
                          </th>
                          {!(activeTab === 'automation' || activeTab === 'journey') && (
                            <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm">Actions</th>
                          )}
                          {(!searchTerm && (activeTab === 'automation' || activeTab === 'journey')) || (searchTerm && getFilteredData().some(item => item._type === 'Automation' || item._type === 'Journey')) ? (
                            <th className="text-left font-semibold text-gray-900 px-6 py-3 text-sm cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => requestSort('status')}>
                              <span className="flex items-center gap-1">
                                Status
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                                </svg>
                              </span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedData().map((item, idx) => (
                          <tr 
                            key={idx} 
                            className={`hover:bg-gray-50 transition-colors ${item._type === 'Data Extension' || item._type === 'Automation' ? 'cursor-pointer' : ''} ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                            onClick={() => {
                              if (item._type === 'Data Extension') fetchDeDetails(item.name);
                              if (item._type === 'Automation') fetchAutomationDetails(item.name, item.id);
                            }}
                          >
                            <td className="px-6 py-4">
                              <Tag variant={
                                item._type === 'Data Extension' ? 'default' :
                                item._type === 'Automation' ? 'success' :
                                item._type === 'Data Filter' ? 'warning' :
                                'default'
                              }>
                                {item._type}
                              </Tag>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{item.name}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{item.path || 'N/A'}</td>
                            {!(item._type === 'Automation' || item._type === 'Journey') && (
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  {item._type === 'Data Extension' && item.categoryId && item.id && (
                                    <Btn 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={e => {
                                        e.stopPropagation();
                                        window.open(`https://mc.s4.exacttarget.com/cloud/#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers/CustomObjects/${item.categoryId}/?ts=${item.id}/view`, '_blank');
                                      }}
                                      title="View in Marketing Cloud"
                                      aria-label={`View ${item.name} in Marketing Cloud`}
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                      View
                                    </Btn>
                                  )}
                                  {item._type === 'Data Filter' && item.id && (
                                    <Btn 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={e => {
                                        e.stopPropagation();
                                        window.open(`https://mc.s4.exacttarget.com/cloud/#app/Email/C12/Default.aspx?entityType=none&entityID=0&ks=ks%23Subscribers/filters/${item.id}/view`, '_blank');
                                      }}
                                      title="View in Marketing Cloud"
                                      aria-label={`View ${item.name} in Marketing Cloud`}
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                      View
                                    </Btn>
                                  )}
                                </div>
                              </td>
                            )}
                            {(item._type === 'Automation' || item._type === 'Journey') && (
                              <td className="px-6 py-4">
                                <Tag variant={
                                  item.status === 'Running' || item.status === 'Active' ? 'success' :
                                  item.status === 'Paused' || item.status === 'Stopped' ? 'warning' :
                                  item.status === 'Error' || item.status === 'Failed' ? 'error' :
                                  'default'
                                }>
                                  {item.status || 'N/A'}
                                </Tag>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <div className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages} · Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, getFilteredData().length)} of {getFilteredData().length} items
                    </div>
                    <div className="flex items-center gap-2">
                      <Btn 
                        variant="ghost" 
                        size="sm" 
                        disabled={currentPage === 1} 
                        onClick={() => setCurrentPage(p => p - 1)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Previous
                      </Btn>
                      <Btn 
                        variant="ghost" 
                        size="sm" 
                        disabled={currentPage === totalPages || totalPages <= 1} 
                        onClick={() => setCurrentPage(p => p + 1)}
                      >
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Btn>
                    </div>
                  </div>
                </>
              )}
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

            {/* Modal for SendClassification details */}
            {sendClassModal.open && (
              <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw] relative">
                  <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600" onClick={() => setSendClassModal({ open: false, loading: false, error: null, details: null, name: null })}>&#10005;</button>
                  <h2 className="text-lg font-bold mb-4 text-indigo-700">SendClassification Details: {sendClassModal.name}</h2>
                  {sendClassModal.loading && <div className="text-center py-4">Loading details...</div>}
                  {sendClassModal.error && <div className="text-red-600">{sendClassModal.error}</div>}
                  {sendClassModal.details && Array.isArray(sendClassModal.details) && sendClassModal.details.length > 0 && (
                    <div className="space-y-2">
                      <div><span className="font-semibold">Name:</span> {sendClassModal.details[0].Name}</div>
                      <div><span className="font-semibold">CustomerKey:</span> {sendClassModal.details[0].CustomerKey}</div>
                      <div><span className="font-semibold">Description:</span> {sendClassModal.details[0].Description}</div>
                    </div>
                  )}
                  {sendClassModal.details && Array.isArray(sendClassModal.details) && sendClassModal.details.length === 0 && (
                    <div className="text-gray-600">No details found for this SendClassification.</div>
                  )}
                </div>
              </div>
            )}

            {/* Modal for SenderProfile details */}
            {senderProfileModal.open && (
              <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw] relative">
                  <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600" onClick={() => setSenderProfileModal({ open: false, loading: false, error: null, details: null, name: null })}>&#10005;</button>
                  <h2 className="text-lg font-bold mb-4 text-green-700">SenderProfile Details: {senderProfileModal.name}</h2>
                  {senderProfileModal.loading && <div className="text-center py-4">Loading details...</div>}
                  {senderProfileModal.error && <div className="text-red-600">{senderProfileModal.error}</div>}
                  {senderProfileModal.details && Array.isArray(senderProfileModal.details) && senderProfileModal.details.length > 0 && (
                    <div className="space-y-2">
                      <div><span className="font-semibold">Name:</span> {senderProfileModal.details[0].Name}</div>
                      <div><span className="font-semibold">CustomerKey:</span> {senderProfileModal.details[0].CustomerKey}</div>
                      <div><span className="font-semibold">Description:</span> {senderProfileModal.details[0].Description}</div>
                    </div>
                  )}
                  {senderProfileModal.details && Array.isArray(senderProfileModal.details) && senderProfileModal.details.length === 0 && (
                    <div className="text-gray-600">No details found for this SenderProfile.</div>
                  )}
                </div>
              </div>
            )}

            {/* Modal for updating SenderProfile */}
            {updateSenderProfileModal.open && (
              <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw] relative">
                  <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600" onClick={() => setUpdateSenderProfileModal({ open: false, loading: false, error: null, customerKey: null, selectedKey: '', success: false })}>&#10005;</button>
                  <h2 className="text-lg font-bold mb-4 text-yellow-700">Update SenderProfile</h2>
                  {updateSenderProfileModal.loading && <div className="text-center py-4">Updating...</div>}
                  {updateSenderProfileModal.error && <div className="text-red-600">{updateSenderProfileModal.error}</div>}
                  {updateSenderProfileModal.success && <div className="text-green-600">SenderProfile updated successfully!</div>}
                  <div className="mb-4">
                    <label className="block mb-2 font-semibold">Select new SenderProfile:</label>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={updateSenderProfileModal.selectedKey}
                      onChange={e => setUpdateSenderProfileModal(modal => ({ ...modal, selectedKey: e.target.value }))}
                    >
                      <option value="" disabled>Select SenderProfile...</option>
                      {senderProfiles.map(profile => (
                        <option key={profile.CustomerKey} value={profile.CustomerKey}>{profile.Name} ({profile.CustomerKey})</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="bg-yellow-600 text-white px-4 py-2 rounded font-semibold hover:bg-yellow-700"
                    onClick={handleUpdateSenderProfile}
                    disabled={!updateSenderProfileModal.selectedKey || updateSenderProfileModal.loading}
                  >
                    Update
                  </button>
                </div>
              </div>
            )}

            {/* Modal for editing EmailSendDefinition */}
            {editESDModal.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                <div className="bg-white rounded shadow-lg p-6 w-full max-w-md relative">
                  <h2 className="text-lg font-bold mb-4">Edit EmailSendDefinition</h2>
                  {editESDModal.error && <div className="text-red-600 mb-2">{editESDModal.error}</div>}
                  <div className="mb-4">
                    <label className="block mb-1 font-semibold">Send Classification</label>
                    <select
                      className="w-full border rounded p-2"
                      value={editESDModal.sendClassification}
                      onChange={e => handleEditESDChange('sendClassification', e.target.value)}
                    >
                      <option value="">Select SendClassification</option>
                      {sendClassifications.map(sc => (
                        <option key={sc.CustomerKey} value={sc.CustomerKey}>{sc.Name || sc.CustomerKey}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block mb-1 font-semibold">Sender Profile</label>
                    <select
                      className="w-full border rounded p-2"
                      value={editESDModal.senderProfile}
                      onChange={e => handleEditESDChange('senderProfile', e.target.value)}
                    >
                      <option value="">Select SenderProfile</option>
                      {senderProfiles.map(sp => (
                        <option key={sp.CustomerKey} value={sp.CustomerKey}>{sp.Name || sp.CustomerKey}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block mb-1 font-semibold">Delivery Profile</label>
                    <select
                      className="w-full border rounded p-2"
                      value={editESDModal.deliveryProfile}
                      onChange={e => handleEditESDChange('deliveryProfile', e.target.value)}
                    >
                      <option value="">Select DeliveryProfile</option>
                      {deliveryProfiles.map(dp => (
                        <option key={dp.CustomerKey} value={dp.CustomerKey}>{dp.Name || dp.CustomerKey}</option>
                      ))}
                    </select>
                  </div>
                  {/* BCC/CC Email fields hidden for cleaner UI */}
                  <div className="flex justify-end gap-2">
                    <button onClick={closeEditESDModal} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                    <button onClick={submitEditESDModal} className="px-4 py-2 bg-blue-600 text-white rounded" disabled={editESDModal.loading}>
                      {editESDModal.loading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk Edit Modal */}
            {massEditModal.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                <div className="bg-white rounded shadow-lg p-6 w-full max-w-md relative">
                  <h2 className="text-lg font-bold mb-4">Bulk Edit EmailSendDefinitions</h2>
                  {massEditModal.error && <div className="text-red-600 mb-2">{massEditModal.error}</div>}
                  <div className="mb-4">
                    <label className="block mb-1 font-semibold">Send Classification</label>
                    <select
                      className="w-full border rounded p-2"
                      value={massEditModal.sendClassification}
                      onChange={e => setMassEditModal(prev => ({ ...prev, sendClassification: e.target.value }))}
                    >
                      <option value="">(No Change)</option>
                      {sendClassifications.map(sc => (
                        <option key={sc.CustomerKey} value={sc.CustomerKey}>{sc.Name || sc.CustomerKey}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block mb-1 font-semibold">Sender Profile</label>
                    <select
                      className="w-full border rounded p-2"
                      value={massEditModal.senderProfile}
                      onChange={e => setMassEditModal(prev => ({ ...prev, senderProfile: e.target.value }))}
                    >
                      <option value="">(No Change)</option>
                      {senderProfiles.map(sp => (
                        <option key={sp.CustomerKey} value={sp.CustomerKey}>{sp.Name || sp.CustomerKey}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block mb-1 font-semibold">Delivery Profile</label>
                    <select
                      className="w-full border rounded p-2"
                      value={massEditModal.deliveryProfile}
                      onChange={e => setMassEditModal(prev => ({ ...prev, deliveryProfile: e.target.value }))}
                    >
                      <option value="">(No Change)</option>
                      {deliveryProfiles.map(dp => (
                        <option key={dp.CustomerKey} value={dp.CustomerKey}>{dp.Name || dp.CustomerKey}</option>
                      ))}
                    </select>
                  </div>
                  {/* BCC/CC Email fields hidden for cleaner UI */}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setMassEditModal({ open: false, sendClassification: '', senderProfile: '', deliveryProfile: '', bccEmail: '', ccEmail: '', loading: false, error: null })} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                    <button onClick={submitMassEditModal} className="px-4 py-2 bg-blue-600 text-white rounded" disabled={massEditModal.loading}>
                      {massEditModal.loading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Show DE info block after creation */}
            {dmDEPath && (() => {
              let deName = '';
              if (dmDEPath) {
                const parts = dmDEPath.split('/');
                deName = parts[parts.length - 1];
              }
              return (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
                  <div className="text-green-800 font-bold mb-2">Data Extension created!</div>
                  <div className="mb-2 text-gray-800">
                    <span className="font-semibold">Your data extension name is:</span> <span className="font-mono text-blue-900">{deName || 'N/A'}</span>
                  </div>
                  <div className="mb-2 text-gray-800">
                    <span className="font-semibold">The data extension path is:</span> <span className="font-mono text-blue-900">Data Extensions &gt; {deName || 'N/A'}</span>
                  </div>
                  <div className="mb-2 text-gray-800">
                    <span className="font-semibold">We have set the below attributes in the data extension:</span>
                    <ul className="list-disc ml-6 mt-1">
                      <li><span className="font-semibold">USED FOR SENDING: Yes</span></li>
                      <li><span className="font-semibold">USED FOR TESTING: Yes</span></li>
                      <li><span className="font-semibold">SUBSCRIBER RELATIONSHIP: id relates to Subscribers on Subscriber Key</span></li>
                    </ul>
                  </div>
                </div>
              );
            })()}
          </>
        ) : parentNav === 'preference' ? (
          <div className="p-6 bg-white rounded shadow">
            <h2 className="text-xl font-bold mb-4 text-indigo-700">How do you want your preference center to be set up?</h2>
            <select
              className="border rounded px-3 py-2 w-full mb-6"
              value={guidedPrefOption || ''}
              onChange={e => setGuidedPrefOption(e.target.value)}
            >
              <option value="" disabled>Select an option...</option>
              <option value="no_sf_core">Marketing Cloud Preference Center with no Salesforce core integration</option>
              <option value="sf_core_contact_lead">Marketing Cloud Preference Center with Salesforce core contact, Lead integration</option>
              <option value="sf_core_consent">Marketing Cloud Preference Center with Salesforce core consent model</option>
            </select>

            {guidedPrefOption === 'no_sf_core' && (
              <div className="mt-6 text-left">
                <a
                  href="/Custom%20Preference%20Center_No_SF_Integration.zip"
                  download
                  className="inline-block bg-indigo-600 text-white px-4 py-2 rounded font-semibold mb-4 hover:bg-indigo-700"
                >
                  Download Preference Center Package (ZIP)
                </a>
                <div className="bg-gray-50 border-l-4 border-indigo-400 p-4 rounded">
                  <h3 className="font-bold mb-2 text-indigo-700">Instructions</h3>
                  <ol className="list-decimal ml-6 text-sm text-gray-800 space-y-1">
                    <li>In the <b>Package Manager</b> folder, deploy the JSON into SFMC via Package Manager.</li>
                    <li>Go into the Cloud pages and do a search all and replace for the cloudpageURL IDs; there will be 2-3 that did not get deployed correctly.</li>
                    <li>In <b>cpc_main</b> on line 301, ensure that the cloud page ID is for <b>cpc_main</b>.</li>
                    <li>In <b>cpc_main</b> on line 331, ensure that the cloud page ID is for <b>cpc_handler</b>.</li>
                    <li>In <b>cpc_handler</b>, every <b>CloudPagesURL</b> function should point to the cloud page ID for <b>cpc_main</b>.</li>
                    <li>Test, validate, and add additional features as needed.</li>
                    <li>To use the preference center, the url expects a <b>subkey</b> parameter at the end of the URL (e.g. <span className="break-all">https://mcf7bhdjzswk278tj2j38nqtlq2q.pub.sfmc-content.com/jqi02yqkmgp?subkey=TEST10001</span>).</li>                  </ol>
                  <div className="mt-2 text-xs text-gray-600">
                    <b>NOTE:</b> The preference center assumes that a record with email exists in All Subscribers.
                  </div>
                </div>
              </div>
            )}

            {guidedPrefOption === 'sf_core_contact_lead' && (
              <div className="mt-6 text-left text-gray-600">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <b>Coming soon:</b> Marketing Cloud Preference Center with Salesforce core contact, Lead integration is in development.
                </div>
              </div>
            )}

            {guidedPrefOption === 'sf_core_consent' && (
              <div className="mt-6 text-left text-gray-600">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <b>Coming soon:</b> Marketing Cloud Preference Center with Salesforce core consent model is in development.
                </div>
              </div>
            )}
          </div>
        ) : parentNav === 'distributedMarketing' ? (
          <div className="rounded-xl border border-border bg-card p-6">
            {renderDMQuickSend()}
          </div>
        ) : null}

        {/* Render content for Schema Builder */}
        {parentNav === 'schemaBuilder' && (
          <SchemaBuilder />
        )}

        {/* Render content for Preference Center config */}
        {parentNav === 'preferencecenter' && (
          <div className="rounded-xl border border-border bg-card p-6" id="preferencecenter-success-section">
            {/* Only show success message for Preference Center flow */}
            {preferenceCenterStatus && preferenceCenterStatus.startsWith('✅') && (
              <div className="bg-green-50 border border-green-300 text-green-800 rounded p-4 mb-4" id="preferencecenter-success-message">
                <div className="text-2xl mb-2">✅ Configuration Completed Successfully!</div>
                <div className="mb-2 font-semibold">Your Preference Center setup is now complete.</div>
                <ul className="mb-2 list-disc pl-6">
                  <li><b>PC_Controller</b>: This Data Extension contains all the configuration values used to render your dynamic Preference Center (labels, instructions, integration type, branding, etc.).</li>
                  <li><b>PC_Log</b>: This Data Extension automatically tracks all subscriber preference updates, including old vs. new values for audit and compliance.</li>
                </ul>
                <div className="mb-2">Both Data Extensions are created under your Data Extensions folder.</div>
                <div className="mb-2 font-semibold">Below is your ready-to-use CloudPage code. You can paste this into a new CloudPage to get started. Feel free to customize the HTML layout and styling to match your brand.</div>
                <CloudPageCodeSample />
              </div>
            )}
            <PreferenceCenterConfigForm 
              onSubmit={async config => {
                setPreferenceCenterStatus('Submitting configuration...');
                setQSLoading(true);
                try {
                  const res = await fetch(`${baseURL}/preference-center/configure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                  });
                  const json = await res.json();
                  if (json.status === 'OK') {
                    setPreferenceCenterStatus('✅ Configuration Completed Successfully!');
                    setTimeout(() => {
                      const el = document.getElementById('preferencecenter-success-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  } else {
                    setPreferenceCenterStatus('❌ Failed to submit configuration: ' + (json.message || 'Unknown error'));
                  }
                } catch (e) {
                  setPreferenceCenterStatus('❌ Failed to submit configuration: ' + e.message);
                } finally {
                  setQSLoading(false);
                }
              }}
            />
          </div>
        )}

        {/* Email Auditing content */}
        {parentNav === 'emailArchiving' && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold mb-4">Email Auditing</h2>
            {/* Search Fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block font-semibold mb-1">Job ID</label>
                <input type="text" className="border rounded px-4 py-2 w-full" placeholder="Enter Job ID" value={archiveSearch.jobId} onChange={e => setArchiveSearch(s => ({ ...s, jobId: e.target.value, emailName: '', subject: '' }))} />
              </div>
              <div>
                <label className="block font-semibold mb-1">Subject</label>
                <input type="text" className="border rounded px-4 py-2 w-full" placeholder="Enter Subject" value={archiveSearch.subject} onChange={e => setArchiveSearch(s => ({ ...s, subject: e.target.value, jobId: '', emailName: '' }))} />
              </div>
              <div>
                <label className="block font-semibold mb-1">Email Name</label>
                <input type="text" className="border rounded px-4 py-2 w-full" placeholder="Enter Email Name" value={archiveSearch.emailName} onChange={e => setArchiveSearch(s => ({ ...s, emailName: e.target.value, jobId: '', subject: '' }))} />
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={fetchEmailArchive}>Search</button>
            </div>
            {/* Results Table */}
            <div className="bg-white border rounded p-0 overflow-x-auto">
              {emailArchiveLoading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : emailArchiveError ? (
                <div className="p-8 text-center text-red-600">{emailArchiveError}</div>
              ) : (
                <>
                <table className="min-w-full text-sm" style={{ minWidth: '1800px' }}>
                  <thead>
                    <tr className="bg-gray-100">
                      {["SendDate","EmailName","Subject","ID","FromName","FromAddress","NumberSent","NumberTargeted","NumberDelivered","NumberErrored","NumberExcluded","SoftBounces","UniqueClicks","UniqueOpens","Unsubscribes","Duplicates","BccEmail","MID"].map(col => (
                        <th key={col} className="p-2 text-left cursor-pointer select-none hover:bg-indigo-100" onClick={() => setArchiveSort(s => ({ key: col, direction: s.key === col && s.direction === 'asc' ? 'desc' : 'asc' }))}>
                          {col === 'ID' ? 'JobID' : col === 'MID' ? 'MID' : col === 'FromName' ? 'From Name' : col === 'FromAddress' ? 'From Email' : col === 'NumberSent' ? '# of emails Sent' : col === 'SendDate' ? 'Send Date' : col}
                          {archiveSort.key === col && (archiveSort.direction === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedArchiveResults.length === 0 ? (
                      <tr><td colSpan={17} className="p-8 text-center text-gray-500">No results found.</td></tr>
                    ) : paginatedArchiveResults.map((row, idx) => (
                      <tr key={row.ID} className="border-t">
                        <td className="p-2">{row.SendDate || ''}</td>
                        <td className="p-2">{row.EmailName || ''}</td>
                        <td className="p-2">{row.Subject || ''}</td>
                        <td className="p-2">{row.ID || ''}</td>
                        <td className="p-2">{row.FromName || ''}</td>
                        <td className="p-2">{row.FromAddress || ''}</td>
                        <td className="p-2">{row.NumberSent ? (
                          <button
                            className="bg-yellow-400 text-black font-bold px-3 py-1 rounded shadow hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-600"
                            onClick={() => {
                              setSelectedSendId(row.ID);
                              setSentEventPage(1);
                              setSentEventSubscriberKey('');
                              setTimeout(() => {
                                const el = document.getElementById('sent-events-table');
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }, 100);
                            }}
                            title="Show sent events for this JobID"
                          >
                            {row.NumberSent}
                          </button>
                        ) : ''}</td>
                        <td className="p-2">{row.NumberTargeted || ''}</td>
                        <td className="p-2">{row.NumberDelivered || ''}</td>
                        <td className="p-2">{row.NumberErrored || ''}</td>
                        <td className="p-2">{row.NumberExcluded || ''}</td>
                        <td className="p-2">{row.SoftBounces || ''}</td>
                        <td className="p-2">{row.UniqueClicks || ''}</td>
                        <td className="p-2">{row.UniqueOpens || ''}</td>
                        <td className="p-2">{row.Unsubscribes || ''}</td>
                        <td className="p-2">{row.Duplicates || ''}</td>
                        <td className="p-2">{row.BccEmail || ''}</td>
                        <td className="p-2">{row.MID || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-4 text-sm">
                  <div>
                    Page {archivePage} of {totalArchivePages}
                  </div>
                  <div className="flex gap-2">
                    <button disabled={archivePage === 1} onClick={() => setArchivePage(p => p - 1)} className="px-2 py-1 border rounded">Prev</button>
                    <button disabled={archivePage === totalArchivePages || totalArchivePages <= 1} onClick={() => setArchivePage(p => p + 1)} className="px-2 py-1 border rounded">Next</button>
                  </div>
                </div>
                </>
              )}
            </div>
            {/* SentEvent Table */}
            {selectedSendId && (
              <div className="mt-8" id="sent-events-table">
                <h2 className="text-xl font-semibold mb-2">Sent Events for JobID: {selectedSendId}</h2>
                <div className="mb-4 flex items-center gap-2">
                  <label className="font-semibold">Subscriber Key:</label>
                  <input type="text" className="border rounded px-2 py-1" placeholder="Search Subscriber Key" value={sentEventSubscriberKey} onChange={e => { setSentEventSubscriberKey(e.target.value); setSentEventPage(1); }} />
                </div>
                {sentEventLoading ? (
                  <div className="p-4 text-center text-gray-500">Loading sent events...</div>
                ) : sentEventError ? (
                  <div className="p-4 text-center text-red-600">{sentEventError}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border">
                      <thead>
                        <tr className="bg-gray-100">
                          {["SubscriberKey","EventDate","SendID","ListID","TriggeredSendDefinitionObjectID"].map(col => (
                            <th key={col} className="p-2 text-left cursor-pointer select-none hover:bg-indigo-100" onClick={() => setSentEventSort(s => ({ key: col, direction: s.key === col && s.direction === 'asc' ? 'desc' : 'asc' }))}>
                              {col === 'SendID' ? 'JobID (SendID)' : col === 'EventDate' ? 'Send Date' : col === 'TriggeredSendDefinitionObjectID' ? 'TriggeredSendDefinitionObjectID' : col === 'SubscriberKey' ? 'SubscriberKey' : col === 'ListID' ? 'ListID' : col}
                              {sentEventSort.key === col && (sentEventSort.direction === 'asc' ? ' ▲' : ' ▼')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
  const filtered = sentEventResults.filter(row => !sentEventSubscriberKey || (row.SubscriberKey && row.SubscriberKey.toLowerCase().includes(sentEventSubscriberKey.toLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / sentEventRowsPerPage));
  const paginated = filtered.slice((sentEventPage - 1) * sentEventRowsPerPage, sentEventPage * sentEventRowsPerPage);
  return paginated.length === 0 ? (
    <tr><td colSpan={5} className="p-8 text-center text-gray-500">No results found.</td></tr>
  ) : paginated.map((row, idx) => (
    <tr key={idx} className="border-t">
      <td className="p-2">{row.SubscriberKey || ''}</td>
      <td className="p-2">{row.EventDate || ''}</td>
      <td className="p-2">{row.SendID || ''}</td>
      <td className="p-2">{row.ListID || ''}</td>
      <td className="p-2">{row.TriggeredSendDefinitionObjectID || ''}</td>
    </tr>
  ));
})()}
                      </tbody>
                    </table>
                    <div className="flex justify-between items-center mt-4 text-sm">
                      <div>
                        Page {sentEventPage} of {Math.max(1, Math.ceil(sentEventResults.filter(row => !sentEventSubscriberKey || (row.SubscriberKey && row.SubscriberKey.toLowerCase().includes(sentEventSubscriberKey.toLowerCase()))).length / sentEventRowsPerPage))}
                      </div>
                      <div className="flex gap-2">
                        <button disabled={sentEventPage <= 1} onClick={() => setSentEventPage(p => Math.max(1, p - 1))} className="px-2 py-1 border rounded">Prev</button>
                        <button disabled={sentEventPage >= Math.max(1, Math.ceil(sentEventResults.filter(row => !sentEventSubscriberKey || (row.SubscriberKey && row.SubscriberKey.toLowerCase().includes(sentEventSubscriberKey.toLowerCase()))).length / sentEventRowsPerPage))} onClick={() => setSentEventPage(p => Math.min(Math.max(1, Math.ceil(sentEventResults.filter(row => !sentEventSubscriberKey || (row.SubscriberKey && row.SubscriberKey.toLowerCase().includes(sentEventSubscriberKey.toLowerCase()))).length / sentEventRowsPerPage)), p + 1))} className="px-2 py-1 border rounded">Next</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Email Archiving content */}
        {parentNav === 'emailArchivingSetup' && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <EmailArchiving />
          </div>
        )}

        {/* Settings content */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <Settings />
          </div>
        )}

        {/* Settings parent navigation content */}
        {parentNav === 'settings' && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <Settings />
          </div>
        )}

        </main>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'Not Available') return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(',', '');
}

function CloudPageCodeSample() {
  const [codeSample, setCodeSample] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + '/MC_only_Preference_Code.html')
      .then(res => res.text())
      .then(setCodeSample);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSample);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([codeSample], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PreferenceCenterCloudPage.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-2">
      <div className="flex items-center mb-1">
        <span className="font-semibold mr-2">Show Code:</span>
        <Btn variant="primary" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Btn>
        <Btn variant="ghost" onClick={handleDownload}>Download as .html</Btn>
      </div>
      <textarea
        className="w-full font-mono text-xs p-2 border border-border rounded bg-panel"
        rows={16}
        value={codeSample}
        readOnly
      />
    </div>
  );
}
