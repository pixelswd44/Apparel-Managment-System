import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Star, Check, X, AlertTriangle,
  FileText, Receipt, Wallet, RefreshCw, Eye,
} from 'lucide-react';
import api from '../lib/api';
import Drawer from '../components/Drawer';

// ── Constants ─────────────────────────────────────────────────────────────────

export const LAYOUTS = [
  {
    key: 'classic',
    label: 'Classic',
    desc: 'Clean, professional. Indigo accents, two-column header.',
  },
  {
    key: 'modern',
    label: 'Modern',
    desc: 'Bold dark header, strong typography, high contrast.',
  },
  {
    key: 'minimal',
    label: 'Minimal',
    desc: 'Ultra-clean, black & white, fine rules only.',
  },
  {
    key: 'elegant',
    label: 'Elegant',
    desc: 'Accent stripe, centered branding, refined spacing.',
  },
];

const DOC_TYPES = [
  { key: 'quotation', label: 'Quotations',        Icon: FileText },
  { key: 'invoice',   label: 'Invoices',           Icon: Receipt  },
  { key: 'voucher',   label: 'Receipt Vouchers',   Icon: Wallet   },
];

const PRESET_COLORS = [
  '#4f46e5', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#0f172a', '#64748b', '#000000',
];

const DEFAULT_CONFIG = {
  primaryColor:    '#4f46e5',
  showBankDetails: true,
  showTerms:       true,
  showWatermark:   false,
  watermarkText:   'CONFIDENTIAL',
  footerText:      '',
};

function mergeConfig(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch { return { ...DEFAULT_CONFIG }; }
}

// ── Mini document previews ────────────────────────────────────────────────────

function PreviewClassic({ primary }) {
  const p = primary || '#4f46e5';
  const light = p + '20';
  return (
    <div className="bg-white w-full h-full flex flex-col text-[3px] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start px-3 pt-3 pb-2 border-b border-slate-100">
        <div>
          <div className="w-7 h-2 rounded bg-slate-300 mb-1" />
          <div className="w-5 h-1 rounded bg-slate-200" />
        </div>
        <div className="text-right">
          <div className="text-[4px] font-black tracking-wide" style={{ color: '#0f172a' }}>QUOTATION</div>
          <div className="inline-block px-1.5 py-0.5 rounded mt-0.5 text-[3px] font-bold" style={{ background: light, color: p }}>Q-0001</div>
        </div>
      </div>
      {/* Two-col info */}
      <div className="flex gap-1.5 px-3 py-2">
        <div className="flex-1 rounded p-1.5" style={{ background: '#f8fafc' }}>
          <div className="w-3 h-0.5 rounded bg-slate-300 mb-1" />
          <div className="w-5 h-1 rounded bg-slate-400 mb-0.5" />
          <div className="w-4 h-0.5 rounded bg-slate-200" />
        </div>
        <div className="flex-1 rounded p-1.5" style={{ background: light }}>
          <div className="w-3 h-0.5 rounded mb-1" style={{ background: p + '60' }} />
          <div className="w-5 h-1 rounded mb-0.5" style={{ background: p + '40' }} />
          <div className="w-4 h-0.5 rounded" style={{ background: p + '30' }} />
        </div>
      </div>
      {/* Table rows */}
      <div className="px-3 flex-1">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-1 py-0.5 border-b border-slate-50 items-center">
            <div className="w-2 h-0.5 rounded bg-slate-200" />
            <div className="flex-1 h-0.5 rounded bg-slate-300" />
            <div className="w-2 h-0.5 rounded bg-slate-200" />
            <div className="w-3 h-0.5 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      {/* Total */}
      <div className="flex justify-end px-3 pb-2 mt-1">
        <div className="rounded px-2 py-1" style={{ background: light }}>
          <div className="w-6 h-1.5 rounded" style={{ background: p }} />
        </div>
      </div>
    </div>
  );
}

function PreviewModern({ primary }) {
  const p = primary || '#0f172a';
  return (
    <div className="bg-white w-full h-full flex flex-col text-[3px] overflow-hidden">
      {/* Dark header bar */}
      <div className="px-3 py-2.5 flex justify-between items-center" style={{ background: p }}>
        <div>
          <div className="w-7 h-1.5 rounded bg-white/80 mb-0.5" />
          <div className="w-5 h-1 rounded bg-white/40" />
        </div>
        <div className="text-right">
          <div className="text-[5px] font-black text-white tracking-widest">INVOICE</div>
          <div className="text-[3px] text-white/60 mt-0.5">IN-0001</div>
        </div>
      </div>
      {/* Info row */}
      <div className="flex gap-1.5 px-3 py-2">
        <div className="flex-1">
          <div className="w-2 h-0.5 rounded bg-slate-300 mb-1" />
          <div className="w-6 h-1 rounded bg-slate-400 mb-0.5" />
          <div className="w-4 h-0.5 rounded bg-slate-200" />
        </div>
        <div className="flex-shrink-0 rounded px-2 py-1" style={{ background: p + '15' }}>
          <div className="w-2 h-0.5 rounded mb-0.5" style={{ background: p + '40' }} />
          <div className="w-4 h-1 rounded font-bold" style={{ background: p }} />
        </div>
      </div>
      {/* Striped table */}
      <div className="px-3 flex-1">
        <div className="flex gap-1 py-0.5 mb-0.5" style={{ background: p }}>
          {['flex-1','w-2','w-3'].map((w,i) => (
            <div key={i} className={`${w} h-0.5 rounded bg-white/60`} />
          ))}
        </div>
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-1 py-0.5 items-center" style={{ background: i%2===0 ? p+'08' : '' }}>
            <div className="flex-1 h-0.5 rounded bg-slate-300" />
            <div className="w-2 h-0.5 rounded bg-slate-200" />
            <div className="w-3 h-0.5 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="flex justify-end px-3 pb-2 mt-1">
        <div className="rounded px-2 py-1" style={{ background: p }}>
          <div className="w-5 h-1.5 rounded bg-white/80" />
        </div>
      </div>
    </div>
  );
}

function PreviewMinimal({ primary }) {
  return (
    <div className="bg-white w-full h-full flex flex-col text-[3px] overflow-hidden">
      {/* Minimal header - just text */}
      <div className="px-3 pt-3 pb-2 border-b-2 border-black">
        <div className="flex justify-between items-end">
          <div>
            <div className="w-8 h-1.5 rounded bg-black mb-0.5" />
            <div className="w-5 h-0.5 rounded bg-slate-400" />
          </div>
          <div className="text-right">
            <div className="text-[6px] font-black tracking-widest text-black">QUOTATION</div>
            <div className="text-[3px] text-slate-500 mt-0.5">Q-0001</div>
          </div>
        </div>
      </div>
      {/* Address info plain */}
      <div className="flex gap-4 px-3 py-2 border-b border-slate-200">
        <div className="flex-1">
          <div className="w-2 h-0.5 rounded bg-slate-300 mb-0.5" />
          <div className="w-5 h-0.5 rounded bg-black mb-0.5" />
          <div className="w-4 h-0.5 rounded bg-slate-400" />
        </div>
        <div className="flex-1">
          <div className="w-2 h-0.5 rounded bg-slate-300 mb-0.5" />
          <div className="w-5 h-0.5 rounded bg-black mb-0.5" />
          <div className="w-4 h-0.5 rounded bg-slate-400" />
        </div>
      </div>
      {/* No-border table */}
      <div className="px-3 flex-1 pt-1">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-1 py-0.5 border-b border-slate-100 items-center">
            <div className="flex-1 h-0.5 rounded bg-black" />
            <div className="w-2 h-0.5 rounded bg-slate-400" />
            <div className="w-3 h-0.5 rounded bg-black" />
          </div>
        ))}
      </div>
      {/* Total inline */}
      <div className="flex justify-end px-3 pb-2 mt-1 border-t border-black">
        <div className="flex items-center gap-1 pt-1">
          <div className="w-4 h-0.5 rounded bg-slate-400" />
          <div className="w-5 h-1 rounded bg-black" />
        </div>
      </div>
    </div>
  );
}

function PreviewElegant({ primary }) {
  const p = primary || '#7c3aed';
  return (
    <div className="bg-white w-full h-full flex flex-col text-[3px] overflow-hidden">
      {/* Accent stripe */}
      <div className="h-1.5" style={{ background: `linear-gradient(to right, ${p}, ${p}88)` }} />
      {/* Centered header */}
      <div className="flex flex-col items-center px-3 py-2 border-b border-slate-100">
        <div className="w-6 h-2 rounded bg-slate-200 mb-1" />
        <div className="w-8 h-0.5 rounded bg-slate-400 mb-0.5" />
        <div className="w-4 h-0.5 rounded bg-slate-200 mb-1" />
        <div className="text-[5px] font-black tracking-widest" style={{ color: p }}>INVOICE</div>
        <div className="text-[3px] text-slate-400 mt-0.5">IN-0001 · Jan 2026</div>
      </div>
      {/* Info row */}
      <div className="flex gap-2 px-3 py-1.5">
        <div className="flex-1 rounded p-1" style={{ border: `1px solid ${p}30` }}>
          <div className="w-3 h-0.5 rounded mb-0.5" style={{ background: p + '60' }} />
          <div className="w-5 h-1 rounded bg-slate-300" />
        </div>
        <div className="flex-1 rounded p-1 bg-slate-50">
          <div className="w-3 h-0.5 rounded bg-slate-300 mb-0.5" />
          <div className="w-5 h-1 rounded bg-slate-300" />
        </div>
      </div>
      {/* Table */}
      <div className="px-3 flex-1">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-1 py-0.5 border-b items-center" style={{ borderColor: p + '20' }}>
            <div className="flex-1 h-0.5 rounded bg-slate-300" />
            <div className="w-2 h-0.5 rounded bg-slate-200" />
            <div className="w-3 h-0.5 rounded" style={{ background: p + '60' }} />
          </div>
        ))}
      </div>
      {/* Bottom stripe */}
      <div className="h-1 mt-auto" style={{ background: `linear-gradient(to right, ${p}, ${p}88)` }} />
    </div>
  );
}

export function LayoutPreview({ layout, primaryColor, className = '' }) {
  const props = { primary: primaryColor };
  return (
    <div className={`overflow-hidden ${className}`}>
      {layout === 'classic'  && <PreviewClassic  {...props} />}
      {layout === 'modern'   && <PreviewModern   {...props} />}
      {layout === 'minimal'  && <PreviewMinimal  {...props} />}
      {layout === 'elegant'  && <PreviewElegant  {...props} />}
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ tpl, onEdit, onDelete, onSetDefault, setting }) {
  const cfg    = mergeConfig(tpl.config);
  const layout = LAYOUTS.find(l => l.key === tpl.layout) || LAYOUTS[0];
  const typeObj = DOC_TYPES.find(d => d.key === tpl.type);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-150 hover:shadow-md ${tpl.is_default ? 'border-indigo-300 ring-1 ring-indigo-300' : 'border-slate-200'}`}>
      {/* Preview area */}
      <div className="relative bg-slate-50 border-b border-slate-100" style={{ height: 160 }}>
        <LayoutPreview
          layout={tpl.layout}
          primaryColor={cfg.primaryColor}
          className="w-full h-full"
        />
        {tpl.is_default && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-indigo-600 text-white text-2xs font-bold px-2 py-0.5 rounded-full shadow-sm">
            <Check size={9} /> Default
          </div>
        )}
        <div className="absolute bottom-2 left-2">
          <span className="text-2xs bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded-lg shadow-sm">
            {layout.label}
          </span>
        </div>
      </div>

      {/* Info + actions */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{tpl.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {typeObj && <typeObj.Icon size={10} className="text-slate-400 flex-shrink-0" />}
              <span className="text-2xs text-slate-400 capitalize">{typeObj?.label || tpl.type}</span>
              {/* color dot */}
              <span className="w-2 h-2 rounded-full flex-shrink-0 border border-white shadow-sm ml-1"
                style={{ background: cfg.primaryColor }} />
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {!tpl.is_default && (
            <button onClick={() => onSetDefault(tpl.id)} disabled={setting === tpl.id}
              className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-slate-200 rounded-lg text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors font-medium disabled:opacity-50">
              <Star size={9} /> {setting === tpl.id ? '…' : 'Set Default'}
            </button>
          )}
          <button onClick={() => onEdit(tpl)}
            className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-slate-200 rounded-lg text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors font-medium">
            <Pencil size={9} /> Edit
          </button>
          {!tpl.is_default && (
            <button onClick={() => onDelete(tpl)}
              className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-slate-200 rounded-lg text-slate-400 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-colors font-medium">
              <Trash2 size={9} /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Template Editor Modal ─────────────────────────────────────────────────────

function TemplateModal({ initial, docType, onSave, onClose }) {
  const isEdit = !!initial?.id;
  const initCfg = mergeConfig(initial?.config);

  const [form, setForm] = useState({
    name:   initial?.name   || '',
    type:   initial?.type   || docType || 'quotation',
    layout: initial?.layout || 'classic',
  });
  const [cfg, setCfg] = useState(initCfg);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('layout'); // 'layout' | 'colors' | 'options'

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setC   = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) return setError('Template name is required.');
    setSaving(true); setError('');
    try {
      const payload = { ...form, config: cfg };
      if (isEdit) await api.put(`/document-templates/${initial.id}`, payload);
      else        await api.post('/document-templates', payload);
      onSave();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save template.');
    } finally { setSaving(false); }
  }

  const tabs = ['layout', 'colors', 'options'];

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={isEdit ? 'Edit Template' : 'New Template'}
      width="max-w-2xl"
      footer={
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Template')}
          </button>
        </div>
      }
    >
      <div className="flex min-h-0">
        {/* Left: form */}
        <div className="flex-1 p-6 space-y-5">

            {error && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-xl">
                <AlertTriangle size={14} className="flex-shrink-0" /> {error}
              </div>
            )}

            {/* Name + type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label block mb-1.5">Template Name *</label>
                <input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Client Proposal"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="field-label block mb-1.5">Document Type *</label>
                <select
                  value={form.type}
                  onChange={e => set('type', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
                >
                  {DOC_TYPES.map(d => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
              {tabs.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all ${activeTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Layout tab */}
            {activeTab === 'layout' && (
              <div className="grid grid-cols-2 gap-3">
                {LAYOUTS.map(l => (
                  <button key={l.key} onClick={() => set('layout', l.key)}
                    className={`relative text-left rounded-xl border-2 overflow-hidden transition-all ${form.layout === l.key ? 'border-indigo-500 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="h-24">
                      <LayoutPreview layout={l.key} primaryColor={cfg.primaryColor} className="w-full h-full" />
                    </div>
                    <div className="px-3 py-2 bg-white border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm text-slate-800">{l.label}</p>
                        {form.layout === l.key && <Check size={14} className="text-indigo-600" />}
                      </div>
                      <p className="text-2xs text-slate-400 mt-0.5 leading-relaxed">{l.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Colors tab */}
            {activeTab === 'colors' && (
              <div className="space-y-4">
                <div>
                  <label className="field-label block mb-2">Primary Color</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => setC('primaryColor', c)}
                        className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${cfg.primaryColor === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                    <div className="flex items-center gap-2 ml-2">
                      <input
                        type="color"
                        value={cfg.primaryColor || '#4f46e5'}
                        onChange={e => setC('primaryColor', e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                        title="Custom color"
                      />
                      <span className="text-sm text-slate-500 font-mono">{cfg.primaryColor}</span>
                    </div>
                  </div>
                </div>
                {/* Live preview of color change */}
                <div>
                  <label className="field-label block mb-2">Preview</label>
                  <div className="border border-slate-200 rounded-xl overflow-hidden" style={{ height: 120 }}>
                    <LayoutPreview layout={form.layout} primaryColor={cfg.primaryColor} className="w-full h-full" />
                  </div>
                </div>
              </div>
            )}

            {/* Options tab */}
            {activeTab === 'options' && (
              <div className="space-y-4">
                {/* Toggles */}
                {[
                  { key: 'showBankDetails', label: 'Show Bank Details',    desc: 'Include bank/payment info section' },
                  { key: 'showTerms',       label: 'Show Terms & Conditions', desc: 'Include terms section at bottom' },
                  { key: 'showWatermark',   label: 'Show Watermark',       desc: 'Overlay text watermark on document' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{label}</p>
                      <p className="text-2xs text-slate-400 mt-0.5">{desc}</p>
                    </div>
                    <button
                      onClick={() => setC(key, !cfg[key])}
                      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${cfg[key] ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg[key] ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}

                {/* Watermark text */}
                {cfg.showWatermark && (
                  <div>
                    <label className="field-label block mb-1.5">Watermark Text</label>
                    <input
                      value={cfg.watermarkText || ''}
                      onChange={e => setC('watermarkText', e.target.value)}
                      placeholder="CONFIDENTIAL"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    />
                  </div>
                )}

                {/* Footer */}
                <div>
                  <label className="field-label block mb-1.5">Custom Footer Text</label>
                  <textarea
                    value={cfg.footerText || ''}
                    onChange={e => setC('footerText', e.target.value)}
                    placeholder="e.g. Thank you for your business!"
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none"
                  />
                </div>
              </div>
            )}
        </div>

        {/* Right: live preview pane */}
        <div className="w-52 border-l border-slate-100 bg-slate-50 p-4 flex flex-col flex-shrink-0">
          <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-3">Preview</p>
          <div className="flex items-start justify-center">
            <div className="w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 200 }}>
              <LayoutPreview layout={form.layout} primaryColor={cfg.primaryColor} className="w-full h-full" />
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="text-2xs font-semibold text-slate-600">{LAYOUTS.find(l => l.key === form.layout)?.label}</p>
            <p className="text-2xs text-slate-400 mt-0.5 leading-relaxed">{LAYOUTS.find(l => l.key === form.layout)?.desc}</p>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal,     setModal]     = useState(null);   // null | 'new' | template-obj
  const [delTarget, setDelTarget] = useState(null);
  const [deleting,  setDeleting]  = useState(false);
  const [delError,  setDelError]  = useState('');
  const [setting,   setSetting]   = useState(null);   // id being set-as-default

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/document-templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSetDefault(id) {
    setSetting(id);
    try {
      await api.put(`/document-templates/${id}/set-default`);
      await load();
    } catch {}
    setSetting(null);
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true); setDelError('');
    try {
      await api.delete(`/document-templates/${delTarget.id}`);
      setDelTarget(null);
      await load();
    } catch (e) {
      setDelError(e?.response?.data?.error || 'Failed to delete.');
    } finally { setDeleting(false); }
  }

  const filtered = typeFilter === 'all' ? templates : templates.filter(t => t.type === typeFilter);

  const countFor = type => templates.filter(t => t.type === type).length;

  return (
    <div className="animate-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage print layouts for quotations, invoices and receipt vouchers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="p-2 text-slate-400 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
            <Plus size={16} /> New Template
          </button>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto mb-6">
        <button onClick={() => setTypeFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${typeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          All
          <span className="text-2xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">{templates.length}</span>
        </button>
        {DOC_TYPES.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${typeFilter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={13} />
            {label}
            <span className={`text-2xs px-1.5 py-0.5 rounded-full font-bold ${typeFilter === key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{countFor(key)}</span>
          </button>
        ))}
      </div>

      {/* Inline delete confirmation */}
      {delTarget && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-sm">
          <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
          <span className="flex-1 text-rose-700 font-medium">
            Delete <strong>"{delTarget.name}"</strong>? Documents using it will not be affected.
          </span>
          {delError && <span className="text-rose-600 text-xs mr-2">{delError}</span>}
          <button onClick={() => { setDelTarget(null); setDelError(''); }}
            className="px-3 py-1.5 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
          <button onClick={handleDelete} disabled={deleting}
            className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin-slow" /> Loading templates…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-slate-200 rounded-2xl">
          <Eye size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-500">No templates</p>
          <p className="text-sm text-slate-400 mt-1">
            {typeFilter === 'all' ? 'Create your first document template.' : `No ${typeFilter} templates yet.`}
          </p>
          <button onClick={() => setModal('new')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
            <Plus size={14} /> New Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(tpl => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              setting={setting}
              onEdit={t => setModal(t)}
              onDelete={t => setDelTarget(t)}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}

      {/* Info box */}
      {!loading && templates.length > 0 && (
        <div className="mt-8 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-3">
          <Eye size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-indigo-800">
            <p className="font-semibold mb-0.5">How templates work</p>
            <p className="text-indigo-700/80 leading-relaxed">
              The <strong>Default</strong> template for each type is automatically applied when you view or print a document.
              You can also override the template per-document using the template picker in the document toolbar.
            </p>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <TemplateModal
          initial={modal === 'new' ? null : modal}
          docType={typeFilter !== 'all' ? typeFilter : 'quotation'}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}

    </div>
  );
}
