import React, { useState, useEffect } from 'react';
import './App.css';
import PreferenceCenterProjectForm from './PreferenceCenterProjectForm';
import PreferenceCenterNoCoreForm from './PreferenceCenterNoCoreForm';
import DMWizard from './components/DMWizard';

const baseURL = process.env.REACT_APP_BASE_URL;

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
  const [editESDModal, setEditESDModal] = useState({ open: false, loading: false, error: null, esd: null, sendClassification: '', senderProfile: '', deliveryProfile: '' });

  // State for mass selection
  const [selectedESDKeys, setSelectedESDKeys] = useState([]);
  const allSelected = resolvedEmailSendDefs.length > 0 && selectedESDKeys.length === resolvedEmailSendDefs.length;

  // State for mass edit modal
  const [massEditModal, setMassEditModal] = useState({ open: false, sendClassification: '', senderProfile: '', deliveryProfile: '', loading: false, error: null });

  // Publications state
  const [publications, setPublications] = useState([]);

  // Add new top-level tab for Distributed Marketing
  const [dmStep, setDMStep] = useState(1);
  const [dmDEPath, setDMDEPath] = useState('');
  const [dmJourneyPath, setDMJourneyPath] = useState('');
  const [dmStatus, setDMStatus] = useState('');

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
    setEditESDModal({
      open: true,
      loading: false,
      error: null,
      esd,
      sendClassification: esd.SendClassification.CustomerKey,
      senderProfile: esd.SenderProfile.CustomerKey,
      deliveryProfile: esd.DeliveryProfile.CustomerKey
    });
  }

  // Handler to close edit modal
  function closeEditESDModal() {
    setEditESDModal({ open: false, loading: false, error: null, esd: null, sendClassification: '', senderProfile: '', deliveryProfile: '' });
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
      // Always use CustomerKey for these fields
      const sendClassificationKey = getCustomerKey(sendClassifications, editESDModal.sendClassification);
      const senderProfileKey = getCustomerKey(senderProfiles, editESDModal.senderProfile);
      const deliveryProfileKey = getCustomerKey(deliveryProfiles, editESDModal.deliveryProfile);
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
          DeliveryProfile: deliveryProfileKey
        })
      });
      const data = await res.json();
      if (data.status === 'OK') {
        setEditESDModal(prev => ({ ...prev, loading: false, open: false }));
        // Show success toast/snackbar
        alert('✅ Updated successfully');
        // Refresh table with resolved relationships
        await refreshResolvedEmailSendDefs();
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
      const res = await fetch(`${baseURL}/resolved/emailsenddefinition-relationships`, {
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
  // (already declared at the top)

  // Handlers for select all and individual selection
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
      // Always use CustomerKey for these fields
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
          DeliveryProfile: deliveryProfileKey
        })
      });
      const data = await res.json();
      if (data.status === 'OK') {
        setMassEditModal({ open: false, sendClassification: '', senderProfile: '', deliveryProfile: '', loading: false, error: null });
        setSelectedESDKeys([]);
        alert('✅ Bulk update successful');
        await refreshResolvedEmailSendDefs();
      } else {
        setMassEditModal(prev => ({ ...prev, loading: false, error: data.message || 'Update failed' }));
        alert('❌ Bulk update failed: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      setMassEditModal(prev => ({ ...prev, loading: false, error: err.message }));
      alert('❌ Bulk update failed: ' + err.message);
    }
  }

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

  // Minimal tab content rendering
  function renderTabContent() {
    if (activeTab === 'dm') {
      return <DMWizard />;
    }
    // Add other tab content here as needed
    return <div>Welcome to MC Explorer!</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex space-x-4 mb-4">
          <button
            className={`px-4 py-2 rounded ${activeTab === 'de' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setActiveTab('de')}
          >
            Data Extensions
          </button>
          <button
            className={`px-4 py-2 rounded ${activeTab === 'dm' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setActiveTab('dm')}
          >
            Distributed Marketing
          </button>
          {/* Add other tab buttons here */}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          {renderTabContent()}
        </div>
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
