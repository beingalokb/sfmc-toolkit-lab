import React, { useState } from 'react';
import '../styles/DMWizard.css';

const steps = [
  'Create Data Extension',
  'Create Event Definition',
  'Create Journey'
];

export default function DMWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatus, setStepStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({
    deId: null,
    eventId: null,
    journeyId: null
  });

  const handleNext = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/create/dm-dataextension', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.status === 'ERROR') {
        throw new Error(data.message);
      }

      setResults(prev => ({
        ...prev,
        deId: data.deName,
        eventId: data.eventDefinitionId,
        journeyId: data.journeyId
      }));

      setStepStatus(prev => ({
        ...prev,
        [currentStep]: 'complete'
      }));

      setCurrentStep(prevStep => prevStep + 1);
    } catch (err) {
      setError(err.message || 'An error occurred');
      setStepStatus(prev => ({
        ...prev,
        [currentStep]: 'error'
      }));
    } finally {
      setLoading(false);
    }
  };

  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return 'Create a Data Extension to store the event data';
      case 1:
        return 'Create an Event Definition that will trigger the journey';
      case 2:
        return 'Create a Journey that uses the Event Definition';
      default:
        return 'Process completed';
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg p-6">
      {/* Progress Steps */}
      <div className="flex justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center">
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${index < currentStep ? 'bg-green-500 text-white' : 
                index === currentStep ? 'bg-blue-600 text-white' : 
                'bg-gray-200 text-gray-600'}
            `}>
              {index < currentStep ? '✓' : index + 1}
            </div>
            <div className="ml-2">
              <p className={`text-sm font-medium ${index <= currentStep ? 'text-gray-900' : 'text-gray-500'}`}>
                {step}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-12 h-1 mx-2 ${index < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="mt-6">
        {Object.keys(stepStatus).length === steps.length ? (
          <div className="bg-green-50 border-l-4 border-green-500 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-green-800">Success!</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Data Extension: {results.deId}</p>
                  <p>Event Definition: {results.eventId}</p>
                  <p>Journey: {results.journeyId}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-lg text-gray-800 mb-4">{getStepContent(currentStep)}</p>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-6">
              <button
                onClick={handleNext}
                disabled={loading}
                className={`
                  inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm
                  ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                  text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                `}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
