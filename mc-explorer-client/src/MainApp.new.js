import React, { useState, useEffect } from 'react';
import './App.css';
import DMWizard from './components/DMWizard';
import PreferenceCenterProjectForm from './PreferenceCenterProjectForm';
import PreferenceCenterNoCoreForm from './PreferenceCenterNoCoreForm';
import EmailArchiving from './EmailArchiving';
import OnDemandEmailArchive from './OnDemandEmailArchive';

const baseURL = process.env.REACT_APP_BASE_URL;

export default function MainApp() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('de');
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
          className={`px-4 py-2 rounded-lg ${activeTab === 'emailarchiving' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setActiveTab('emailarchiving')}
        >
          Email Archiving
        </button>
        <button
          className={`px-4 py-2 rounded-lg ${activeTab === 'ondemandarchive' ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setActiveTab('ondemandarchive')}
        >
          On Demand Email Archive
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
    
    if (activeTab === 'emailarchiving') {
      return <EmailArchiving />;
    }
    
    if (activeTab === 'ondemandarchive') {
      return <OnDemandEmailArchive />;
    }
    
    return (
      <div className="bg-white rounded-lg shadow">
        {/* Existing content rendering logic */}
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
