import { useState, useRef, useEffect } from "react";

export default function ExportMenu({
  searchCount = 0,
  category = "Data Extensions",
  onExportSearch, // () => void
  onExportAll,    // () => void
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const disabledSearch = searchCount === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 px-3 rounded-md bg-brand text-white hover:bg-brand-600 focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,.35)] transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export options"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export
        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-xl z-50 py-1"
        >
          <button
            role="menuitem"
            type="button"
            disabled={disabledSearch}
            onClick={() => { 
              setOpen(false); 
              if (!disabledSearch) onExportSearch?.(); 
            }}
            className={`w-full text-left px-4 py-3 text-sm transition-colors ${
              disabledSearch
                ? "text-slate-400 cursor-not-allowed bg-slate-50"
                : "hover:bg-slate-50 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Export search results</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Downloads only what's shown in the table below
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                disabledSearch 
                  ? "bg-slate-100 text-slate-400" 
                  : "bg-blue-100 text-blue-700"
              }`}>
                {searchCount}
              </span>
            </div>
          </button>

          <div className="my-1 border-t border-slate-200" />

          <button
            role="menuitem"
            type="button"
            onClick={() => { 
              setOpen(false); 
              onExportAll?.(); 
            }}
            className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 text-slate-900 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Export all in category</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Downloads every item in {category}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                All
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
