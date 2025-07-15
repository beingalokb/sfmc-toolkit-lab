import React, { useEffect, useState } from 'react';
import { INTEGRATION_TYPES } from './integrationTypes';

const defaultCategory = {
  label: '',
  description: '',
  publication: { name: '', customized: false },
  fieldMapping: { contact: '', lead: '' },
  publicationNameEdited: false
};

export default function PreferenceCenterConfigForm({ onSubmit, submitting }) {
  const [branding, setBranding] = useState({
    header: '',
    subHeader: '',
    footer: '',
    logoUrl: ''
  });
  const [optOutLabel, setOptOutLabel] = useState('');
  const [integrationType, setIntegrationType] = useState(INTEGRATION_TYPES.NONE);
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
      if (integrationType === INTEGRATION_TYPES.CONTACT && !cat.fieldMapping.contact) errs[`apiNameContact_${idx}`] = 'Contact API Name is required';
      else if (integrationType === INTEGRATION_TYPES.LEAD && !cat.fieldMapping.lead) errs[`apiNameLead_${idx}`] = 'Lead API Name is required';
      else if (integrationType === INTEGRATION_TYPES.CONTACT_LEAD) {
        if (!cat.fieldMapping.contact) errs[`apiNameContact_${idx}`] = 'Contact API Name is required';
        if (!cat.fieldMapping.lead) errs[`apiNameLead_${idx}`] = 'Lead API Name is required';
      } else if (integrationType !== INTEGRATION_TYPES.NONE && integrationType !== INTEGRATION_TYPES.CONTACT && integrationType !== INTEGRATION_TYPES.LEAD && integrationType !== INTEGRATION_TYPES.CONTACT_LEAD && !cat.fieldMapping.contact) errs[`apiName_${idx}`] = 'API Name is required';
    });
    return errs;
  };

  // Handle Opt-out note
  useEffect(() => {
    setShowOptOutNote(!!optOutLabel && integrationType !== INTEGRATION_TYPES.NONE);
  }, [optOutLabel, integrationType]);

  // Debug: log categories state on every change
  useEffect(() => {
    console.log('Current categories state:', categories);
  }, [categories]);

  const handleCategoryChange = (idx, field, value) => {
    setCategories(categories => {
      const updated = [...categories];
      if (field === 'label') {
        updated[idx].label = value;
        if (!updated[idx].publicationNameEdited) {
          updated[idx].publication.name = value;
        }
      } else if (field === 'publicationName') {
        updated[idx].publication.name = value;
        updated[idx].publicationNameEdited = true;
      } else if (field === 'description') {
        updated[idx].description = value;
      } else if (field === 'apiNameContact') {
        updated[idx].fieldMapping.contact = value;
      } else if (field === 'apiNameLead') {
        updated[idx].fieldMapping.lead = value;
      }
      return updated;
    });
  };

  const addCategory = () => setCategories([...categories, {
    label: '',
    description: '',
    publication: { name: '', customized: false },
    fieldMapping: { contact: '', lead: '' },
    publicationNameEdited: false
  }]);
  const removeCategory = idx => setCategories(categories => {
    const updated = categories.filter((_, i) => i !== idx);
    return updated.length ? updated : [{ ...defaultCategory }];
  });

  const handleSubmit = e => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // Debug: log categories structure before submit
    console.log('Submitting Preference Center config:', { branding, optOutLabel, integrationType, categories });
    // Remove publicationNameEdited before submit
    const cleanCategories = categories.map(({ publicationNameEdited, ...cat }) => cat);
    onSubmit && onSubmit({ branding, optOutLabel, integrationType, categories: cleanCategories });
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
          <option value={INTEGRATION_TYPES.NONE}>MC Only</option>
          <option value={INTEGRATION_TYPES.CONTACT}>Contact</option>
          <option value={INTEGRATION_TYPES.LEAD}>Lead</option>
          <option value={INTEGRATION_TYPES.CONTACT_LEAD}>Contact & Lead</option>
          <option value={INTEGRATION_TYPES.COMM_SUBSCRIBER}>CommSubscriber</option>
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
              {integrationType === INTEGRATION_TYPES.CONTACT_LEAD ? (
                <>
                  <input className="flex-1 border rounded p-2" placeholder="Contact API Name" value={cat.fieldMapping.contact} onChange={e => handleCategoryChange(idx, 'apiNameContact', e.target.value)} />
                  <input className="flex-1 border rounded p-2" placeholder="Lead API Name" value={cat.fieldMapping.lead} onChange={e => handleCategoryChange(idx, 'apiNameLead', e.target.value)} />
                </>
              ) : (
                <>
                  {integrationType === INTEGRATION_TYPES.CONTACT && (
                    <input className="flex-1 border rounded p-2" placeholder="Contact API Name" value={cat.fieldMapping.contact} onChange={e => handleCategoryChange(idx, 'apiNameContact', e.target.value)} />
                  )}
                  {integrationType === INTEGRATION_TYPES.LEAD && (
                    <input className="flex-1 border rounded p-2" placeholder="Lead API Name" value={cat.fieldMapping.lead} onChange={e => handleCategoryChange(idx, 'apiNameLead', e.target.value)} />
                  )}
                  {integrationType !== INTEGRATION_TYPES.NONE && integrationType !== INTEGRATION_TYPES.CONTACT && integrationType !== INTEGRATION_TYPES.LEAD && integrationType !== INTEGRATION_TYPES.CONTACT_LEAD && (
                    <input className="flex-1 border rounded p-2" placeholder="API Name" value={cat.fieldMapping.contact} onChange={e => handleCategoryChange(idx, 'apiNameContact', e.target.value)} />
                  )}
                </>
              )}
            </div>
            {/* Publication always on its own row */}
            <div className="mb-2">
              <input className="w-full border rounded p-2" placeholder="Publication Name" value={cat.publication.name} onChange={e => handleCategoryChange(idx, 'publicationName', e.target.value)} />
            </div>
            {/* Error messages */}
            {integrationType === INTEGRATION_TYPES.CONTACT && errors[`apiNameContact_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameContact_${idx}`]}</div>}
            {integrationType === INTEGRATION_TYPES.LEAD && errors[`apiNameLead_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameLead_${idx}`]}</div>}
            {integrationType === INTEGRATION_TYPES.CONTACT_LEAD && (
              <>
                {errors[`apiNameContact_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameContact_${idx}`]}</div>}
                {errors[`apiNameLead_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiNameLead_${idx}`]}</div>}
              </>
            )}
            {integrationType !== INTEGRATION_TYPES.NONE && integrationType !== INTEGRATION_TYPES.CONTACT && integrationType !== INTEGRATION_TYPES.LEAD && integrationType !== INTEGRATION_TYPES.CONTACT_LEAD && errors[`apiName_${idx}`] && <div className="text-red-600 text-xs mt-1">{errors[`apiName_${idx}`]}</div>}
            <button type="button" className="text-red-600 text-xs underline" onClick={() => removeCategory(idx)} disabled={categories.length === 1}>Remove</button>
          </div>
        ))}
        <button type="button" className="text-indigo-700 text-sm underline mt-2" onClick={addCategory}>+ Add Category</button>
      </div>
      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded font-semibold flex items-center justify-center" disabled={submitting}>
        {submitting && (
          <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
        )}
        {submitting ? 'Submitting...' : 'Submit Configuration'}
      </button>
    </form>
  );
}
