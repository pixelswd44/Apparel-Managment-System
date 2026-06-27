/**
 * TemplatePicker — dropdown to pick a document template from the view toolbar.
 * Used in QuotationView, InvoiceView, and ReceiptVoucher.
 *
 * Props:
 *   type        — 'quotation' | 'invoice' | 'voucher'
 *   selected    — current template object (or null)
 *   templates   — array of template objects for this type
 *   onSelect    — fn(templateObj) called when user picks a template
 */
import { useState, useRef, useEffect } from 'react';
import { LayoutTemplate, Check, ChevronDown } from 'lucide-react';
import { LayoutPreview, LAYOUTS } from '../pages/Templates';

function mergeConfig(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); }
  catch { return {}; }
}

export default function TemplatePicker({ type, selected, templates = [], onSelect }) {
  const [open, setOpen] = useState(false);
  const ref  = useRef();

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const cfg     = mergeConfig(selected?.config);
  const primary = cfg.primaryColor || '#4f46e5';
  const layoutLabel = LAYOUTS.find(l => l.key === selected?.layout)?.label || 'Classic';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch template"
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
      >
        <LayoutTemplate size={12} />
        <span className="hidden sm:inline">{selected?.name || 'Template'}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-[200] min-w-[200px] max-h-80 overflow-y-auto"
          style={{ width: 220 }}>
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest">Document Template</p>
          </div>
          {templates.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">No templates available</div>
          ) : (
            templates.map(tpl => {
              const tcfg  = mergeConfig(tpl.config);
              const isActive = selected?.id === tpl.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => { onSelect(tpl); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  {/* Mini color swatch + layout preview */}
                  <div className="w-9 h-12 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                    <LayoutPreview layout={tpl.layout} primaryColor={tcfg.primaryColor} className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-indigo-700' : 'text-slate-800'}`}>{tpl.name}</p>
                    <p className="text-2xs text-slate-400 mt-0.5">
                      {LAYOUTS.find(l => l.key === tpl.layout)?.label || tpl.layout}
                      {tpl.is_default ? ' · Default' : ''}
                    </p>
                  </div>
                  {isActive && <Check size={14} className="text-indigo-600 flex-shrink-0" />}
                </button>
              );
            })
          )}
          <div className="px-3 py-2 border-t border-slate-100">
            <a href="/templates" className="text-2xs text-indigo-600 hover:underline font-medium">Manage templates →</a>
          </div>
        </div>
      )}
    </div>
  );
}
