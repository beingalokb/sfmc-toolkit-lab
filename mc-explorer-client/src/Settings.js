import React, { useState, useEffect } from 'react';

const baseURL = process.env.REACT_APP_BASE_URL;

function Settings() {
  // SFTP Configuration state
  const [sftpConfig, setSftpConfig] = useState({
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    directory: '/Export'
  });
  
  const [sftpLoading, setSftpLoading] = useState(false);
  const [sftpStatus, setSftpStatus] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load existing SFTP configuration on component mount
  useEffect(() => {
    loadSftpConfig();
  }, []);

  const loadSftpConfig = async () => {
    console.log('🔄 [Frontend Settings] Loading SFTP configuration...');
    try {
      const response = await fetch(`${baseURL}/api/settings/sftp`);
      console.log('📡 [Frontend Settings] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📋 [Frontend Settings] Received SFTP config:', { 
          ...data, 
          password: data.password ? '[HIDDEN]' : '[EMPTY]', 
          privateKey: data.privateKey ? '[HIDDEN]' : '[EMPTY]' 
        });
        
        setSftpConfig({
          ...data,
          password: '', // Don't show saved password for security
          privateKey: '', // Don't show saved private key for security
          passphrase: '' // Don't show saved passphrase for security
        });
        
        console.log('✅ [Frontend Settings] SFTP config applied to state');
      } else {
        console.error('❌ [Frontend Settings] Failed to load SFTP config:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ [Frontend Settings] Error loading SFTP config:', error);
    } finally {
      setConfigLoaded(true);
      console.log('🏁 [Frontend Settings] Config loading completed');
    }
  };

  const handleSftpConfigChange = (field, value) => {
    setSftpConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveSftpConfig = async () => {
    setSftpLoading(true);
    setSftpStatus('');
    
    try {
      const response = await fetch(`${baseURL}/api/settings/sftp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sftpConfig)
      });

      const data = await response.json();
      
      if (response.ok) {
        setSftpStatus('✅ SFTP configuration saved successfully!');
        // Clear sensitive fields after successful save
        setSftpConfig(prev => ({ 
          ...prev, 
          password: '',
          privateKey: '',
          passphrase: ''
        }));
      } else {
        setSftpStatus(`❌ Failed to save: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSftpStatus('❌ Error saving SFTP configuration');
      console.error('Error saving SFTP config:', error);
    } finally {
      setSftpLoading(false);
    }
  };

  const testSftpConnection = async () => {
    setTestingConnection(true);
    setSftpStatus('');
    
    try {
      // Validate required fields
      if (!sftpConfig.host || !sftpConfig.username || !sftpConfig.authType) {
        setSftpStatus('❌ Host, username, and authentication type are required for testing');
        setTestingConnection(false);
        return;
      }

      if (sftpConfig.authType === 'password' && !sftpConfig.password) {
        setSftpStatus('❌ Password is required for password authentication');
        setTestingConnection(false);
        return;
      }

      if (sftpConfig.authType === 'key' && !sftpConfig.privateKey) {
        setSftpStatus('❌ Private key is required for key authentication');
        setTestingConnection(false);
        return;
      }
      
      const response = await fetch(`${baseURL}/api/settings/sftp/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sftpConfig)
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setSftpStatus('✅ SFTP connection test successful!');
      } else {
        setSftpStatus(`❌ Connection failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSftpStatus('❌ Error testing SFTP connection');
      console.error('Error testing SFTP connection:', error);
    } finally {
      setTestingConnection(false);
    }
  };

  if (!configLoaded) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
        ⚙️ Settings
      </h2>

      {/* SFTP Configuration Section */}
      <div className="mb-8">
        <h3 className="text-xl font-medium text-gray-900 mb-4">
          🌐 SFTP Configuration
        </h3>
        
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800 text-sm">
            💡 Configure SFTP settings to export archived email data to your server. 
            These settings will be used across all export features.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SFTP Host/Server *
            </label>
            <input
              type="text"
              value={sftpConfig.host}
              onChange={(e) => handleSftpConfigChange('host', e.target.value)}
              placeholder="sftp.yourcompany.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Port
            </label>
            <input
              type="number"
              value={sftpConfig.port}
              onChange={(e) => handleSftpConfigChange('port', parseInt(e.target.value) || 22)}
              placeholder="22"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username *
            </label>
            <input
              type="text"
              value={sftpConfig.username}
              onChange={(e) => handleSftpConfigChange('username', e.target.value)}
              placeholder="your-username"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Authentication Type *
            </label>
            <select
              value={sftpConfig.authType}
              onChange={(e) => handleSftpConfigChange('authType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="password">Password</option>
              <option value="key">SSH Key</option>
            </select>
          </div>
          
          {sftpConfig.authType === 'password' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                value={sftpConfig.password}
                onChange={(e) => handleSftpConfigChange('password', e.target.value)}
                placeholder={sftpConfig.host ? "Enter password to update" : "your-password"}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {sftpConfig.authType === 'key' && (
            <>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Private Key * <span className="text-xs text-gray-500">(PEM format)</span>
                </label>
                <textarea
                  value={sftpConfig.privateKey}
                  onChange={(e) => handleSftpConfigChange('privateKey', e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...private key content...&#10;-----END OPENSSH PRIVATE KEY-----"
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Paste your SSH private key here. Supports RSA, ECDSA, and ED25519 keys.
                </p>
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Passphrase <span className="text-xs text-gray-500">(if key is encrypted)</span>
                </label>
                <input
                  type="password"
                  value={sftpConfig.passphrase}
                  onChange={(e) => handleSftpConfigChange('passphrase', e.target.value)}
                  placeholder="Enter passphrase if your key is encrypted"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Directory Path
            </label>
            <input
              type="text"
              value={sftpConfig.directory}
              onChange={(e) => handleSftpConfigChange('directory', e.target.value)}
              placeholder="/Export"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Directory where exported files will be stored (will be created if it doesn't exist)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={testSftpConnection}
            disabled={testingConnection || !sftpConfig.host || !sftpConfig.username || 
                     (sftpConfig.authType === 'password' && !sftpConfig.password) ||
                     (sftpConfig.authType === 'key' && !sftpConfig.privateKey)}
            className={`px-4 py-2 rounded-lg border ${
              testingConnection || !sftpConfig.host || !sftpConfig.username ||
              (sftpConfig.authType === 'password' && !sftpConfig.password) ||
              (sftpConfig.authType === 'key' && !sftpConfig.privateKey)
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
            }`}
          >
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
          
          <button
            onClick={saveSftpConfig}
            disabled={sftpLoading || !sftpConfig.host || !sftpConfig.username}
            className={`px-6 py-2 rounded-lg ${
              sftpLoading || !sftpConfig.host || !sftpConfig.username
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {sftpLoading ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        {sftpStatus && (
          <div className={`p-3 rounded-lg ${
            sftpStatus.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {sftpStatus}
          </div>
        )}
      </div>

      {/* Future Settings Sections */}
      <div className="border-t pt-6">
        <h3 className="text-xl font-medium text-gray-900 mb-4">
          🔧 Additional Settings
        </h3>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-600 text-sm">
            Additional configuration options will be available here in future updates.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Settings;
