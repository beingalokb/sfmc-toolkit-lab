import React, { useState, useEffect } from 'react';
import './App.css';
import DMWizard from './components/DMWizard';
import PreferenceCenterProjectForm from './PreferenceCenterProjectForm';
import PreferenceCenterNoCoreForm from './PreferenceCenterNoCoreForm';

const baseURL = process.env.REACT_APP_BASE_URL;

export default function MainApp() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('de');
  const [parentNav, setParentNav] = useState('main');
  const [dmStep, setDMStep] = useState(1);
  const [deCreated, setDECreated] = useState(false);
  const [eventCreated, setEventCreated] = useState(false);

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
          <h2 className="text-xl font-semibold text-indigo-700 mb-4">Distributed Marketing Journey Setup</h2>
          <div className="mb-6">
            <ol className="list-decimal pl-6 space-y-2">
              <li className={dmStep >= 1 ? 'text-indigo-600 font-semibold' : 'text-gray-500'}>
                Step 1: Create Data Extension
                <button
                  className="ml-4 px-4 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                  onClick={async () => {
                    const res = await fetch(`${baseURL}/createDE`);
                    const json = await res.json();
                    if (json.status === 'OK') {
                      setDECreated(true);
                      setDMStep(2);
                    }
                  }}
                  disabled={deCreated}
                >
                  {deCreated ? "✓ Created" : "Create DE"}
                </button>
              </li>
              <li className={dmStep >= 2 ? 'text-indigo-600 font-semibold' : 'text-gray-500'}>
                Step 2: Create Event Definition
                <button
                  className="ml-4 px-4 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                  onClick={async () => {
                    const res = await fetch(`${baseURL}/createEvent`);
                    const json = await res.json();
                    if (json.status === 'OK') {
                      setEventCreated(true);
                      setDMStep(3);
                    }
                  }}
                  disabled={!deCreated || eventCreated}
                >
                  {eventCreated ? "✓ Created" : "Create Event"}
                </button>
              </li>
              <li className={dmStep >= 3 ? 'text-indigo-600 font-semibold' : 'text-gray-500'}>
                Step 3: Create Journey
                <button
                  className="ml-4 px-4 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                  onClick={async () => {
                    const res = await fetch(`${baseURL}/createJourney`);
                    const json = await res.json();
                    if (json.status === 'OK') {
                      alert("Journey created successfully!");
                    }
                  }}
                  disabled={!eventCreated}
                >
                  Create Journey
                </button>
              </li>
            </ol>
          </div>
        </div>
      );
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
