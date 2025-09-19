import React, { useEffect, useState } from 'react';

export default function EmailsSendToSubscribers() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('jobId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/email-archive/sent-events?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch (e) {
        setError('Failed to fetch sent events.');
      } finally {
        setLoading(false);
      }
    }
    if (jobId) fetchData();
  }, [jobId]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="bg-white rounded-xl shadow-lg p-6 mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold mb-4">Emails Send to Subscribers</h1>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">SubscriberKey</th>
                <th className="p-2 text-left">Send Date</th>
                <th className="p-2 text-left">JobID (SendID)</th>
                <th className="p-2 text-left">ListID</th>
                <th className="p-2 text-left">TriggeredSendDefinitionObjectID</th>
                <th className="p-2 text-left">Preview</th>
                <th className="p-2 text-left">Download</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No results found.</td></tr>
              ) : results.map((row, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{row.SubscriberKey || ''}</td>
                  <td className="p-2">{row.EventDate || ''}</td>
                  <td className="p-2">{row.SendID || ''}</td>
                  <td className="p-2">{row.ListID || ''}</td>
                  <td className="p-2">{row.TriggeredSendDefinitionObjectID || ''}</td>
                  <td className="p-2"><button className="text-indigo-600 hover:underline">👁️ View</button></td>
                  <td className="p-2"><button className="text-green-600 hover:underline">⬇️ Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
