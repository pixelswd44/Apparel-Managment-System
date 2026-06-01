import { useState, useEffect, useRef } from 'react';
import {
  Settings as SettingsIcon, GripVertical, Plus, RefreshCw,
  Save, Pencil, Trash2, Check, X, AlertTriangle, Calculator, DollarSign, Globe,
  Building2, Upload, Star, Palette, Layers, Users, KeyRound, Eye, EyeOff,
  ShieldCheck, ShoppingBag, Package,
} from 'lucide-react';
import api, { apiFetch } from '../lib/api';
import { useAuth } from '../lib/authContext';

// ── Shared primitives ─────────────────────────────────────────────────────────

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';

function Toggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${enabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ── Cost Breakdown Items section ──────────────────────────────────────────────

function CostBreakdownItems() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [addLabel, setAddLabel]   = useState(null);
  const [adding, setAdding]       = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Drag state
  const dragIdx = useRef(null);
  const dragOverIdx = useRef(null);

  useEffect(() => {
    apiFetch('/api/cost-breakdown-items')
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function onDragStart(i) {
    dragIdx.current = i;
  }

  function onDragOver(e, i) {
    e.preventDefault();
    dragOverIdx.current = i;
    if (dragIdx.current === null || dragIdx.current === i) return;
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(i, 0, moved);
      dragIdx.current = i;
      return next;
    });
  }

  function onDragEnd() {
    dragIdx.current = null;
    dragOverIdx.current = null;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function toggleItem(id) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, enabled: it.enabled ? 0 : 1 } : it));
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditLabel(item.label);
  }

  function commitEdit(id) {
    if (!editLabel.trim()) return;
    setItems(prev => prev.map(it => it.id === id ? { ...it, label: editLabel.trim() } : it));
    setEditingId(null);
  }

  function deleteItem(id) {
    setItems(prev => prev.filter(it => it.id !== id));
    setDelTarget(null);
  }

  async function addItem() {
    if (!addLabel.trim()) return;
    setAdding(true);
    const r = await apiFetch('/api/cost-breakdown-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: addLabel.trim() }),
    });
    const newItem = await r.json();
    setItems(prev => [...prev, newItem]);
    setAddLabel('');
    setAdding(false);
  }

  async function saveChanges() {
    setSaving(true);
    await apiFetch('/api/cost-breakdown-items/bulk', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items.map((it, i) => ({ ...it, sort_order: i }))),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function restoreDefaults() {
    setRestoring(true);
    const r = await apiFetch('/api/cost-breakdown-items/restore-defaults', { method: 'POST' });
    const data = await r.json();
    setItems(Array.isArray(data) ? data : []);
    setRestoring(false);
    setDelTarget(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Info banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 mb-6">
        Cost breakdown items are used in the quotation calculator. Drag and drop to reorder, toggle on/off, and add custom items.
      </div>

      {/* List header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Cost Items</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDelTarget('restore')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={13} /> Restore Defaults
          </button>
          <button
            onClick={() => setAddLabel(v => v === null ? '' : null)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus size={13} /> Add Item
          </button>
          <button
            onClick={saveChanges}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl transition-colors font-medium"
          >
            {saved ? <><Check size={13} /> Saved!</> : saving ? 'Saving…' : <><Save size={13} /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Add item inline form */}
      {addLabel !== null && typeof addLabel === 'string' && (
        <div className="flex gap-2 mb-3">
          <input
            autoFocus
            type="text"
            value={addLabel}
            onChange={e => setAddLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAddLabel(null); }}
            placeholder="Item name…"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={addItem}
            disabled={!addLabel.trim() || adding}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
          >
            {adding ? '…' : 'Add'}
          </button>
          <button
            onClick={() => setAddLabel(null)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Restore defaults confirm */}
      {delTarget === 'restore' && (
        <div className="flex items-center gap-3 mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-700 flex-1">This will reset all items to the original defaults. Continue?</span>
          <button onClick={restoreDefaults} disabled={restoring} className="text-sm text-amber-700 hover:text-amber-900 font-semibold px-2 py-1 transition-colors">
            {restoring ? 'Restoring…' : 'Yes, Restore'}
          </button>
          <button onClick={() => setDelTarget(null)} className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1 transition-colors">Cancel</button>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={e => onDragOver(e, i)}
            onDragEnd={onDragEnd}
            className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 group hover:border-slate-300 transition-colors cursor-default"
          >
            {/* Drag handle */}
            <GripVertical
              size={16}
              className="text-slate-300 group-hover:text-slate-400 flex-shrink-0 cursor-grab active:cursor-grabbing"
            />

            {/* Label / edit field */}
            {editingId === item.id ? (
              <input
                autoFocus
                type="text"
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(item.id); if (e.key === 'Escape') setEditingId(null); }}
                onBlur={() => commitEdit(item.id)}
                className="flex-1 border border-indigo-300 rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-100 bg-white"
              />
            ) : (
              <span className={`flex-1 text-sm ${item.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                {item.label}
              </span>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Toggle enabled={!!item.enabled} onChange={() => toggleItem(item.id)} />

              {editingId === item.id ? (
                <button
                  onClick={() => commitEdit(item.id)}
                  className="p-1.5 text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  <Check size={14} />
                </button>
              ) : (
                <button
                  onClick={() => startEdit(item)}
                  className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}

              {delTarget === item.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-rose-500 hover:text-rose-700 font-semibold px-1.5 py-1 transition-colors">Yes</button>
                  <button onClick={() => setDelTarget(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1 transition-colors">No</button>
                </div>
              ) : (
                <button
                  onClick={() => setDelTarget(item.id)}
                  className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
            No cost items. Add one above or restore defaults.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exchange Rate section ─────────────────────────────────────────────────────

function ExchangeRate() {
  const [rate, setRate]     = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(s => { setRate(s.pkr_to_usd ?? '0.00358'); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    const val = parseFloat(rate);
    if (!val || val <= 0) return;
    setSaving(true);
    await apiFetch('/api/settings/pkr_to_usd', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const usdPerPkr = parseFloat(rate) || 0;
  const pkrPerUsd = usdPerPkr > 0 ? (1 / usdPerPkr).toFixed(2) : '—';

  if (loading) return <div className="flex items-center justify-center h-20"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-sm space-y-5">
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500">
        This is the base exchange rate used internally for currency conversions in the product price calculator.
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Base Currency Rate (PKR → USD)
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.00001"
              value={rate}
              onChange={e => setRate(e.target.value)}
              className={`${inputCls} pl-7`}
              placeholder="0.00358"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !parseFloat(rate)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors font-medium"
          >
            {saved ? <><Check size={13} /> Saved!</> : saving ? 'Saving…' : <><Save size={13} /> Save</>}
          </button>
        </div>
        {usdPerPkr > 0 && (
          <p className="text-xs text-slate-400 mt-2">
            Equivalent: <span className="font-medium text-slate-600">1 USD = ₨{pkrPerUsd}</span>
          </p>
        )}
      </div>

      {/* Quick reference */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Reference</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">PKR</th>
              <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium">USD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {[100, 500, 1000, 5000, 10000].map(pkr => (
              <tr key={pkr}>
                <td className="px-4 py-2 text-slate-600">₨{pkr.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-medium text-indigo-600">
                  ${(pkr * usdPerPkr).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Currencies section ────────────────────────────────────────────────────────

const EMPTY_CURRENCY = { code: '', name: '', symbol: '', rate_to_pkr: '' };

function Currencies() {
  const [currencies, setCurrencies]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [adding, setAdding]               = useState(false);
  const [form, setForm]                   = useState(EMPTY_CURRENCY);
  const [formErr, setFormErr]             = useState('');
  const [saving, setSaving]               = useState(false);
  // inline edit: { id, code, name, symbol, rate_to_pkr }
  const [editing, setEditing]             = useState(null);
  const [editSaving, setEditSaving]       = useState(false);
  const [editErr, setEditErr]             = useState('');
  const [delId, setDelId]                 = useState(null);
  const [settingDefault, setSettingDefault] = useState(null);

  const reload = async () => {
    try {
      const data = await apiFetch('/api/currencies').then(r => r.json());
      setCurrencies(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEditing(f => ({ ...f, [k]: v }));

  async function handleAdd() {
    if (!form.code.trim() || !form.name.trim()) { setFormErr('Code and name are required.'); return; }
    const pkrVal = parseFloat(form.rate_to_pkr);
    if (!pkrVal || pkrVal <= 0) { setFormErr('Enter a valid exchange rate (must be greater than 0).'); return; }
    setSaving(true); setFormErr('');
    try {
      const r = await apiFetch('/api/currencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setFormErr(data.error ?? 'Failed to add.'); return; }
      await reload();
      setForm(EMPTY_CURRENCY);
      setAdding(false);
    } catch { setFormErr('Network error.'); }
    finally { setSaving(false); }
  }

  function startEdit(c) {
    setEditing({ id: c.id, code: c.code, name: c.name, symbol: c.symbol || '', rate_to_pkr: String(c.rate_to_pkr || '') });
    setEditErr('');
  }

  async function handleSaveEdit() {
    if (!editing.code.trim() || !editing.name.trim()) { setEditErr('Code and name are required.'); return; }
    const pkrVal = parseFloat(editing.rate_to_pkr);
    if (!pkrVal || pkrVal <= 0) { setEditErr('Enter a valid exchange rate (must be greater than 0).'); return; }
    setEditSaving(true); setEditErr('');
    try {
      const r = await apiFetch(`/api/currencies/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const data = await r.json();
      if (!r.ok) { setEditErr(data.error ?? 'Failed to save.'); return; }
      await reload();
      setEditing(null);
    } catch { setEditErr('Network error.'); }
    finally { setEditSaving(false); }
  }

  async function handleSetDefault(id) {
    setSettingDefault(id);
    try {
      await apiFetch(`/api/currencies/${id}/set-default`, { method: 'PUT' });
      await reload();
    } catch {}
    setSettingDefault(null);
  }

  async function handleDelete(id) {
    try {
      const r = await apiFetch(`/api/currencies/${id}`, { method: 'DELETE' });
      if (r.ok) await reload();
    } catch {}
    setDelId(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // PKR's own rate (how many PKR = 1 USD) — derive from USD row for display
  const usdRow = currencies.find(c => c.code === 'USD');
  const pkrPerUsd = usdRow ? (parseFloat(usdRow.rate_to_pkr) || 1) : 1;

  return (
    <div>
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-sm text-indigo-700 mb-6 flex items-start gap-2.5">
        <DollarSign size={15} className="text-indigo-500 mt-0.5 flex-shrink-0" />
        <span>
          Set the exchange rate for each currency relative to your{' '}
          <span className="font-semibold">
            {currencies.find(c => c.is_default === 1)?.code || 'base'} ({currencies.find(c => c.is_default === 1)?.name || 'default currency'})
          </span>.
          All invoice and quotation values are converted using these rates.
          The <span className="font-semibold text-indigo-600">Default</span> currency is pre-selected when creating new quotations and invoices.
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">{currencies.length} currencies</h3>
        <button
          onClick={() => { setAdding(v => !v); setForm(EMPTY_CURRENCY); setFormErr(''); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium"
        >
          <Plus size={14} /> Add Currency
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Currency</p>
          {formErr && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{formErr}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Code <span className="text-rose-400">*</span></label>
              <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                className={inputCls} placeholder="e.g. EUR" maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Symbol</label>
              <input value={form.symbol} onChange={e => setF('symbol', e.target.value)}
                className={inputCls} placeholder="e.g. €" maxLength={6} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Name <span className="text-rose-400">*</span></label>
              <input value={form.name} onChange={e => setF('name', e.target.value)}
                className={inputCls} placeholder="e.g. Euro" />
            </div>
            <div>
              {(() => {
                const defCur = currencies.find(c => c.is_default === 1);
                const baseCode = defCur?.code || 'BASE';
                const baseSym  = defCur?.symbol || '';
                return (
                  <>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      1 {form.code || 'CURRENCY'} = ? {baseCode} <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <input type="number" min="0" step="any" value={form.rate_to_pkr} onChange={e => setF('rate_to_pkr', e.target.value)}
                        className={`${inputCls} pr-16`} placeholder="e.g. 1.08" />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">{baseCode}</span>
                    </div>
                    {form.rate_to_pkr && parseFloat(form.rate_to_pkr) > 0 && (
                      <p className="text-xs text-slate-400 mt-1.5">
                        Preview: <span className="font-semibold text-slate-700">1 {form.code || '?'} = {baseSym}{parseFloat(form.rate_to_pkr).toLocaleString('en-US', { maximumFractionDigits: 4 })} {baseCode}</span>
                        <span className="ml-2">·</span>
                        <span className="ml-2">1 {baseCode} = {(1 / parseFloat(form.rate_to_pkr)).toFixed(6)} {form.code || '?'}</span>
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} disabled={saving}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors font-medium">
              {saving ? 'Adding…' : 'Add Currency'}
            </button>
            <button onClick={() => { setAdding(false); setFormErr(''); }}
              className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Currency table */}
      <div className="border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-8" />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Currency</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Default</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                1 UNIT = {currencies.find(c => c.is_default === 1)?.code || 'BASE'}
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                1 {currencies.find(c => c.is_default === 1)?.code || 'BASE'} =
              </th>
              <th className="w-36" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currencies.map(c => {
              const isEditing  = editing?.id === c.id;
              const isDefault  = c.is_default === 1;
              const defCur     = currencies.find(x => x.is_default === 1);
              const baseCode   = defCur?.code || 'BASE';
              const baseSym    = defCur?.symbol || '';
              const pkrVal     = parseFloat(c.rate_to_pkr) || 1;

              if (isEditing) {
                return (
                  <tr key={c.id} className="bg-indigo-50/50">
                    <td className="px-4 py-3 text-center">
                      <span className="text-lg">{c.symbol || '—'}</span>
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      {editErr && <p className="text-xs text-rose-600 mb-2">{editErr}</p>}
                      <div className="grid grid-cols-3 gap-2">
                        <input value={editing.code} onChange={e => setE('code', e.target.value.toUpperCase())}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 bg-white font-mono font-bold"
                          placeholder="Code" maxLength={8} />
                        <input value={editing.symbol} onChange={e => setE('symbol', e.target.value)}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 bg-white text-center"
                          placeholder="Symbol" maxLength={6} />
                        <input value={editing.name} onChange={e => setE('name', e.target.value)}
                          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 bg-white"
                          placeholder="Name" />
                      </div>
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="relative">
                        <input type="number" min="0" step="any"
                          value={editing.rate_to_pkr}
                          onChange={e => setE('rate_to_pkr', e.target.value)}
                          disabled={isDefault}
                          className="w-full border border-indigo-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white font-mono pr-16 disabled:bg-slate-100 disabled:text-slate-400"
                          placeholder="Exchange rate"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">{baseCode}</span>
                      </div>
                      {editing.rate_to_pkr && parseFloat(editing.rate_to_pkr) > 0 && (
                        <p className="text-xs text-indigo-600 mt-1">
                          1 {editing.code} = {baseSym}{parseFloat(editing.rate_to_pkr).toLocaleString('en-US', { maximumFractionDigits: 4 })} {baseCode}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={handleSaveEdit} disabled={editSaving}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium disabled:opacity-60">
                          <Check size={12} /> {editSaving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditing(null); setEditErr(''); }}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={c.id} className={`transition-colors ${c.is_default === 1 ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'}`}>
                  {/* Symbol */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-base font-semibold text-slate-500">{c.symbol || '—'}</span>
                  </td>
                  {/* Code + name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg text-xs">{c.code}</span>
                      <span className="text-slate-600">{c.name}</span>
                      {c.is_default === 1 && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Default</span>
                      )}
                    </div>
                  </td>
                  {/* Rate: 1 X = ? BASE */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-slate-400">1 {c.code} =</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-slate-800 text-base">
                      {baseSym}{pkrVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {isDefault ? '(base)' : baseCode}
                    </span>
                  </td>
                  {/* Inverse */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-slate-400 font-mono">
                      {pkrVal > 0 ? (1 / pkrVal).toFixed(5) : '—'} {c.code}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1">
                      {/* Set as Default */}
                      {c.is_default !== 1 ? (
                        <button onClick={() => handleSetDefault(c.id)} disabled={settingDefault === c.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors font-medium disabled:opacity-50">
                          <Star size={10} /> {settingDefault === c.id ? '…' : 'Set Default'}
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-semibold">
                          <Star size={10} className="fill-indigo-600" /> Default
                        </span>
                      )}
                      <button onClick={() => startEdit(c)}
                        className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-1">
                        <Pencil size={13} />
                      </button>
                      {c.is_default !== 1 && (
                        delId === c.id ? (
                          <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2">
                            <span className="text-xs text-rose-600">Delete?</span>
                            <button onClick={() => handleDelete(c.id)} className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-1 py-1">Yes</button>
                            <button onClick={() => setDelId(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1 py-1">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDelId(c.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {currencies.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">No currencies added yet.</div>
        )}
      </div>

      {/* Live summary */}
      {currencies.length > 0 && (
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          {(() => {
            const defCur   = currencies.find(c => c.is_default === 1);
            const baseCode = defCur?.code || 'BASE';
            const baseSym  = defCur?.symbol || '';
            return (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Quick Reference · 1 {baseCode} =
                </p>
                <div className="flex flex-wrap gap-3">
                  {currencies.filter(c => c.code !== baseCode).map(c => (
                    <div key={c.code} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                      <p className="text-xs text-slate-400 mb-0.5">{c.code}</p>
                      <p className="font-bold text-slate-800 text-sm">
                        {c.symbol || ''}{(1 / (parseFloat(c.rate_to_pkr) || 1)).toFixed(4)}
                      </p>
                      <p className="text-2xs text-slate-400 mt-0.5">per {baseCode}</p>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Company Form (shared between add and edit) ────────────────────────────────

const EMPTY_CO = { name: '', logo: '', address: '', city: '', country: '', phone: '', email: '', website: '', tax_number: '', bank_details: '' };

function CompanyForm({ initial = EMPTY_CO, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleLogoUpload(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await apiFetch('/api/uploads', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.url) set('logo', d.url);
    } catch {} finally { setUploading(false); }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Logo */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Logo</label>
        <div className="flex items-center gap-4">
          <div onClick={() => fileRef.current?.click()}
            className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center bg-slate-50 overflow-hidden flex-shrink-0 cursor-pointer hover:border-indigo-300 transition-colors">
            {form.logo
              ? <img src={form.logo} alt="logo" className="w-full h-full object-contain p-2" />
              : <Building2 size={22} className="text-slate-300" />}
          </div>
          <div className="space-y-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50">
              <Upload size={12} />{uploading ? 'Uploading…' : 'Upload Logo'}
            </button>
            {form.logo && (
              <button type="button" onClick={() => set('logo', '')} className="text-xs text-rose-500 hover:text-rose-700 block">Remove</button>
            )}
            <p className="text-2xs text-slate-400">PNG, JPG, SVG</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload(e.target.files?.[0])} />
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Company Name <span className="text-rose-400">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="e.g. Apparel UAE LLC" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tax / VAT / TRN Number</label>
          <input value={form.tax_number} onChange={e => set('tax_number', e.target.value)} className={inputCls} placeholder="e.g. 100123456700003" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="+971 50 123 4567" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="info@company.com" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Website</label>
          <input value={form.website} onChange={e => set('website', e.target.value)} className={inputCls} placeholder="https://company.com" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Address</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} className={inputCls} placeholder="Street, Building, Area…" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">City</label>
          <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls} placeholder="Dubai" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Country</label>
          <input value={form.country} onChange={e => set('country', e.target.value)} className={inputCls} placeholder="UAE" />
        </div>
      </div>

      {/* Bank Details */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Bank Details
        </label>
        <p className="text-2xs text-slate-400 mb-2">These will automatically appear on all Quotations and Invoices for this company.</p>
        <textarea
          value={form.bank_details}
          onChange={e => set('bank_details', e.target.value)}
          rows={5}
          placeholder={`Bank Name: \nAccount Title: \nAccount Number: \nIBAN: \nSwift Code: \nBranch: `}
          className={`${inputCls} resize-none font-mono text-xs leading-relaxed`}
        />
      </div>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl transition-colors font-medium">
          {saving ? 'Saving…' : <><Save size={13} />Save Company</>}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Companies section (multi-company) ─────────────────────────────────────────

function Companies() {
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [delTarget, setDelTarget] = useState(null);
  const [delError,  setDelError]  = useState('');

  const load = () =>
    apiFetch('/api/companies').then(r => r.json())
      .then(data => { setCompanies(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function handleAdd(form) {
    setSaving(true); setError('');
    try {
      const r = await apiFetch('/api/companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed to save.'); return; }
      await load();
      setAdding(false);
    } catch { setError('Network error.'); } finally { setSaving(false); }
  }

  async function handleEdit(form) {
    setSaving(true); setError('');
    try {
      const r = await apiFetch(`/api/companies/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed to save.'); return; }
      await load();
      setEditId(null);
    } catch { setError('Network error.'); } finally { setSaving(false); }
  }

  async function handleSetDefault(id) {
    await apiFetch(`/api/companies/${id}/set-default`, { method: 'PUT' });
    load();
  }

  async function handleDelete(id) {
    try {
      const r = await apiFetch(`/api/companies/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) { setDelError(d.error ?? 'Cannot delete.'); return; }
      await load();
      setDelTarget(null); setDelError('');
    } catch { setDelError('Network error.'); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const editCompany = editId ? companies.find(c => c.id === editId) : null;

  return (
    <div className="space-y-5">
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500">
        Add multiple companies — e.g. your UAE and Pakistan entities. When creating a quotation or invoice, choose which company it comes from. The <span className="font-medium text-indigo-600">Default</span> company is pre-selected on new documents.
      </div>

      {/* Add form */}
      {adding && !editId && (
        <div className="border border-indigo-200 bg-indigo-50/30 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-4">New Company</p>
          <CompanyForm onSave={handleAdd} onCancel={() => { setAdding(false); setError(''); }} saving={saving} error={error} />
        </div>
      )}

      {/* Edit form */}
      {editId && editCompany && (
        <div className="border border-amber-200 bg-amber-50/30 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-4">Editing: {editCompany.name}</p>
          <CompanyForm
            initial={{ name: editCompany.name, logo: editCompany.logo, address: editCompany.address,
              city: editCompany.city, country: editCompany.country, phone: editCompany.phone,
              email: editCompany.email, website: editCompany.website, tax_number: editCompany.tax_number,
              bank_details: editCompany.bank_details || '' }}
            onSave={handleEdit}
            onCancel={() => { setEditId(null); setError(''); }}
            saving={saving}
            error={error}
          />
        </div>
      )}

      {/* Inline delete confirmation */}
      {delTarget && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
          <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
          {delError
            ? <span className="flex-1 text-rose-700 font-medium">{delError}</span>
            : <span className="flex-1 text-rose-700 font-medium">Delete <strong>{delTarget.name}</strong>? This cannot be undone.</span>
          }
          <button onClick={() => { setDelTarget(null); setDelError(''); }}
            className="px-3 py-1.5 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">
            {delError ? 'Close' : 'Cancel'}
          </button>
          {!delError && (
            <button onClick={() => handleDelete(delTarget.id)}
              className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">
              Delete
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
        {!adding && !editId && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium">
            <Plus size={14} /> Add Company
          </button>
        )}
      </div>

      {/* Companies list */}
      <div className="space-y-3">
        {companies.map(co => (
          <div key={co.id} className={`border rounded-2xl p-4 transition-colors ${co.is_default ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className="flex items-start gap-4">
              {/* Logo */}
              <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                {co.logo
                  ? <img src={co.logo} alt={co.name} className="w-full h-full object-contain p-1.5" />
                  : <Building2 size={20} className="text-slate-300" />}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-bold text-slate-900 text-sm">{co.name}</p>
                  {co.is_default === 1 && (
                    <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                      <Star size={10} className="fill-indigo-600" /> Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  {(co.city || co.country) && <p>{[co.city, co.country].filter(Boolean).join(', ')}</p>}
                  {co.phone && <p>{co.phone}</p>}
                  {co.email && <p>{co.email}</p>}
                  {co.tax_number && <p className="font-mono">TRN/VAT: {co.tax_number}</p>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {co.is_default !== 1 && (
                  <button onClick={() => handleSetDefault(co.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors font-medium">
                    <Star size={11} /> Set Default
                  </button>
                )}
                <button onClick={() => { setEditId(co.id); setAdding(false); setError(''); }}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                  <Pencil size={14} />
                </button>
                {co.is_default !== 1 && (
                  <button onClick={() => { setDelTarget(co); setDelError(''); }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {companies.length === 0 && !adding && (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <Building2 size={28} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium text-sm">No companies yet</p>
            <p className="text-slate-400 text-xs mt-1">Add your first company to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── App Branding section ──────────────────────────────────────────────────────

function AppBranding() {
  const [appName, setAppName]     = useState('Apparel CRM');
  const [appLogo, setAppLogo]     = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(s => {
        if (s.app_name) setAppName(s.app_name);
        setAppLogo(s.app_logo || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLogoUpload(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await apiFetch('/api/uploads', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.url) setAppLogo(d.url);
    } catch {}
    setUploading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        apiFetch('/api/settings/app_name', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: appName.trim() || 'Apparel CRM' }),
        }),
        apiFetch('/api/settings/app_logo', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: appLogo }),
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      window.dispatchEvent(new Event('branding-updated'));
    } catch {}
    setSaving(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const previewName = appName.trim() || 'Apparel CRM';

  return (
    <div className="max-w-md space-y-7">
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500">
        Customize how your application appears in the sidebar. Changes apply instantly after saving.
      </div>

      {/* ── Logo ── */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">App Logo</label>
        <div className="flex items-center gap-5">
          {/* Preview swatch / drop target */}
          <div
            onClick={() => fileRef.current?.click()}
            className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-all flex-shrink-0"
          >
            {appLogo ? (
              <img src={appLogo} alt="logo" className="w-full h-full object-contain p-2" />
            ) : (
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
                <Layers size={20} className="text-white" />
              </div>
            )}
          </div>
          {/* Upload controls */}
          <div className="space-y-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50">
              <Upload size={12} />{uploading ? 'Uploading…' : 'Upload Logo'}
            </button>
            {appLogo && (
              <button type="button" onClick={() => setAppLogo('')}
                className="text-xs text-rose-500 hover:text-rose-700 transition-colors block">
                Remove logo
              </button>
            )}
            <p className="text-2xs text-slate-400">PNG, JPG, SVG · Square logos look best</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { handleLogoUpload(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {/* ── App Name ── */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Application Name
        </label>
        <input
          value={appName}
          onChange={e => setAppName(e.target.value)}
          className={inputCls}
          placeholder="e.g. My Fashion CRM"
          maxLength={50}
        />
        <p className="text-2xs text-slate-400 mt-1.5">Shown in the sidebar header and browser title</p>
      </div>

      {/* ── Live Preview ── */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Preview</label>
        <div className="bg-[#1c1c1e] rounded-2xl p-4 inline-flex items-center gap-3 border border-white/5">
          <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0">
            {appLogo ? (
              <img src={appLogo} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center rounded-md">
                <Layers size={14} className="text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight tracking-tight">{previewName}</p>
            <p className="text-white/30 text-2xs mt-0.5 tracking-wide">Management System</p>
          </div>
        </div>
      </div>

      {/* ── Save ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl transition-colors font-medium shadow-sm"
      >
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : <><Save size={14} /> Save Changes</>}
      </button>
    </div>
  );
}

// ── Users Management ──────────────────────────────────────────────────────────

const ROLE_META = {
  super_admin: { label: 'Super Admin', color: 'bg-violet-100 text-violet-700', icon: ShieldCheck },
  sales:       { label: 'Sales',       color: 'bg-sky-100 text-sky-700',       icon: ShoppingBag },
  inventory:   { label: 'Inventory',   color: 'bg-emerald-100 text-emerald-700', icon: Package },
};

function PasswordInput({ value, onChange, placeholder = 'New password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-10`}
      />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function UserRow({ user, currentUserId, onEdit, onDelete, onResetPassword }) {
  const meta = ROLE_META[user.role] || { label: user.role, color: 'bg-slate-100 text-slate-600', icon: Users };
  const RoleIcon = meta.icon;
  const isSelf = user.id === currentUserId;
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-sm font-bold">{user.name.charAt(0).toUpperCase()}</span>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
          {isSelf && <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">You</span>}
        </div>
        <p className="text-xs text-slate-400 truncate">@{user.username} · {user.email}</p>
      </div>
      {/* Role badge */}
      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${meta.color}`}>
        <RoleIcon size={11} />
        {meta.label}
      </span>
      {/* Status */}
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {user.status}
      </span>
      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onResetPassword(user)} title="Reset Password"
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
          <KeyRound size={14} />
        </button>
        <button onClick={() => onEdit(user)} title="Edit User"
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
          <Pencil size={14} />
        </button>
        {!isSelf && (
          <button onClick={() => onDelete(user)} title="Delete User"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function UserFormModal({ user, onClose, onSave }) {
  const isEdit = !!user?.id;
  const [form, setForm] = useState({
    name:     user?.name     || '',
    username: user?.username || '',
    email:    user?.email    || '',
    role:     user?.role     || 'sales',
    status:   user?.status   || 'active',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim() || !form.username.trim() || !form.email.trim())
      return setError('Name, username and email are required.');
    if (!isEdit && form.password.length < 6)
      return setError('Password must be at least 6 characters.');
    if (isEdit && form.password && form.password.length < 6)
      return setError('New password must be at least 6 characters.');
    setSaving(true); setError('');
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      await onSave(body);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-900 text-base">{isEdit ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"><X size={16} /></button>
        </div>
        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-xl mb-4">{error}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="John Smith" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Username *</label>
              <input value={form.username} onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g,''))} className={inputCls} placeholder="johnsmith" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="john@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Role</label>
              <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
                <option value="super_admin">Super Admin</option>
                <option value="sales">Sales</option>
                <option value="inventory">Inventory</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {isEdit ? 'New Password (leave blank to keep current)' : 'Password *'}
            </label>
            <PasswordInput value={form.password} onChange={v => set('password', v)} placeholder={isEdit ? 'Leave blank to keep current' : 'Min. 6 characters'} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword]   = useState('');
  const [confirm,  setConfirm]    = useState('');
  const [saving,   setSaving]     = useState(false);
  const [success,  setSuccess]    = useState(false);
  const [error,    setError]      = useState('');

  async function handleReset() {
    if (password.length < 6)  return setError('Password must be at least 6 characters.');
    if (password !== confirm)  return setError('Passwords do not match.');
    setSaving(true); setError('');
    try {
      await api.put(`/auth/users/${user.id}`, { password });
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to reset password.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
              <KeyRound size={16} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Reset Password</h3>
              <p className="text-xs text-slate-400">for {user.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={16} /></button>
        </div>

        {success ? (
          <div className="mt-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 mb-4">
              <Check size={18} className="text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Password has been reset successfully.</p>
            </div>
            <button onClick={onClose} className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors font-medium">Done</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-xl">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">New Password</label>
              <PasswordInput value={password} onChange={setPassword} placeholder="Min. 6 characters" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Confirm Password</label>
              <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repeat password" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleReset} disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium">
                {saving ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersManagement() {
  const { user: currentUser } = useAuth();
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(null);   // null | { type: 'add'|'edit'|'reset', user? }
  const [delTarget,   setDelTarget]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/auth/users'); setUsers(data); }
    catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleSave(body) {
    if (modal?.user?.id) {
      await api.put(`/auth/users/${modal.user.id}`, body);
    } else {
      await api.post('/auth/users', body);
    }
    await load();
  }

  async function handleDelete() {
    setDeleting(true);
    try { await api.delete(`/auth/users/${delTarget.id}`); setDelTarget(null); await load(); }
    catch (e) { alert(e?.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(false); }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-slate-500">{users.length} user{users.length !== 1 ? 's' : ''} · Manage access and reset passwords</p>
        </div>
        <button onClick={() => setModal({ type: 'add' })}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors font-medium">
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* User list */}
      {loading ? (
        <div className="py-12 flex justify-center"><span className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <UserRow
              key={u.id}
              user={u}
              currentUserId={currentUser?.id}
              onEdit={user => setModal({ type: 'edit', user })}
              onDelete={setDelTarget}
              onResetPassword={user => setModal({ type: 'reset', user })}
            />
          ))}
        </div>
      )}

      {/* Role legend */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-4 flex-wrap">
        <p className="text-xs text-slate-400 font-medium">Role access:</p>
        {Object.entries(ROLE_META).map(([role, meta]) => {
          const Icon = meta.icon;
          return (
            <span key={role} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>
              <Icon size={11} />{meta.label}
            </span>
          );
        })}
      </div>

      {/* Modals */}
      {modal?.type === 'add'   && <UserFormModal user={null}       onClose={() => setModal(null)} onSave={handleSave} />}
      {modal?.type === 'edit'  && <UserFormModal user={modal.user} onClose={() => setModal(null)} onSave={handleSave} />}
      {modal?.type === 'reset' && <ResetPasswordModal user={modal.user} onClose={() => { setModal(null); }} />}

      {/* Delete confirm */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center"><AlertTriangle size={18} className="text-rose-600" /></div>
              <div>
                <h3 className="font-bold text-slate-900">Delete User</h3>
                <p className="text-xs text-slate-400">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">Delete <strong>{delTarget.name}</strong> (@{delTarget.username})? They will no longer be able to sign in.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelTarget(null)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-60 transition-colors font-medium">
                {deleting ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings sections nav ─────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'app-branding',   label: 'App Branding',          icon: Palette,    description: 'Change the application name and logo shown in the sidebar' },
  { id: 'companies',      label: 'Companies',             icon: Building2,  description: 'Manage your companies — each with its own logo and details for quotations & invoices' },
  { id: 'currencies',     label: 'Currencies & Rates',    icon: Globe,      description: 'Manage currencies and exchange rates. Set your default currency — used across all quotations, invoices and conversions.' },
  { id: 'cost-breakdown', label: 'Cost Breakdown Items',  icon: Calculator, description: 'Customize the cost categories used in the product price calculator' },
];

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const [activeSection, setActiveSection] = useState('app-branding');

  const active = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="flex flex-col p-6 animate-page gap-5">

      {/* Top tab bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-1.5 flex gap-1 overflow-x-auto">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
              activeSection === id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Icon size={14} className={activeSection === id ? 'text-indigo-200' : 'text-slate-400'} />
            {label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {/* Section header */}
          {active && (
            <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
              <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <active.icon size={16} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{active.label}</h2>
                <p className="text-xs text-slate-500">{active.description}</p>
              </div>
            </div>
          )}

          {activeSection === 'app-branding'   && <AppBranding />}
          {activeSection === 'companies'      && <Companies />}
          {activeSection === 'currencies'     && <Currencies />}
          {activeSection === 'cost-breakdown' && <CostBreakdownItems />}
        </div>
      </div>
    </div>
  );
}
