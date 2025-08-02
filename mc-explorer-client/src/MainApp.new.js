import React, { useState, useEffect } from 'react';
import './App.css';
import DMWizard from './components/DMWizard';
import PreferenceCenterProjectForm from './PreferenceCenterProjectForm';
import PreferenceCenterNoCoreForm from './PreferenceCenterNoCoreForm';
import EmailArchiving from './EmailArchiving';

const baseURL = process.env.REACT_APP_BASE_URL;

export default function MainApp() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [parentNav, setParentNav] = useState('main');
  const [dmStep, setDMStep] = useState(1);
  const [deCreated, setDECreated] = useState(false);
  const [eventCreated, setEventCreated] = useState(false);
  const [qsStatus, setQSStatus] = useState("");
  const [qsDetails, setQSDetails] = useState(null);
  const [qsLoading, setQSLoading] = useState(false);

  const renderNavigation = () => {
    return (
      <div className="flex space-x-4 mb-6">
        <button
          className={`px-4 py-2 rounded-lg ${activeTab === 'search' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setActiveTab('search')}
        >
          Search Assets
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
          className={`px-4 py-2 rounded-lg ${activeTab === 'emailauditing' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setActiveTab('emailauditing')}
        >
          Email Auditing
        </button>
        <button
          className={`px-4 py-2 rounded-lg ${activeTab === 'emailarchiving' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setActiveTab('emailarchiving')}
        >
          Email Archiving
        </button>
      </div>
    );
  };

  const renderStepIndicator = () => {
    if (activeTab !== 'dm') return null;

    const steps = [
      'Step 1: Create Data Extension',
      'Step 2: Create Event',
      'Step 3: Create Journey'
    ];

    return (
      <div className="flex justify-center mb-4">
        {steps.map((step, index) => (
          <div key={index} className={`px-4 py-2 mx-2 rounded-lg border ${dmStep === index + 1 ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border-gray-300'}`}>
            {step}
          </div>
        ))}
      </div>
    );
  };

  const renderMainContent = () => {
    if (activeTab === 'dm') {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
            🚀 Single Click Distributed Marketing Quick Send Journey Setup
          </h2>

          <button
            className={`px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 ${qsLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={async () => {
              setQSLoading(true);
              setQSStatus("Creating Quick Send Data Extension...");
              setQSDetails(null);
              try {
                const res = await fetch(`${baseURL}/createDMFullSetup`);
                const json = await res.json();
                if (json.status === "OK") {
                  setQSStatus("✅ All set!");
                  setQSDetails({
                    deName: json.deName,
                    dePath: `/Data Extensions / MC-Explorer-DM-${json.folderId}`,
                    eventName: json.eventName || json.eventDefinitionKey,
                    journeyName: json.journeyName,
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
          >
            {qsLoading ? "Working..." : "✨ Create DM QS"}
          </button>

          <div className="mt-6 text-gray-700 space-y-2">
            {qsStatus && <p className="text-lg font-medium">{qsStatus}</p>}
            {qsDetails && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p>🔹 <strong>QS DE name:</strong> {qsDetails.deName}</p>
                <p>🔹 <strong>QS DE path:</strong> {qsDetails.dePath}</p>
                <p>🔹 <strong>QS Event name:</strong> {qsDetails.eventName}</p>
                <p>🔹 <strong>QS Journey name:</strong> {qsDetails.journeyName}</p>
              </div>
            )}
          </div>
        </div>
      );
    }
    
    if (activeTab === 'search') {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
            Search Assets (Data Extensions)
          </h2>
          <p className="text-gray-700">Search and manage your Marketing Cloud assets here.</p>
        </div>
      );
    }
    
    if (activeTab === 'preferencecenter') {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
            Preference Center
          </h2>
          <p className="text-gray-700">Manage preference center configurations.</p>
        </div>
      );
    }
    
    if (activeTab === 'emailauditing') {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
            Email Auditing
          </h2>
          <p className="text-gray-700">Audit and review email campaigns.</p>
        </div>
      );
    }
    
    if (activeTab === 'emailarchiving') {
      return <EmailArchiving />;
    }
    
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold text-indigo-700 mb-6">
          Welcome to MC Explorer
        </h2>
        <p className="text-gray-700">Select a tab above to get started.</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div>Loading...</div>
        ) : !isAuthenticated ? (
          <div>Please authenticate...</div>
        ) : (
          <>
            {parentNav === 'main' ? (
              <>
                {renderNavigation()}
                {renderStepIndicator()}
                {renderMainContent()}
              </>
            ) : parentNav === 'guided' ? (
              <div>Guided content...</div>
            ) : parentNav === 'preference' ? (
              <div>Preference content...</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
