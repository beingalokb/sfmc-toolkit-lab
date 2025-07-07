import React, { useState, useEffect } from 'react';

const defaultCategory = { label: '', description: '', apiName: '', apiNameContact: '', apiNameLead: '', publicationName: '', publicationNameEdited: false };

export default function PreferenceCenterConfigForm({ onSubmit }) {
  const [branding, setBranding] = useState({
    header: '',
    subHeader: '',
    footer: '',
    logoUrl: ''
  });
  const [optOutLabel, setOptOutLabel] = useState('');
  const [integrationType, setIntegrationType] = useState('None');
  const [categories, setCategories] = useState([{ ...defaultCategory }]);
  const [errors, setErrors] = useState({});
  const [showOptOutNote, setShowOptOutNote] = useState(false);

  // Validation
  const validate = () => {
    const errs = {};
    if (!branding.header) errs.header = 'Header is required';
    if (!branding.footer) errs.footer = 'Footer is required';
    if (!optOutLabel) errs.optOutLabel = 'Opt-out label is required';
    categories.forEach((cat, idx) => {
      if (integrationType === 'Contact' && !cat.apiNameContact) errs[`apiNameContact_${idx}`] = 'Contact API Name is required';
      else if (integrationType === 'Lead' && !cat.apiNameLead) errs[`apiNameLead_${idx}`] = 'Lead API Name is required';
      else if (integrationType === 'Contact & Lead') {
        if (!cat.apiNameContact) errs[`apiNameContact_${idx}`] = 'Contact API Name is required';
        if (!cat.apiNameLead) errs[`apiNameLead_${idx}`] = 'Lead API Name is required';
      } else if (integrationType !== 'None' && !cat.apiName) errs[`apiName_${idx}`] = 'API Name is required';
    });
    return errs;
  };

  // Handle Opt-out note
  useEffect(() => {
    setShowOptOutNote(!!optOutLabel && integrationType !== 'None');
  }, [optOutLabel, integrationType]);

  const handleCategoryChange = (idx, field, value) => {
    setCategories(categories => {
      const updated = [...categories];
      if (field === 'label') {
        updated[idx].label = value;
        // Only auto-populate publicationName if user hasn't edited it
        if (!updated[idx].publicationNameEdited) {
          updated[idx].publicationName = value;
        }
      } else if (field === 'publicationName') {
        updated[idx].publicationName = value;
        updated[idx].publicationNameEdited = true;
      } else {
        updated[idx][field] = value;
      }
      return updated;
    });
  };

  const addCategory = () => setCategories([...categories, { ...defaultCategory }]);
  const removeCategory = idx => setCategories(categories => {
    const updated = categories.filter((_, i) => i !== idx);
    return updated.length ? updated : [{ ...defaultCategory }];
  });

  const handleSubmit = e => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit && onSubmit({ branding, optOutLabel, integrationType, categories });
  };

  return (
    <form className="space-y-6 max-w-2xl mx-auto bg-white p-6 rounded shadow" onSubmit={handleSubmit}>
      <h2 className="text-2xl font-bold text-indigo-700 mb-4">Preference Center Configuration</h2>
      <div>
        <label className="block font-semibold mb-1">Header <span className="text-red-600">*</span></label>
        <input className="w-full border rounded p-2" value={branding.header} onChange={e => setBranding(b => ({ ...b, header: e.target.value }))} />
        {errors.header && <div className="text-red-600 text-xs mt-1">{errors.header}</div>}
      </div>
      <div>
        <label className="block font-semibold mb-1">Sub-header</label>
        <input className="w-full border rounded p-2" value={branding.subHeader} onChange={e => setBranding(b => ({ ...b, subHeader: e.target.value }))} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Footer <span className="text-red-600">*</span></label>
        <input className="w-full border rounded p-2" value={branding.footer} onChange={e => setBranding(b => ({ ...b, footer: e.target.value }))} />
        {errors.footer && <div className="text-red-600 text-xs mt-1">{errors.footer}</div>}
      </div>
      <div>
        <label className="block font-semibold mb-1">Logo URL</label>
        <input className="w-full border rounded p-2" value={branding.logoUrl} onChange={e => setBranding(b => ({ ...b, logoUrl: e.target.value }))} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Opt-out of all marketing emails Label <span className='text-red-600'>*</span></label>
        <input className="w-full border rounded p-2" value={optOutLabel} onChange={e => setOptOutLabel(e.target.value)} />
        {errors.optOutLabel && <div className="text-red-600 text-xs mt-1">{errors.optOutLabel}</div>}
        {showOptOutNote && (
          <div className="text-yellow-700 text-xs mt-1">Note: <b>hasOptOutOfEmail</b> will be tagged to the user action for Opt-out.</div>
        )}
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
              {integrationType === 'Contact & Lead' ? (
                <>
                  <input className="flex-1 border rounded p-2" placeholder="Contact API Name" value={cat.apiNameContact} onChange={e => handleCategoryChange(idx, 'apiNameContact', e.target.value)} />
                  <input className="flex-1 border rounded p-2" placeholder="Lead API Name" value={cat.apiNameLead} onChange={e => handleCategoryChange(idx, 'apiNameLead', e.target.value)} />
                  <input className="flex-1 border rounded p-2" placeholder="Publication Name" value={cat.publicationName} onChange={e => handleCategoryChange(idx, 'publicationName', e.target.value)} />
                </>
              ) : (
                <>
                  {integrationType === 'Contact' && (
                    <input className="flex-1 border rounded p-2" placeholder="Contact API Name" value={cat.apiNameContact} onChange={e => handleCategoryChange(idx, 'apiNameContact', e.target.value)} />
                  )}
                  {integrationType === 'Lead' && (
                    <input className="flex-1 border rounded p-2" placeholder="Lead API Name" value={cat.apiNameLead} onChange={e => handleCategoryChange(idx, 'apiNameLead', e.target.value)} />
                  )}
                  {integrationType !== 'None' && integrationType !== 'Contact' && integrationType !== 'Lead' && integrationType !== 'Contact & Lead' && (
                    <input className="flex-1 border rounded p-2" placeholder="API Name" value={cat.apiName} onChange={e => handleCategoryChange(idx, 'apiName', e.target.value)} />
                  )}
                  <input className="flex-1 border rounded p-2" placeholder="Publication Name" value={cat.publicationName} onChange={e => handleCategoryChange(idx, 'publicationName', e.target.value)} />
                </>
              )}
              {/* Error messages */}
              {integrationType === 'Contact' && errors[`apiNameContact_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameContact_${idx}`]}</div>}
              {integrationType === 'Lead' && errors[`apiNameLead_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameLead_${idx}`]}</div>}
              {integrationType === 'Contact & Lead' && (
                <>
                  {errors[`apiNameContact_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameContact_${idx}`]}</div>}
                  {errors[`apiNameLead_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameLead_${idx}`]}</div>}
                </>
              )}
              {integrationType !== 'None' && integrationType !== 'Contact' && integrationType !== 'Lead' && integrationType !== 'Contact & Lead' && errors[`apiName_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiName_${idx}`]}</div>}
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
