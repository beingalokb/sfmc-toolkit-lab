import React, { useState } from 'react';

const defaultCategory = { label: '', description: '', apiName: '', publicationListId: '' };

export default function PreferenceCenterConfigForm({ onSubmit }) {
  const [branding, setBranding] = useState({
    header: '',
    subHeader: '',
    footer: '',
    logoUrl: ''
  });
  const [optOutLabel, setOptOutLabel] = useState('');
  const [integrationType, setIntegrationType] = useState('None');
  const [categories, setCategories] = useState([ { ...defaultCategory } ]);

  const handleCategoryChange = (idx, field, value) => {
    setCategories(categories => {
      const updated = [...categories];
      updated[idx][field] = value;
      return updated;
    });
  };

  const addCategory = () => setCategories([...categories, { ...defaultCategory }]);
  const removeCategory = idx => setCategories(categories.filter((_, i) => i !== idx));

  const handleSubmit = e => {
    e.preventDefault();
    onSubmit && onSubmit({ branding, optOutLabel, integrationType, categories });
  };

  return (
    <form className="space-y-6 max-w-2xl mx-auto bg-white p-6 rounded shadow" onSubmit={handleSubmit}>
      <h2 className="text-2xl font-bold text-indigo-700 mb-4">Preference Center Configuration</h2>
      <div>
        <label className="block font-semibold mb-1">Header</label>
        <input className="w-full border rounded p-2" value={branding.header} onChange={e => setBranding(b => ({ ...b, header: e.target.value }))} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Sub-header</label>
        <input className="w-full border rounded p-2" value={branding.subHeader} onChange={e => setBranding(b => ({ ...b, subHeader: e.target.value }))} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Footer</label>
        <input className="w-full border rounded p-2" value={branding.footer} onChange={e => setBranding(b => ({ ...b, footer: e.target.value }))} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Logo URL</label>
        <input className="w-full border rounded p-2" value={branding.logoUrl} onChange={e => setBranding(b => ({ ...b, logoUrl: e.target.value }))} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Opt-out Label</label>
        <input className="w-full border rounded p-2" value={optOutLabel} onChange={e => setOptOutLabel(e.target.value)} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Integration Type</label>
        <select className="w-full border rounded p-2" value={integrationType} onChange={e => setIntegrationType(e.target.value)}>
          <option value="None">None</option>
          <option value="Contact">Contact</option>
          <option value="Lead">Lead</option>
          <option value="Contact & Lead">Contact & Lead</option>
          <option value="CommSubscriber">CommSubscriber</option>
        </select>
      </div>
      <div>
        <label className="block font-semibold mb-2">Custom Category Fields</label>
        {categories.map((cat, idx) => (
          <div key={idx} className="border rounded p-3 mb-2 bg-gray-50">
            <div className="flex gap-2 mb-2">
              <input className="flex-1 border rounded p-2" placeholder="Label" value={cat.label} onChange={e => handleCategoryChange(idx, 'label', e.target.value)} />
              <input className="flex-1 border rounded p-2" placeholder="Description" value={cat.description} onChange={e => handleCategoryChange(idx, 'description', e.target.value)} />
            </div>
            <div className="flex gap-2 mb-2">
              <input className="flex-1 border rounded p-2" placeholder="API Name" value={cat.apiName} onChange={e => handleCategoryChange(idx, 'apiName', e.target.value)} />
              <input className="flex-1 border rounded p-2" placeholder="Publication List ID" value={cat.publicationListId} onChange={e => handleCategoryChange(idx, 'publicationListId', e.target.value)} />
            </div>
            <button type="button" className="text-red-600 text-xs underline" onClick={() => removeCategory(idx)} disabled={categories.length === 1}>Remove</button>
          </div>
        ))}
        <button type="button" className="text-indigo-700 text-sm underline mt-2" onClick={addCategory}>+ Add Category</button>
      </div>
      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded font-semibold">Submit Configuration</button>
    </form>
  );
}
