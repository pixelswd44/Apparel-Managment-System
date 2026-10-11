import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, FileImage, Flame,
  ImagePlus, Layers, PackageOpen, Pencil, Plus, Printer, Receipt, Save, Scissors,
  Search, Shirt, Tag, Trash2, TrendingUp, Truck, User, Wand2, X,
} from 'lucide-react';
import api, { imgUrl } from '../lib/api';
import { ExpenseModal } from './Expenses';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const DEFAULT_SIZES  = STANDARD_SIZES.map(s => ({ size: s, qty: 0 }));

const STATUS_CONFIG = {
  active:    { label: 'Active',    color: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-500' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const pkr = v => `₨${(parseFloat(v)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

// Build a PKR→baseCurrency formatter.
// If base is PKR (default), returns the standard ₨ formatter.
// Otherwise converts PKR → base by dividing by rate_to_pkr.
function makeFormatter(currencies, baseCurrCode) {
  if (!baseCurrCode || baseCurrCode === 'PKR') return pkr;
  const base = (currencies || []).find(c => c.code === baseCurrCode);
  if (!base || !(parseFloat(base.rate_to_pkr) > 0)) return pkr;
  const sym  = base.symbol || baseCurrCode;
  const rate = parseFloat(base.rate_to_pkr);
  return v => `${sym}${((parseFloat(v)||0) / rate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
const fmtDate = d => {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'});
};

// How many PKR does 1 unit of currencyCode buy?
// Prefers the user-set rate_to_pkr; falls back to rate_to_usd cross-rate.
function getExchangeRate(currencyCode, currencies) {
  if (!currencyCode || currencyCode === 'PKR') return 1;
  const curr = currencies.find(c => c.code === currencyCode);
  if (!curr) return 1;
  if (curr.rate_to_pkr > 0) return curr.rate_to_pkr;
  // fallback: cross-rate via USD
  const pkr = currencies.find(c => c.code === 'PKR');
  if (!pkr || !pkr.rate_to_usd || pkr.rate_to_usd <= 0) return 1;
  return curr.rate_to_usd / pkr.rate_to_usd;
}

function toPKR(amount, currencyCode, currencies) {
  return (parseFloat(amount) || 0) * getExchangeRate(currencyCode, currencies);
}

// Project money: cost is the sum of the expenses charged to the project on the
// Expenses screen; received is what the client paid on the linked invoice
// (actual PKR when entered, else amount × rate); profit = received − cost.
function calcProject(project, currencies = []) {
  const expenses = Array.isArray(project.expenses) ? project.expenses : [];
  const expenseTotal  = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  // Shipping costs are entered on the project's shipments (Shipping tab)
  const shippingTotal = (project.shipping || []).reduce((s, sh) => s + (parseFloat(sh.cost_total) || 0), 0);
  const totalExpense  = expenseTotal + shippingTotal;

  // Spending grouped by expense category (+ shipping), largest first
  const byCat = new Map();
  for (const e of expenses) {
    const key = e.category_name || 'Uncategorized';
    const row = byCat.get(key) || { label: key, color: e.category_color || '#94a3b8', total: 0 };
    row.total += parseFloat(e.amount) || 0;
    byCat.set(key, row);
  }
  if (shippingTotal > 0) {
    const row = byCat.get('Shipping') || { label: 'Shipping', color: '#0ea5e9', total: 0 };
    row.total += shippingTotal;
    byCat.set('Shipping', row);
  }
  const byCategory = [...byCat.values()].sort((a, b) => b.total - a.total);

  // ── Revenue ────────────────────────────────────────────────────────────────
  const receivedCurrency = project.invoice_id
    ? (project.invoice_currency || 'USD')
    : (project.currency || 'PKR');
  const receivedRaw = project.invoice_id
    ? (parseFloat(project.invoice_amount_paid) || 0)
    : (parseFloat(project.amount_received)     || 0);
  const rateOverride = project.exchange_rate_actual && project.exchange_rate_actual > 0;
  const exchangeRate = rateOverride
    ? project.exchange_rate_actual
    : getExchangeRate(receivedCurrency, currencies);
  // Invoice-linked: use each client payment's actual PKR received when entered
  // (same as Financials), else amount × today's rate. Mirrors the server list.
  let received = (parseFloat(receivedRaw) || 0) * exchangeRate;
  if (project.invoice_id && !rateOverride && Array.isArray(project.invoice_payments)) {
    let raw = 0;
    received = 0;
    for (const p of project.invoice_payments) {
      const amt = parseFloat(p.amount) || 0;
      raw += amt;
      received += (p.amount_pkr_actual !== null && p.amount_pkr_actual !== undefined && p.amount_pkr_actual !== '')
        ? (parseFloat(p.amount_pkr_actual) || 0)
        : amt * getExchangeRate(p.currency || receivedCurrency, currencies);
    }
    const rest = receivedRaw - raw; // amount_paid not backed by payment rows
    if (rest > 0.005) received += rest * exchangeRate;
  }

  return {
    totalExpense, expenseTotal, shippingTotal, byCategory, expenseCount: expenses.length,
    received, profit: received - totalExpense,
    receivedRaw, receivedCurrency, exchangeRate,
  };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

function Label({ text, required }) {
  return <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{text}{required && <span className="text-rose-400 ml-0.5">*</span>}</label>;
}
function Field({ label, required, children, className = '' }) {
  return <div className={className}><Label text={label} required={required} />{children}</div>;
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status === 'completed' ? 'completed' : 'active'];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Project Modal (create / edit) ────────────────────────────────────────────


// ─── Product Line (within Project detail) ────────────────────────────────────

const ALL_STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const EMPTY_PP = {
  product_id: '', product_name: '', unit: 'pcs',
  sizes: DEFAULT_SIZES, notes: '',
};

function ProductLine({ pp, catalogProducts, invoiceNames = [], onSave, onRemove }) {
  const [expanded, setExpanded] = useState(!pp.id);
  const [form, setForm]         = useState(() => ({
    ...pp,
    sizes:   pp.sizes?.length ? pp.sizes : DEFAULT_SIZES.map(s => ({ size: s, qty: 0 })),
  }));
  const [saving, setSaving]             = useState(false);
  const [saveState, setSaveState]       = useState('idle'); // idle | saving | saved | error
  const [delConf, setDelConf]           = useState(false);
  const [customSizeName, setCustomSizeName] = useState('');
  const [nameMode, setNameMode]         = useState(pp.product_id ? 'catalog' : (pp.product_name ? 'custom' : 'catalog'));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const totalQty    = form.sizes.reduce((s, sz) => s + (parseFloat(sz.qty) || 0), 0);

  // Size helpers — all sizes deletable
  function updateSize(idx, qty) {
    setForm(f => {
      const sizes = [...f.sizes];
      sizes[idx] = { ...sizes[idx], qty: qty === '' ? 0 : parseFloat(qty) || 0 };
      return { ...f, sizes };
    });
  }
  function addSize() {
    const name = customSizeName.trim().toUpperCase();
    if (!name || form.sizes.find(s => s.size === name)) return;
    setForm(f => ({ ...f, sizes: [...f.sizes, { size: name, qty: 0 }] }));
    setCustomSizeName('');
  }
  function removeSize(idx) {
    setForm(f => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }));
  }
  function readdSize(name) {
    setForm(f => ({ ...f, sizes: [...f.sizes, { size: name, qty: 0 }] }));
  }

  // Catalog product pick
  function pickCatalogProduct(productId) {
    if (!productId) { set('product_id', ''); return; }
    const prod = catalogProducts.find(p => String(p.id) === String(productId));
    if (prod) setForm(f => ({ ...f, product_id: prod.id, product_name: prod.name, unit: prod.unit || f.unit }));
  }

  async function persist(collapse = true) {
    if (!form.product_name.trim()) return;
    setSaving(true);
    setSaveState('saving');
    try {
      await onSave({ product_id: form.product_id, product_name: form.product_name, unit: form.unit,
                     sizes: form.sizes, notes: form.notes, sort_order: form.sort_order, total_quantity: totalQty });
      if (collapse) setExpanded(false);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    } finally { setSaving(false); }
  }

  const handleSave = () => persist(true);

  // Debounced auto-save for already-saved products — fires 1.2s after the last edit
  const autosaveReady = useRef(false);
  useEffect(() => {
    if (!pp.id) return;
    if (!autosaveReady.current) { autosaveReady.current = true; return; }
    if (!form.product_name.trim()) return;
    const t = setTimeout(() => persist(false), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // Fade the "Saved" badge back to idle
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const removedStandard = ALL_STANDARD_SIZES.filter(s => !form.sizes.find(sz => sz.size === s));

  return (
    <div className={`bg-white border rounded-2xl shadow-sm transition-all ${expanded ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'}`}>

      {/* ── Collapsed header — unsaved (new) lines stay expanded so the Add button never gets stuck ── */}
      <div className={`flex items-center gap-3 px-5 py-3.5 ${pp.id ? 'cursor-pointer' : ''}`} onClick={() => pp.id && setExpanded(e => !e)}>
        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Shirt size={15} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate">{form.product_name || <span className="text-slate-400 font-normal">Unnamed Product</span>}</p>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
            <span>{totalQty.toLocaleString()} {form.unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saveState === 'saving' && (
            <span className="flex items-center gap-1 text-2xs text-slate-400">
              <span className="w-3 h-3 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" /> Saving…
            </span>
          )}
          {saveState === 'saved' && <span className="text-2xs font-semibold text-emerald-500">✓ Saved</span>}
          {saveState === 'error' && <span className="text-2xs font-semibold text-rose-500">Save failed</span>}
          {!delConf ? (
            <button type="button" onClick={e => { e.stopPropagation(); setDelConf(true); }}
              className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2 py-1" onClick={e => e.stopPropagation()}>
              <span className="text-xs text-rose-600">Remove?</span>
              <button onClick={() => onRemove()} className="text-xs text-rose-600 font-semibold px-1.5 py-0.5 hover:text-rose-800">Yes</button>
              <button onClick={() => setDelConf(false)} className="text-xs text-slate-400 px-1">No</button>
            </div>
          )}
          {pp.id && (expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />)}
        </div>
      </div>

      {(expanded || !pp.id) && (
        <div className="border-t border-slate-100 p-4 sm:p-5 space-y-4">

          {/* ══ Product | Sizes ══ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* ── Product card ── */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0"><Shirt size={12} className="text-indigo-600" /></div>
                  <p className="text-xs font-bold text-slate-700">Product</p>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Catalog">
                      <select
                        value={nameMode === 'catalog' && form.product_id ? String(form.product_id) : (nameMode === 'custom' ? '__custom__' : '')}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__custom__') { setNameMode('custom'); set('product_id', ''); }
                          else if (val === '') { setNameMode('catalog'); set('product_id', ''); set('product_name', ''); }
                          else { setNameMode('catalog'); pickCatalogProduct(val); }
                        }}
                        className={selectCls}>
                        <option value="">— Select —</option>
                        {(() => {
                          const invSet = new Set(invoiceNames.map(n => n.trim().toLowerCase()));
                          const onInv  = catalogProducts.filter(p => invSet.has((p.name||'').trim().toLowerCase()));
                          const rest   = onInv.length ? catalogProducts.filter(p => !invSet.has((p.name||'').trim().toLowerCase())) : catalogProducts;
                          const opt = p => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name}{p.article_number ? ` (${p.article_number})` : ''}
                            </option>
                          );
                          return onInv.length > 0 ? (
                            <>
                              <optgroup label="On Invoice">{onInv.map(opt)}</optgroup>
                              <optgroup label="All Products">{rest.map(opt)}</optgroup>
                            </>
                          ) : rest.map(opt);
                        })()}
                        <option value="__custom__">✏ Custom</option>
                      </select>
                    </Field>
                    <Field label="Unit">
                      <select value={form.unit} onChange={e => set('unit', e.target.value)} className={selectCls}>
                        {['pcs','kg','g','meters','yards','sets','pairs','dozen','box'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </Field>
                  </div>
                  {(nameMode === 'custom' || (nameMode === 'catalog' && form.product_id)) && (
                    <Field label={nameMode === 'custom' ? 'Product Name *' : 'Product Name'}>
                      <input value={form.product_name} onChange={e => set('product_name', e.target.value)}
                        className={inputCls} placeholder="Enter product name…" />
                    </Field>
                  )}
                  <Field label="Notes">
                    <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
                      className={`${inputCls} resize-none text-xs`} placeholder="Notes for this product…" />
                  </Field>
                </div>
              </div>

              {/* ── Sizes card ── */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0"><Tag size={12} className="text-violet-600" /></div>
                    <p className="text-xs font-bold text-slate-700">Sizes</p>
                  </div>
                  <span className="text-xs font-bold text-indigo-600">{totalQty.toLocaleString()} {form.unit}</span>
                </div>
                {form.sizes.length === 0 ? (
                  <p className="text-xs text-slate-400 italic mb-2">No sizes — use "Add Size" below.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {form.sizes.map((sz, idx) => (
                      <div key={idx} className="relative group">
                        <div className="flex items-center justify-between mb-1 px-0.5">
                          <label className="text-2xs font-semibold text-slate-500">{sz.size}</label>
                          <button onClick={() => removeSize(idx)}
                            className="w-3.5 h-3.5 bg-rose-100 text-rose-500 rounded-full text-2xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white leading-none">
                            ×
                          </button>
                        </div>
                        <input type="number" min="0"
                          value={sz.qty === 0 ? '' : sz.qty}
                          onChange={e => updateSize(idx, e.target.value)}
                          placeholder="0"
                          className="w-full border border-slate-200 rounded-lg px-1.5 py-2 text-sm text-center outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
                      </div>
                    ))}
                  </div>
                )}
                {removedStandard.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <span className="text-2xs text-slate-400">Re-add:</span>
                    {removedStandard.map(s => (
                      <button key={s} onClick={() => readdSize(s)}
                        className="text-2xs px-1.5 py-0.5 border border-dashed border-slate-300 rounded text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                        +{s}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={customSizeName} onChange={e => setCustomSizeName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSize()}
                    placeholder="+ Add size (28, Kids-S, Custom…)"
                    className="flex-1 border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400 placeholder:text-slate-400" />
                  <button onClick={addSize}
                    className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors font-medium">
                    Add
                  </button>
                </div>
              </div>

          </div>

          {/* ── Save / Close — sticky so it's always reachable on long forms ── */}
          <div className="sticky bottom-3 z-10 pt-1">
            <div className="inline-flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl p-2 shadow-lg">
              <button onClick={handleSave} disabled={saving || !form.product_name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                <Save size={14} /> {saving ? 'Saving…' : pp.id ? 'Save & Close' : 'Add Product'}
              </button>
              {pp.id && (
                <button onClick={() => setExpanded(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors bg-white">
                  Close
                </button>
              )}
              {pp.id && (
                saveState === 'saving' ? <span className="text-2xs text-slate-400 px-1">Saving…</span>
                : saveState === 'error' ? <span className="text-2xs font-semibold text-rose-500 px-1">Save failed</span>
                : <span className="text-2xs text-slate-400 px-1 hidden sm:inline">Auto-saves as you edit</span>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Print Views ──────────────────────────────────────────────────────────────

// ─── Print Summary — compact all-in-one project record ───────────────────────
function PrintSummary({ project, fin = {} }) {
  const prods        = project.products || [];
  const images       = Array.isArray(project.images) ? project.images : [];
  const shipments    = project.shipping || [];

  const totalQty     = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity) || 0), 0);
  // Same figures as the on-screen strip (calcProject)
  const { totalExpense = 0, byCategory = [], received = 0, profit = 0 } = fin;
  const costPP       = totalQty > 0 ? totalExpense / totalQty : 0;

  return (
    <div className="p-8 font-sans text-slate-900 text-xs leading-normal">

      {/* ── Header ── */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-5">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">{project.title}</h1>
          <div className="flex gap-4 mt-1.5 text-sm text-slate-500">
            {project.client_name && <span>Client: <strong className="text-slate-800">{project.client_name}{project.client_company && project.client_company !== project.client_name ? ` — ${project.client_company}` : ''}</strong></span>}
            {project.invoice_number && <span>Invoice: <strong className="text-slate-800">#{project.invoice_number}</strong></span>}
            <span>Status: <strong className="text-slate-800 uppercase">{project.status}</strong></span>
          </div>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>Printed: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
          <p>Date: {fmtDate(project.created_at)}</p>
          {totalQty > 0 && <p className="font-bold text-slate-800 text-base mt-1">{totalQty.toLocaleString()} pcs total</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5" style={{ breakInside: 'avoid' }}>

        {/* ── Financial summary ── */}
        <div className="col-span-1">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Financials</p>
          <table className="w-full text-sm">
            <tbody>
              {byCategory.map(r => (
                <tr key={r.label}>
                  <td className="py-0.5 text-slate-500">{r.label}</td>
                  <td className="py-0.5 text-right font-semibold">{pkr(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-300 font-bold">
                <td className="py-1 text-slate-800">Total Expense</td>
                <td className="py-1 text-right text-slate-900">{pkr(totalExpense)}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-slate-500">
                  Received
                  {fin.receivedCurrency && fin.receivedCurrency !== 'PKR' && (
                    <span className="ml-1 text-2xs text-slate-400">
                      ({fin.receivedCurrency} {(fin.receivedRaw || 0).toLocaleString()})
                    </span>
                  )}
                </td>
                <td className="py-0.5 text-right font-semibold text-emerald-700">{pkr(received)}</td>
              </tr>
              <tr className="border-t border-slate-300 font-bold">
                <td className="py-1">{profit >= 0 ? 'Net Profit' : 'Net Loss'}</td>
                <td className={`py-1 text-right ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{pkr(Math.abs(profit))}</td>
              </tr>
              {costPP > 0 && (
                <tr>
                  <td className="py-0.5 text-slate-500">Cost / Piece</td>
                  <td className="py-0.5 text-right font-bold text-indigo-700">{pkr(costPP)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Products & Sizes ── */}
        <div className="col-span-2">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Products &amp; Sizes</p>
          {prods.length === 0 ? (
            <p className="text-slate-400 italic">No products added</p>
          ) : prods.map(pp => {
            const activeSizes = (pp.sizes || []).filter(s => parseFloat(s.qty) > 0);
            return (
              <div key={pp.id} className="mb-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-bold text-slate-900 text-sm">{pp.product_name}</span>
                  <span className="text-slate-500 text-xs">{parseFloat(pp.total_quantity)||0} {pp.unit}</span>
                  {pp.notes && <span className="text-slate-400 italic text-xs">{pp.notes}</span>}
                </div>
                {activeSizes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeSizes.map(sz => (
                      <span key={sz.size} className="border border-slate-300 rounded px-2 py-0.5 font-semibold text-slate-700 text-xs">
                        {sz.size}: <strong>{parseFloat(sz.qty)}</strong>
                      </span>
                    ))}
                    <span className="border border-slate-800 bg-slate-800 text-white rounded px-2 py-0.5 font-bold text-xs">
                      Total: {parseFloat(pp.total_quantity)||0}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Reference images — full size, with product quantities alongside ── */}
      {(images.length > 0 || prods.length > 0) && (
        <div className="mb-5" style={{ breakInside: 'avoid' }}>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-3">
            Reference Images &amp; Quantities
          </p>

          {/* Quantities strip — one row */}
          {prods.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {prods.map(pp => (
                <span key={pp.id} className="border-2 border-slate-800 rounded px-3 py-1 text-sm font-bold text-slate-900">
                  {pp.product_name} — {(parseFloat(pp.total_quantity)||0).toLocaleString()} {pp.unit}
                </span>
              ))}
              {totalQty > 0 && (
                <span className="rounded px-3 py-1 text-sm font-bold bg-slate-900 text-white">
                  TOTAL {totalQty.toLocaleString()} pcs
                </span>
              )}
            </div>
          )}

          {/* Full images — two per row, large */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="border border-slate-300 rounded overflow-hidden" style={{ width: 'calc(50% - 6px)', breakInside: 'avoid' }}>
                  <img src={imgUrl(img.url)} alt={img.originalName || `Image ${i+1}`}
                    className="w-full object-contain bg-slate-50" style={{ maxHeight: 340 }} />
                  {img.originalName && (
                    <p className="text-xs text-slate-500 px-2 py-1 truncate">{img.originalName}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Shipping ── */}
      {shipments.length > 0 && (
        <div className="mb-4">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Shipping</p>
          <table className="w-full border-collapse text-2xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Shipping Agent</th>
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Tracking No.</th>
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(sh => (
                <tr key={sh.id}>
                  <td className="border border-slate-200 px-2 py-1 font-medium">{sh.carrier || '—'}</td>
                  <td className="border border-slate-200 px-2 py-1 font-mono">{sh.tracking_number || '—'}</td>
                  <td className="border border-slate-200 px-2 py-1">{sh.shipping_date ? fmtDate(sh.shipping_date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes ── */}
      {project.notes && (
        <div className="mb-4">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Notes</p>
          <p className="text-2xs text-slate-700 whitespace-pre-wrap leading-relaxed">{project.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-300 pt-3 mt-4 flex justify-between text-2xs text-slate-400">
        <span>Project Summary — {project.title}</span>
        <span>Printed: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
      </div>
    </div>
  );
}

// Shared: full-size reference images, two per row (used by Cutting / Stitching)
function PrintRefImages({ images }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="mb-6" style={{ breakInside: 'avoid' }}>
      <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Final Designs</p>
      <div className="flex flex-wrap gap-3">
        {images.map((img, i) => (
          <div key={i} className="border border-slate-300 rounded overflow-hidden" style={{ width: 'calc(50% - 6px)', breakInside: 'avoid' }}>
            <img src={imgUrl(img.url)} alt={img.originalName || `Image ${i+1}`}
              className="w-full object-contain bg-slate-50" style={{ maxHeight: 360 }} />
            {img.originalName && (
              <p className="text-xs text-slate-500 px-2 py-1 truncate">{img.originalName}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintCutting({ project }) {
  const images = Array.isArray(project.images) ? project.images : [];
  return (
    <div className="p-8 font-sans text-slate-900">
      <div className="border-b-2 border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-800">Cutting Order</h1>
        <div className="flex justify-between mt-2 text-sm text-slate-600">
          <span><strong>Project:</strong> {project.title}</span>
          <span><strong>Client:</strong> {project.client_name}{project.client_company ? ` — ${project.client_company}` : ''}</span>
          <span><strong>Date:</strong> {fmtDate(project.created_at)}</span>
        </div>
      </div>

      <PrintRefImages images={images} />
      {(project.products||[]).map((pp, i) => (
        <div key={pp.id} className={`mb-8 ${i < project.products.length - 1 ? 'pb-8 border-b border-slate-300' : ''}`}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-slate-900">{pp.product_name}</h2>
            <span className="text-sm text-slate-500">Total: <strong>{parseFloat(pp.total_quantity)||0} {pp.unit}</strong></span>
          </div>
          <table className="w-full border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-4 py-2 text-left font-semibold">Size</th>
                <th className="border border-slate-300 px-4 py-2 text-center font-semibold">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {(pp.sizes||[]).filter(s => parseFloat(s.qty) > 0).map(sz => (
                <tr key={sz.size}>
                  <td className="border border-slate-300 px-4 py-2 font-medium">{sz.size}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-bold text-lg">{parseFloat(sz.qty)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className="border border-slate-300 px-4 py-2">TOTAL</td>
                <td className="border border-slate-300 px-4 py-2 text-center text-lg">{parseFloat(pp.total_quantity)||0}</td>
              </tr>
            </tbody>
          </table>
          {pp.notes && <p className="text-xs text-slate-500 mt-2 italic">Note: {pp.notes}</p>}
        </div>
      ))}
      <div className="border-t border-slate-300 pt-4 mt-8 flex justify-between text-xs text-slate-400">
        <span>Cutting Order — {project.title}</span>
        <span>Printed: {new Date().toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function PrintStitching({ project }) {
  const images = Array.isArray(project.images) ? project.images : [];
  return (
    <div className="p-8 font-sans text-slate-900">
      <div className="border-b-2 border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-800">Stitching Order</h1>
        <div className="flex justify-between mt-2 text-sm text-slate-600">
          <span><strong>Project:</strong> {project.title}</span>
          <span><strong>Client:</strong> {project.client_name}{project.client_company ? ` — ${project.client_company}` : ''}</span>
          <span><strong>Date:</strong> {fmtDate(project.created_at)}</span>
        </div>
      </div>
      <PrintRefImages images={images} />
      {(project.products||[]).map((pp, i) => (
        <div key={pp.id} className={`mb-8 ${i < project.products.length - 1 ? 'pb-8 border-b border-slate-300' : ''}`}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-slate-900">{pp.product_name}</h2>
            <span className="text-sm text-slate-500">Total: <strong>{parseFloat(pp.total_quantity)||0} {pp.unit}</strong></span>
          </div>
          <table className="w-full border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-4 py-2 text-left font-semibold">Size</th>
                <th className="border border-slate-300 px-4 py-2 text-center font-semibold">Quantity</th>
                <th className="border border-slate-300 px-4 py-2 text-center font-semibold">Done ✓</th>
              </tr>
            </thead>
            <tbody>
              {(pp.sizes||[]).filter(s => parseFloat(s.qty) > 0).map(sz => (
                <tr key={sz.size}>
                  <td className="border border-slate-300 px-4 py-2 font-medium">{sz.size}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-bold text-lg">{parseFloat(sz.qty)}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">&nbsp;</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className="border border-slate-300 px-4 py-2">TOTAL</td>
                <td className="border border-slate-300 px-4 py-2 text-center text-lg">{parseFloat(pp.total_quantity)||0}</td>
                <td className="border border-slate-300 px-4 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <div className="border-t border-slate-300 pt-4 mt-8 flex justify-between text-xs text-slate-400">
        <span>Stitching Order — {project.title}</span>
        <span>Printed: {new Date().toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function PrintPackaging({ project }) {
  const prods     = project.products || [];
  const shipments = project.shipping || [];
  const grand     = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity) || 0), 0);

  return (
    <div className="p-8 font-sans text-slate-900 text-sm">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide">Packing List</h1>
          <p className="text-sm text-slate-500 mt-1">
            <strong className="text-slate-800">{project.title}</strong>
            {project.client_name ? ` · ${project.client_name}` : ''}
          </p>
          {shipments.length > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">
              Shipping: {shipments.map(sh => [sh.carrier, sh.tracking_number && `#${sh.tracking_number}`].filter(Boolean).join(' ')).join('  ·  ')}
            </p>
          )}
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>Printed: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
        </div>
      </div>

      {prods.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No products added to this project.</p>
      ) : (
        <div className="divide-y divide-slate-300 border-y border-slate-300">
          {prods.map(pp => {
            const sizes = (pp.sizes || []).filter(sz => parseFloat(sz.qty) > 0);
            return (
              <div key={pp.id} className="py-2.5" style={{ breakInside: 'avoid' }}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-black text-base">{pp.product_name}</span>
                  <span className="font-bold text-base whitespace-nowrap">{(parseFloat(pp.total_quantity) || 0).toLocaleString()} {pp.unit}</span>
                </div>
                {sizes.length > 0 && (
                  <div className="text-slate-700 mt-0.5">
                    {sizes.map(sz => `${sz.size} × ${parseFloat(sz.qty)}`).join('   ·   ')}
                  </div>
                )}
                {pp.notes && <div className="text-xs text-slate-500 italic mt-0.5">Note: {pp.notes}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between font-black text-base mt-3 pt-2">
        <span>TOTAL</span>
        <span>{prods.length} product{prods.length !== 1 ? 's' : ''} · {grand.toLocaleString()} pcs</span>
      </div>
    </div>
  );
}

// ─── Project Image Uploader ───────────────────────────────────────────────────

function ProjectImageUploader({ images, onSave }) {
  const inputRef  = useRef();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [open, setOpen]           = useState(false);
  const [lightbox, setLightbox]   = useState(null); // image object being viewed
  const [delTarget, setDelTarget] = useState(null); // filename pending delete confirm

  const handleFiles = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    if (images.length + files.length > 10) return alert('Maximum 10 images per project.');
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/uploads', fd);
        return data;
      }));
      setSaving(true);
      await onSave([...images, ...uploaded]);
    } finally {
      setUploading(false);
      setSaving(false);
      e.target.value = '';
    }
  };

  const removeImage = async (img) => {
    await api.delete(`/uploads/${img.filename}`).catch(() => {});
    setSaving(true);
    try { await onSave(images.filter(i => i.filename !== img.filename)); }
    finally { setSaving(false); }
  };

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${images.length > 0 ? 'border-indigo-100' : 'border-slate-200'}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${images.length > 0 ? 'bg-indigo-50' : 'bg-slate-100'}`}>
            <ImagePlus size={14} className={images.length > 0 ? 'text-indigo-600' : 'text-slate-400'} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-slate-900 text-sm">Final Designs</p>
            <p className="text-xs text-slate-400">
              {images.length === 0 ? 'Approved artwork — prints on Cutting / Stitching / Press & Pack' : `${images.length} design${images.length !== 1 ? 's' : ''} · prints on Cutting / Stitching / Press & Pack`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {images.length > 0 && (
            <span className="text-2xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{images.length}</span>
          )}
          {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {/* Existing images */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {images.map((img, i) => (
                <div key={img.filename || i} className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style={{ width: 120, height: 120 }}>
                  <button type="button" onClick={() => setLightbox(img)} className="w-full h-full cursor-zoom-in">
                    <img src={imgUrl(img.url)} alt={img.originalName} className="w-full h-full object-contain" />
                  </button>
                  {/* Delete — hover reveal, two-step confirm */}
                  {delTarget === (img.filename || i) ? (
                    <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                      <p className="text-2xs font-semibold text-slate-700">Delete this tech pack?</p>
                      <div className="flex gap-1.5">
                        <button onClick={() => { removeImage(img); setDelTarget(null); }}
                          className="px-2 py-1 text-2xs bg-rose-600 text-white rounded-lg font-semibold">Delete</button>
                        <button onClick={() => setDelTarget(null)}
                          className="px-2 py-1 text-2xs border border-slate-200 rounded-lg text-slate-500">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDelTarget(img.filename || i)}
                      title="Remove"
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 border border-slate-200 text-slate-500 hover:text-rose-600 rounded-lg p-1 shadow-sm">
                      <Trash2 size={11} />
                    </button>
                  )}
                  <p className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-2xs px-1.5 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{img.originalName}</p>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          {images.length < 10 && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || saving}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 flex flex-col items-center justify-center gap-2 text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-200 disabled:opacity-60">
                <ImagePlus size={20} />
                <span>
                  {uploading ? 'Uploading…' : saving ? 'Saving…' : `Add images (${images.length}/10) — JPG, PNG, PDF`}
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFiles}
              />
            </>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 rounded-full p-2">
            <X size={18} />
          </button>
          <img src={imgUrl(lightbox.url)} alt={lightbox.originalName || ''}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()} />
          {lightbox.originalName && (
            <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-sm">{lightbox.originalName}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Project Detail ───────────────────────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Products', 'Expenses', 'Shipping'];

// ─── Invoice → Products sync banner ──────────────────────────────────────────
// Shows when the linked invoice has line items that aren't in the project yet.
function InvoiceSyncBanner({ project, catalogProducts, onReload, onItemsLoaded }) {
  const [invoices, setInvoices]     = useState([]);
  const [invId, setInvId]           = useState(project.invoice_id || '');
  const [invItems, setInvItems]     = useState(null);
  const [syncing, setSyncing]       = useState(false);
  const [deselected, setDeselected] = useState(() => new Set()); // line indices the user unticked

  // Related invoices only: must have line items; scoped to the project's client
  // (derived from the linked invoice when the project has no client set)
  useEffect(() => {
    api.get('/invoices').then(r => {
      const all = Array.isArray(r.data) ? r.data : [];
      const hasItems = i => {
        let items = i.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        return Array.isArray(items) && items.length > 0;
      };
      let clientId = project.client_id;
      if (!clientId && project.invoice_id) {
        clientId = all.find(i => String(i.id) === String(project.invoice_id))?.client_id;
      }
      let mine = all.filter(hasItems);
      if (clientId) mine = mine.filter(i => i.client_id === clientId);
      // Always keep the linked invoice in the list
      if (project.invoice_id && !mine.find(i => String(i.id) === String(project.invoice_id))) {
        const linked = all.find(i => String(i.id) === String(project.invoice_id));
        if (linked) mine.unshift(linked);
      }
      setInvoices(mine);
    }).catch(() => {});
  }, [project.client_id, project.invoice_id]);

  // Items of the selected invoice
  useEffect(() => {
    if (!invId) { setInvItems(null); onItemsLoaded?.([]); return; }
    api.get(`/invoices/${invId}`)
      .then(r => {
        let items = r.data.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
        items = Array.isArray(items) ? items : [];
        setInvItems(items);
        setDeselected(new Set());
        onItemsLoaded?.(items.map(it => (it.name || it.description || '').trim()).filter(Boolean));
      })
      .catch(() => { setInvItems(null); onItemsLoaded?.([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invId]);

  if (invoices.length === 0 && !project.invoice_id) return null;

  const itemName = it => (it.name || it.description || '').trim();
  // Count how many project products already carry each name, so we can mark
  // exactly that many invoice lines as "already added" (not every line that
  // happens to share a name — an invoice with 2× "MMA Shorts" and a project
  // with 1× "MMA Shorts" still has one line left to sync).
  const remaining = {};
  for (const p of (project.products || [])) {
    const k = (p.product_name || '').trim().toLowerCase();
    if (k) remaining[k] = (remaining[k] || 0) + 1;
  }
  const lines = (invItems || [])
    .map((it, idx) => ({ it, idx, name: itemName(it), qty: parseFloat(it.quantity) || 0 }))
    .filter(l => l.name)
    .map(l => {
      const k = l.name.toLowerCase();
      const alreadyIn = (remaining[k] || 0) > 0;
      if (alreadyIn) remaining[k] -= 1;
      return { ...l, alreadyIn };
    });
  const syncable = lines.filter(l => !l.alreadyIn);
  const selected = syncable.filter(l => !deselected.has(l.idx));

  function toggle(idx) {
    setDeselected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function sync() {
    if (selected.length === 0) return;
    setSyncing(true);
    try {
      for (const l of selected) {
        const cat = catalogProducts.find(p => (p.name||'').trim().toLowerCase() === l.name.toLowerCase());
        await api.post(`/projects/${project.id}/products`, {
          product_id:     cat?.id || '',
          product_name:   l.name,
          unit:           cat?.unit || 'pcs',
          notes:          l.it.name ? (l.it.description || '') : '',
          sizes:          l.qty > 0 ? [{ size: 'QTY', qty: l.qty }] : [],
          total_quantity: l.qty,
          fabrics: [], costs: [], external_costs: [],
        });
      }
      await onReload();
    } finally { setSyncing(false); }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Receipt size={14} className="text-indigo-500 flex-shrink-0" />
          <span className="text-xs text-indigo-700 font-semibold">Sync products from invoice</span>
          <select value={invId || ''} onChange={e => { setInvId(e.target.value); setDeselected(new Set()); }}
            className="border border-indigo-200 bg-white rounded-lg px-2 py-1 text-xs font-mono outline-none focus:border-indigo-400 cursor-pointer max-w-[220px]">
            <option value="">— Select invoice —</option>
            {invoices.map(i => (
              <option key={i.id} value={i.id}>
                {i.number}{String(i.id) === String(project.invoice_id) ? ' ★' : ''}{i.client_name ? ` — ${i.client_name}` : ''}
              </option>
            ))}
          </select>
          {invId && invItems && syncable.length === 0 && lines.length > 0 && (
            <span className="text-2xs font-semibold text-emerald-600">✓ All {lines.length} invoice lines are already in this project</span>
          )}
          {invId && invItems && syncable.length > 0 && (
            <span className="text-2xs text-indigo-500">{selected.length} of {syncable.length} selected · tap to toggle</span>
          )}
        </div>
        {syncable.length > 0 && (
          <button onClick={sync} disabled={syncing || selected.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex-shrink-0">
            {syncing
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Adding…</>
              : <><Wand2 size={12} /> Add {selected.length} Selected</>}
          </button>
        )}
      </div>
      {invId && invItems && lines.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {lines.map(l => {
            if (l.alreadyIn) {
              return (
                <span key={l.idx}
                  className="flex items-center gap-1 text-2xs px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-400 font-medium">
                  <Check size={10} className="text-emerald-500" />
                  {l.name}{l.qty > 0 && <span className="text-slate-300"> ×{l.qty}</span>}
                  <span className="text-slate-300">· in project</span>
                </span>
              );
            }
            const on = !deselected.has(l.idx);
            return (
              <button key={l.idx} type="button" onClick={() => toggle(l.idx)}
                className={`flex items-center gap-1 text-2xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                  on ? 'bg-indigo-600 border-indigo-600 text-white'
                     : 'bg-white border-slate-200 text-slate-400 line-through'
                }`}>
                {on && <Check size={10} />}
                {l.name}{l.qty > 0 && <span className={on ? 'text-indigo-200' : 'text-slate-300'}> ×{l.qty}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ projectId, onBack, catalogProducts, currencies, baseCurrency, onProjectUpdated }) {
  const navigate = useNavigate();
  const [project, setProject]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('Overview');
  const [delConf, setDelConf]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [printMode, setPrint]   = useState(null); // 'cutting' | 'stitching' | 'packaging'
  const [addingProduct, setAddingProduct] = useState(false);
  const [invoiceNames, setInvoiceNames]   = useState([]); // product names on the sync-selected invoice
  const printRef = useRef();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}`);
      setProject(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Build a descriptive PDF filename based on printMode + project title
  function getPrintTitle(mode) {
    const base = project?.title || 'Project';
    const labels = {
      summary:   'Project Summary',
      cutting:   'Cutting Hall Order',
      stitching: 'Stitching Order',
      packaging: 'Packaging List',
    };
    return `${base} – ${labels[mode] || mode}`;
  }

  useEffect(() => {
    if (!printMode) return;
    let cancelled = false;

    // Wait until every image inside the print view has finished loading (or
    // errored) before calling print — otherwise the PDF captures blank boxes.
    async function waitForImages() {
      await new Promise(r => setTimeout(r, 80)); // let the DOM paint
      const imgs = printRef.current ? [...printRef.current.querySelectorAll('img')] : [];
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return null;
        return new Promise(res => {
          const done = () => res();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 6000); // hard cap so a broken URL can't hang printing
        });
      }));
    }

    waitForImages().then(() => {
      if (cancelled) return;
      const prevTitle = document.title;
      document.title = getPrintTitle(printMode);
      window.print();
      const handler = () => { document.title = prevTitle; setPrint(null); };
      window.addEventListener('afterprint', handler, { once: true });
    });

    return () => { cancelled = true; };
  }, [printMode]);

  async function handleSaveProduct(pp, form) {
    if (pp.id) {
      await api.put(`/projects/${projectId}/products/${pp.id}`, form);
    } else {
      await api.post(`/projects/${projectId}/products`, form);
      setAddingProduct(false);
    }
    await load();
  }

  async function handleRemoveProduct(ppId) {
    await api.delete(`/projects/${projectId}/products/${ppId}`);
    await load();
  }

  async function handleToggleStatus() {
    await api.put(`/projects/${projectId}/status`, { status: project.status === 'completed' ? 'active' : 'completed' });
    await load();
    onProjectUpdated?.();
  }

  // All spending is entered on the Expenses screen — open it pre-set to this project
  const addExpense = () => navigate(`/expenses/new?project=${projectId}`);

  async function handleSaveImages(images) {
    await api.put(`/projects/${projectId}/images`, { images });
    await load();
  }

  async function handleDelete() {
    setDeleting(true);
    await api.delete(`/projects/${projectId}`);
    onProjectUpdated?.();
    onBack();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return (
    <div className="text-center py-32 text-slate-500">Project not found.</div>
  );

  const fin = calcProject(project, currencies);
  // fmt() converts a PKR amount to the selected base currency for display
  const fmt = makeFormatter(currencies, baseCurrency);

  // ── Print overlay ──────────────────────────────────────────────────────────
  if (printMode) {
    return (
      <>
        <div className="fixed inset-0 z-[200] bg-white overflow-auto print:relative print:inset-auto" ref={printRef}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 print:hidden">
            <button onClick={() => setPrint(null)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <X size={16} /> Close Preview
            </button>
            <span className="text-slate-300">|</span>
            <span className="text-sm font-medium text-slate-700">
              {printMode === 'cutting' ? 'Cutting Hall Order' : printMode === 'stitching' ? 'Stitching Order' : printMode === 'summary' ? 'Project Summary' : 'Packaging List'}
            </span>
            <button onClick={() => {
                const prevTitle = document.title;
                document.title = getPrintTitle(printMode);
                window.print();
                window.addEventListener('afterprint', () => { document.title = prevTitle; }, { once: true });
              }}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              <Printer size={14} /> Print
            </button>
          </div>
          {printMode === 'summary'    && <PrintSummary   project={project} fin={fin} />}
          {printMode === 'cutting'    && <PrintCutting   project={project} />}
          {printMode === 'stitching'  && <PrintStitching project={project} />}
          {printMode === 'packaging'  && <PrintPackaging project={project} />}
        </div>
      </>
    );
  }

  return (
    <div>
      {/* Header — title, print docs, status & actions on one row */}
      <div className="flex items-center gap-3 min-w-0 flex-wrap mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors flex-shrink-0">
          <ArrowLeft size={16} /> Projects
        </button>
        <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
        <h1 className="text-lg font-bold text-slate-900 truncate flex-1 min-w-[140px]">{project.title}</h1>
        {/* Print docs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide order-last w-full sm:order-none sm:w-auto">
          <button onClick={() => setPrint('summary')}
            className="flex items-center gap-1 px-2.5 py-1 text-2xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold transition-colors shadow-sm whitespace-nowrap flex-shrink-0">
            <FileImage size={11} /> Summary
          </button>
          <button onClick={() => setPrint('cutting')}
            className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-semibold transition-colors whitespace-nowrap flex-shrink-0">
            <Scissors size={11} /> Cutting
          </button>
          <button onClick={() => setPrint('stitching')}
            className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-semibold transition-colors whitespace-nowrap flex-shrink-0">
            <Shirt size={11} /> Stitching
          </button>
          <button onClick={() => setPrint('packaging')}
            className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-amber-200 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 font-semibold transition-colors whitespace-nowrap flex-shrink-0">
            <PackageOpen size={11} /> Packaging
          </button>
        </div>
        <StatusBadge status={project.status} />
        <button onClick={handleToggleStatus}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
            project.status === 'completed'
              ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
              : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
          {project.status === 'completed' ? 'Reopen' : <><CheckCircle2 size={13} /> Mark completed</>}
        </button>
        <button onClick={() => navigate(`/projects/${project.id}/edit`)}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
          <Pencil size={15} />
        </button>
        {!delConf ? (
          <button onClick={() => setDelConf(true)}
            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
            <Trash2 size={15} />
          </button>
        ) : (
          <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
            <span className="text-xs text-rose-600">Delete project?</span>
            <button onClick={handleDelete} disabled={deleting}
              className="text-xs text-rose-600 font-bold px-2 hover:text-rose-800">{deleting ? '…' : 'Yes'}</button>
            <button onClick={() => setDelConf(false)} className="text-xs text-slate-400 px-1">No</button>
          </div>
        )}
      </div>

      {/* ── Compact financial strip ── */}
      {(() => {
        const prods       = project.products || [];
        const totalQtyAll = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity)||0), 0);
        const costPcAfter = totalQtyAll > 0 ? fin.totalExpense / totalQtyAll : 0;
        const projProfit  = fin.profit >= 0;
        const items = [
          { label: 'Cost',     val: fmt(fin.totalExpense), dot: 'bg-rose-500',    cls: 'text-slate-800' },
          { label: 'Received', val: fmt(fin.received),     dot: 'bg-emerald-500', cls: 'text-slate-800' },
          { label: projProfit ? 'Profit' : 'Loss',
            val: `${projProfit ? '' : '−'}${fmt(Math.abs(fin.profit))}`,
            sub: fin.received > 0 ? `${((fin.profit / fin.received) * 100).toFixed(1)}%` : null,
            dot: projProfit ? 'bg-amber-500' : 'bg-rose-600',
            cls: projProfit ? 'text-amber-600' : 'text-rose-600' },
          costPcAfter > 0 && { label: 'Cost/pc', val: fmt(costPcAfter), dot: 'bg-indigo-400', cls: 'text-slate-800' },
        ].filter(Boolean);
        return (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {items.map(it => (
                <div key={it.label} className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.dot}`} />
                  <span className="text-2xs text-slate-400 font-medium uppercase tracking-wide whitespace-nowrap">{it.label}</span>
                  <span className={`text-xs sm:text-sm font-bold whitespace-nowrap ${it.cls}`}>{it.val}</span>
                  {it.sub && <span className="text-2xs text-slate-400 whitespace-nowrap">({it.sub})</span>}
                </div>
              ))}
            </div>

            {/* Client + invoice inline */}
            {(project.client_name || project.invoice_id || parseFloat(project.amount_received) > 0) && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 pt-2 border-t border-slate-100">
                {project.client_name && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                    <User size={11} className="text-slate-400 flex-shrink-0" />
                    <span className="font-semibold truncate">{project.client_name}</span>
                    {project.client_company && <span className="text-slate-400 truncate hidden sm:inline">· {project.client_company}</span>}
                    {project.client_phone && <span className="text-slate-400 hidden md:inline">· {project.client_phone}</span>}
                  </span>
                )}
                {project.invoice_id ? (() => {
                  const cur = project.invoice_currency;
                  const fx  = cur && cur !== 'PKR';
                  const inv = v => fx ? `${cur} ${(parseFloat(v)||0).toLocaleString()}` : pkr(v);
                  const due = (parseFloat(project.invoice_total)||0) - (parseFloat(project.invoice_amount_paid)||0);
                  return (
                    <span className="flex items-center gap-1.5 text-xs min-w-0">
                      <Receipt size={11} className="text-slate-400 flex-shrink-0" />
                      <button type="button" onClick={() => navigate(`/invoices?view=${project.invoice_id}`)}
                        className="font-mono font-semibold text-indigo-700 hover:underline">{project.invoice_number}</button>
                      <span className="text-slate-500">{inv(project.invoice_total)}</span>
                      {due > 0
                        ? <span className="font-semibold text-rose-500">Due {inv(due)}</span>
                        : <span className="font-semibold text-emerald-600">✓ Paid</span>}
                    </span>
                  );
                })() : parseFloat(project.amount_received) > 0 && (
                  <span className="flex items-center gap-1.5 text-xs">
                    <Receipt size={11} className="text-slate-400" />
                    <span className="text-slate-500">Received</span>
                    <span className="font-semibold text-emerald-600">{fmt(toPKR(project.amount_received, project.currency || 'PKR', currencies))}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 overflow-x-auto scrollbar-hide">
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg font-medium transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{t}</button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'Overview' && (() => {
        return (
          <div className="space-y-5">

            {/* ── Spending breakdown (from the expenses charged to this project) ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Spending Breakdown</p>
                </div>
                <button onClick={addExpense}
                  className="flex items-center gap-1 text-xs font-semibold text-orange-600 border border-orange-200 bg-orange-50 px-2.5 py-1 rounded-lg hover:bg-orange-100 transition-colors">
                  <Plus size={12} /> Add expense
                </button>
              </div>
              {fin.totalExpense > 0 ? (
                <div className="space-y-3.5">
                  {fin.byCategory.map(({ label, total, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-500 font-medium">{label}</span>
                        <span className="font-bold text-slate-800">{fmt(total)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, (total / fin.totalExpense) * 100).toFixed(1)}%`, background: color }} />
                      </div>
                      <p className="text-2xs text-slate-400 mt-1 text-right">{((total / fin.totalExpense) * 100).toFixed(1)}%</p>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Cost</span>
                    <span className="text-base font-black text-rose-600">{fmt(fin.totalExpense)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No expenses charged to this project yet — add them on the Expenses screen and pick this project.</p>
              )}
            </div>

            {/* Notes */}
            {project.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{project.notes}</p>
              </div>
            )}

            {/* Tech Pack / Reference Images */}
            <ProjectImageUploader
              images={Array.isArray(project.images) ? project.images : []}
              onSave={handleSaveImages}
            />

          </div>
        );
      })()}

      {/* ── Products Tab ── */}
      {tab === 'Products' && (
        <div className="space-y-4">
          <InvoiceSyncBanner project={project} catalogProducts={catalogProducts} onReload={load} onItemsLoaded={setInvoiceNames} />
          {!addingProduct && project.products.length > 0 && (
            <div className="flex justify-end">
              <button onClick={() => setAddingProduct(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors">
                <Plus size={13} /> Add Product
              </button>
            </div>
          )}
          {project.products.map(pp => (
            <ProductLine key={pp.id}
              pp={pp}
              catalogProducts={catalogProducts}
              invoiceNames={invoiceNames}
              onSave={form => handleSaveProduct(pp, form)}
              onRemove={() => handleRemoveProduct(pp.id)}
            />
          ))}

          {addingProduct && (
            <ProductLine
              pp={EMPTY_PP}
              catalogProducts={catalogProducts}
              invoiceNames={invoiceNames}
              onSave={form => handleSaveProduct({}, form)}
              onRemove={() => setAddingProduct(false)}
            />
          )}

          {!addingProduct && (
            <button onClick={() => setAddingProduct(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 transition-colors text-sm font-semibold">
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      )}

      {/* ── Expenses Tab — everything charged to this project on the Expenses screen ── */}
      {tab === 'Expenses' && (
        <ProjectExpensesTab project={project} fmt={fmt} onAdd={addExpense}
          onOpen={() => navigate(`/expenses?filter=${projectId}`)}
          onChanged={async () => { await load(); onProjectUpdated?.(); }} />
      )}

      {/* ── Shipping Tab — shipping agent + tracking number ── */}
      {tab === 'Shipping' && (
        <ShippingTab project={project} onReload={load} />
      )}

    </div>
  );
}

// ─── Project rows (list) ──────────────────────────────────────────────────────

// Cost = the expenses charged to the project; profit = received − cost.
function ProjectMoney({ project }) {
  const cost     = project.fin_total_expense ?? 0;
  const received = project.fin_received      ?? 0;
  const profit   = project.fin_net           ?? 0;
  return (
    <div className="grid grid-cols-3 sm:flex sm:items-center gap-x-4 gap-y-1 text-xs flex-shrink-0">
      <span className="text-slate-400">Cost <span className="font-semibold text-slate-700">{pkr(cost)}</span></span>
      <span className="text-slate-400">Received <span className="font-semibold text-emerald-600">{pkr(received)}</span></span>
      <span className="text-slate-400">Profit <span className={`font-bold ${profit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{pkr(profit)}</span></span>
    </div>
  );
}

function ProjectRow({ project, onClick }) {
  return (
    <div onClick={onClick}
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer group transition-colors last:border-b-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{project.title}</p>
          <p className="text-xs text-slate-400 truncate">
            {project.client_name ?? 'No client'}{project.client_company ? ` · ${project.client_company}` : ''}
            {' · '}{fmtDate(project.created_at)}
            {project.invoice_number ? ` · ${project.invoice_number}` : ''}
          </p>
        </div>
      </div>
      <ProjectMoney project={project} />
    </div>
  );
}

// completed_at is a full "YYYY-MM-DD HH:MM:SS" timestamp — parse it directly.
const fmtCompletedDate = d => {
  if (!d) return '—';
  const dt = new Date(d.includes('T') ? d : d.replace(' ', 'T'));
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function CompletedProjectRow({ project, onClick }) {
  return (
    <div onClick={onClick}
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer group transition-colors last:border-b-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{project.title}</p>
          <p className="text-xs text-slate-400 truncate">
            {project.client_name ?? 'No client'}{project.client_company ? ` · ${project.client_company}` : ''}
            {' · '}Completed {fmtCompletedDate(project.completed_at)}
          </p>
        </div>
      </div>
      <ProjectMoney project={project} />
    </div>
  );
}

// ─── Expenses Tab — the costs charged to this project ─────────────────────────
// Read-only here: expenses are entered and edited on the Expenses screen.

function ProjectExpensesTab({ project, fmt = pkr, onAdd, onOpen, onChanged }) {
  const expenses = Array.isArray(project.expenses) ? project.expenses : [];
  const total    = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  // Edit opens the same form as the Expenses screen; delete asks first
  const [editing, setEditing]       = useState(null);  // expense being edited
  const [delTarget, setDelTarget]   = useState(null);  // expense id pending delete
  const [deletingId, setDeletingId] = useState(null);
  const [lists, setLists]           = useState({ categories: [], projects: [] });

  async function openEdit(e) {
    const [cats, projs] = await Promise.all([
      api.get('/expenses/categories').catch(() => ({ data: [] })),
      api.get('/projects').catch(() => ({ data: [] })),
    ]);
    setLists({ categories: Array.isArray(cats.data) ? cats.data : [], projects: Array.isArray(projs.data) ? projs.data : [] });
    setDelTarget(null);
    setEditing(e);
  }

  async function confirmDelete(id) {
    setDeletingId(id);
    try {
      await api.delete(`/expenses/${id}`);
      setDelTarget(null);
      await onChanged?.();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-orange-500" />
          <h3 className="font-semibold text-slate-900">Expenses</h3>
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">{expenses.length}</span>
          {total > 0 && <span className="text-sm font-bold text-rose-600 ml-1">{fmt(total)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {expenses.length > 0 && (
            <button onClick={onOpen}
              className="text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors">
              Edit in Expenses
            </button>
          )}
          <button onClick={onAdd}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-500 px-3 py-1.5 rounded-xl hover:bg-orange-600 transition-colors">
            <Plus size={13} /> Add expense
          </button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-12 text-center px-6">
          <Receipt size={28} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500 font-medium">No expenses charged to this project yet</p>
          <p className="text-xs text-slate-400 mt-1">Fabric, stitching, printing… record each payment once on the Expenses screen and pick this project. Shipping costs go in the Shipping tab.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {expenses.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.category_color || '#94a3b8' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{e.title}</p>
                <p className="text-xs text-slate-400 truncate">
                  {fmtDate(e.expense_date)}
                  {e.category_name ? ` · ${e.category_name}` : ''}
                  {e.paid_to ? ` · to ${e.paid_to}` : ''}
                  {e.payment_method ? ` · ${e.payment_method}` : ''}
                </p>
              </div>
              <span className="text-sm font-bold text-slate-800 flex-shrink-0">{fmt(e.amount)}</span>
              {delTarget === e.id ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs font-medium text-rose-600">Delete?</span>
                  <button onClick={() => confirmDelete(e.id)} disabled={deletingId === e.id}
                    className="px-2 py-1 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium disabled:opacity-60">
                    {deletingId === e.id ? 'Deleting…' : 'Delete'}
                  </button>
                  <button onClick={() => setDelTarget(null)}
                    className="px-2 py-1 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-0.5 flex-shrink-0">
                  <button onClick={() => openEdit(e)} title="Edit"
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setDelTarget(e.id)} title="Delete"
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total cost</span>
            <span className="text-sm font-black text-rose-600">{fmt(total)}</span>
          </div>
        </div>
      )}

      {editing && (
        <ExpenseModal
          expense={editing}
          categories={lists.categories}
          projects={lists.projects}
          onClose={() => setEditing(null)}
          onSave={async () => { setEditing(null); await onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ─── Shipping Tab — agent, tracking number and shipping cost ──────────────────
// Shipping costs are entered here, on each shipment (one or more payments to the
// agent), and count towards the project's cost — not on the Expenses screen.

// agent: a saved shipping agent's id, or NEW_AGENT to type a new agency name
const NEW_AGENT    = '__new__';
const SHIP_METHODS = ['cash', 'bank transfer', 'cheque', 'online', 'card'];
const today        = () => new Date().toISOString().slice(0, 10);
const BLANK_SHIP   = { agent: '', newAgentName: '', carrier: '', tracking_number: '', shipping_date: '', notes: '',
                       cost: '', cost_method: 'cash' };
const BLANK_COST   = { amount: '', cost_date: '', payment_method: 'cash', notes: '' };

function ShippingTab({ project, onReload }) {
  const navigate = useNavigate();
  const rows = Array.isArray(project.shipping) ? project.shipping : [];
  const shippingTotal = rows.reduce((t, r) => t + (parseFloat(r.cost_total) || 0), 0);
  const [agents, setAgents]   = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | shipment id
  const [form, setForm]       = useState(BLANK_SHIP);
  const [costEdit, setCostEdit] = useState(null); // { shipId, costId|null }
  const [costForm, setCostForm] = useState(BLANK_COST);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setC = (k, v) => setCostForm(f => ({ ...f, [k]: v }));

  const loadAgents = useCallback(() => {
    api.get('/shipping-agents').then(r => setAgents(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);
  useEffect(() => { loadAgents(); }, [loadAgents]);

  function startNew() {
    // Default to the agent used last on this project, if any
    const last = rows.find(r => r.agent_id);
    setForm({ ...BLANK_SHIP, agent: last ? String(last.agent_id) : '', shipping_date: today() });
    setEditing('new'); setCostEdit(null); setError('');
  }
  function startEdit(r) {
    setForm({ ...BLANK_SHIP, agent: r.agent_id ? String(r.agent_id) : '', carrier: r.carrier || '',
              tracking_number: r.tracking_number || '', shipping_date: r.shipping_date || '', notes: r.notes || '' });
    setEditing(r.id); setCostEdit(null); setError('');
  }
  function startCost(r, c = null) {
    setCostForm(c ? { amount: String(c.amount), cost_date: c.cost_date || '', payment_method: c.payment_method || 'cash', notes: c.notes || '' }
                  : { ...BLANK_COST, cost_date: today() });
    setCostEdit({ shipId: r.id, costId: c ? c.id : null }); setEditing(null); setError('');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      let agentId = form.agent && form.agent !== NEW_AGENT ? parseInt(form.agent) : null;
      if (form.agent === NEW_AGENT) {
        if (!form.newAgentName.trim()) { setError('Enter the new agency name.'); return; }
        const { data } = await api.post('/shipping-agents', { name: form.newAgentName.trim() });
        agentId = data.id;
        loadAgents();
      }
      // An old shipment may only have a typed name (agent since deleted) — keep it
      if (!agentId && !form.carrier.trim()) { setError('Choose a shipping agent.'); return; }
      const payload = { agent_id: agentId, carrier: form.carrier, tracking_number: form.tracking_number,
                        shipping_date: form.shipping_date, notes: form.notes };
      if (editing === 'new') {
        payload.cost = { amount: form.cost, cost_date: form.shipping_date || today(), payment_method: form.cost_method };
        await api.post(`/projects/${project.id}/shipping`, payload);
      } else {
        await api.put(`/projects/${project.id}/shipping/${editing}`, payload);
      }
      setEditing(null);
      await onReload();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save.');
    } finally { setSaving(false); }
  }

  async function saveCost() {
    if (!(parseFloat(costForm.amount) > 0)) { setError('Enter the shipping cost.'); return; }
    setSaving(true); setError('');
    try {
      const base = `/projects/${project.id}/shipping/${costEdit.shipId}/costs`;
      if (costEdit.costId) await api.put(`${base}/${costEdit.costId}`, costForm);
      else await api.post(base, costForm);
      setCostEdit(null);
      await onReload();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save.');
    } finally { setSaving(false); }
  }

  async function removeCost(r, c) {
    if (!confirm(`Remove this shipping cost of ${pkr(c.amount)}?`)) return;
    await api.delete(`/projects/${project.id}/shipping/${r.id}/costs/${c.id}`);
    await onReload();
  }

  async function remove(r) {
    const msg = r.cost_total > 0 ? `Remove this shipment and its ${pkr(r.cost_total)} shipping cost?` : 'Remove this shipment?';
    if (!confirm(msg)) return;
    await api.delete(`/projects/${project.id}/shipping/${r.id}`);
    await onReload();
  }

  const inputCls2 = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';
  const formRow = (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            Shipping Agent *
            <button type="button" onClick={() => navigate('/expenses?tab=shipping')} className="font-medium text-indigo-600 hover:underline">Manage</button>
          </label>
          <select value={form.agent} onChange={e => set('agent', e.target.value)} className={inputCls2} autoFocus>
            <option value="">{form.carrier && !form.agent ? `${form.carrier} (not in agents list)` : '— Choose agent —'}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value={NEW_AGENT}>+ New agent…</option>
          </select>
          {form.agent === NEW_AGENT && (
            <input value={form.newAgentName} onChange={e => set('newAgentName', e.target.value)}
              placeholder="New agency name" className={`${inputCls2} mt-2`} autoFocus />
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Tracking Number</label>
          <input value={form.tracking_number} onChange={e => set('tracking_number', e.target.value)} placeholder="AWB / tracking no." className={`${inputCls2} font-mono`} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
          <input type="date" value={form.shipping_date} onChange={e => set('shipping_date', e.target.value)} className={inputCls2} />
        </div>
      </div>
      {editing === 'new' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Shipping Cost (₨)</label>
            <input type="number" min="0" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0 — add later if not paid yet" className={inputCls2} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Method</label>
            <select value={form.cost_method} onChange={e => set('cost_method', e.target.value)} className={`${inputCls2} capitalize`}>
              {SHIP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}
      <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes (optional)" className={inputCls2} />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white">Cancel</button>
      </div>
    </div>
  );

  const costRow = (
    <div className="flex flex-wrap items-end gap-2 bg-sky-50 border border-sky-200 rounded-xl p-2.5">
      <div className="w-32">
        <label className="block text-2xs font-semibold text-slate-500 mb-0.5">Amount (₨)</label>
        <input type="number" min="0" value={costForm.amount} onChange={e => setC('amount', e.target.value)} className={inputCls2} autoFocus />
      </div>
      <div className="w-36">
        <label className="block text-2xs font-semibold text-slate-500 mb-0.5">Paid on</label>
        <input type="date" value={costForm.cost_date} onChange={e => setC('cost_date', e.target.value)} className={inputCls2} />
      </div>
      <div className="w-36">
        <label className="block text-2xs font-semibold text-slate-500 mb-0.5">Method</label>
        <select value={costForm.payment_method} onChange={e => setC('payment_method', e.target.value)} className={`${inputCls2} capitalize`}>
          {SHIP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[120px]">
        <label className="block text-2xs font-semibold text-slate-500 mb-0.5">Note</label>
        <input value={costForm.notes} onChange={e => setC('notes', e.target.value)} placeholder="optional" className={inputCls2} />
      </div>
      <button onClick={saveCost} disabled={saving}
        className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setCostEdit(null)} className="px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-white">Cancel</button>
      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-sky-500" />
          <h3 className="font-semibold text-slate-900">Shipping</h3>
          {rows.length > 0 && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">{rows.length}</span>}
          {shippingTotal > 0 && <span className="text-sm font-bold text-rose-600 ml-1">{pkr(shippingTotal)}</span>}
        </div>
        {editing === null && (
          <button onClick={startNew}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-500 px-3 py-1.5 rounded-xl hover:bg-sky-600 transition-colors">
            <Plus size={13} /> Add shipment
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">Shipping agent, tracking number and shipping cost. Shipping costs are added to this project's cost.</p>

      {editing === 'new' && formRow}

      {rows.length === 0 && editing === null ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-10 text-center">
          <Truck size={26} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No shipments yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => editing === r.id ? <div key={r.id}>{formRow}</div> : (
            <div key={r.id} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-sky-50 rounded-xl flex items-center justify-center flex-shrink-0"><Truck size={14} className="text-sky-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.carrier || 'Shipping agent'}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {r.tracking_number ? <span className="font-mono">#{r.tracking_number}</span> : <span className="italic text-slate-400">No tracking number</span>}
                    {r.shipping_date ? ` · ${fmtDate(r.shipping_date)}` : ''}
                    {r.agent_phone ? ` · ${r.agent_phone}` : ''}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${r.cost_total > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                  {r.cost_total > 0 ? pkr(r.cost_total) : 'No cost'}
                </span>
                <button onClick={() => startEdit(r)} title="Edit shipment" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil size={13} /></button>
                <button onClick={() => remove(r)} title="Remove shipment" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={13} /></button>
              </div>

              {/* Shipping costs (payments to the agent for this shipment) */}
              <div className="ml-11 space-y-1">
                {(r.costs || []).map(c => costEdit?.costId === c.id ? <div key={c.id}>{costRow}</div> : (
                  <div key={c.id} className="flex items-center gap-2 text-xs text-slate-600 group">
                    <span className="w-24 text-slate-400">{fmtDate(c.cost_date)}</span>
                    <span className="font-semibold text-slate-800 w-24 text-right">{pkr(c.amount)}</span>
                    <span className="capitalize text-slate-400">{c.payment_method}</span>
                    {c.notes && <span className="text-slate-400 truncate">· {c.notes}</span>}
                    <span className="ml-auto flex gap-0.5 opacity-60 group-hover:opacity-100">
                      <button onClick={() => startCost(r, c)} title="Edit cost" className="p-1 text-slate-400 hover:text-indigo-600 rounded"><Pencil size={11} /></button>
                      <button onClick={() => removeCost(r, c)} title="Remove cost" className="p-1 text-slate-400 hover:text-rose-600 rounded"><Trash2 size={11} /></button>
                    </span>
                  </div>
                ))}
                {costEdit && costEdit.shipId === r.id && !costEdit.costId ? costRow : (
                  <button onClick={() => startCost(r)} className="flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700">
                    <Plus size={11} /> Add shipping cost
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects]       = useState([]);
  const [loading,  setLoading]        = useState(true);
  const [view,     setView]           = useState('list');  // 'list' | 'detail'
  const [selectedId, setSelectedId]   = useState(null);

  // Clicking "Projects" in the sidebar while a project is open should return to
  // the list. Detail is internal state, so react to any fresh navigation that
  // lands on /projects — except /projects?open=ID, which opens that project
  // (used when coming back from adding an expense on the Expenses screen).
  useEffect(() => {
    const open = parseInt(new URLSearchParams(location.search).get('open'));
    if (open) { setSelectedId(open); setView('detail'); }
    else { setView('list'); setSelectedId(null); }
  }, [location.key, location.search]);
  const [search,   setSearch]         = useState('');
  const [statusFilter, setStatus]     = useState('all');
  const [catalogProducts, setCatalog] = useState([]);
  const [currencies, setCurrencies]   = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('PKR');
  const [showActive,    setShowActive]    = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data);
    } catch { setProjects([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadProjects();
    // Load supporting data in parallel
    Promise.all([
      api.get('/products'),
      api.get('/currencies'),
      api.get('/settings'),
    ]).then(([p, cur, s]) => {
      setCatalog(p.data);
      setCurrencies(Array.isArray(cur.data) ? cur.data : []);
      setBaseCurrency((s.data && s.data.base_currency) || 'PKR');
    }).catch(() => {});
  }, [loadProjects]);

  const filtered = projects.filter(p => {
    if (statusFilter === 'completed' && p.status !== 'completed') return false;
    if (statusFilter === 'active' && p.status === 'completed') return false;
    if (search) {
      const q = search.toLowerCase();
      return [p.title, p.client_name, p.client_company, p.invoice_number].some(f => f?.toLowerCase().includes(q));
    }
    return true;
  });

  if (view === 'detail' && selectedId) {
    return (
      <ProjectDetail
        projectId={selectedId}
        onBack={() => { setView('list'); setSelectedId(null); loadProjects(); if (location.search) navigate('/projects', { replace: true }); }}
        catalogProducts={catalogProducts}
        currencies={currencies}
        baseCurrency={baseCurrency}
        onProjectUpdated={loadProjects}
      />
    );
  }

  const stats = {
    total:     projects.length,
    active:    projects.filter(p => p.status !== 'completed').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 text-sm mt-0.5">Orders, their costs and profit — costs come from Expenses</p>
        </div>
        <button onClick={() => navigate('/projects/new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm w-full sm:w-auto justify-center sm:justify-start">
          <Plus size={16} /> New Project
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[
          { label: 'Total Projects', value: stats.total,     icon: Layers,       color: 'text-indigo-600',  bg: 'bg-indigo-50' },
          { label: 'Active',         value: stats.active,    icon: Flame,        color: 'text-orange-600',  bg: 'bg-orange-50' },
          { label: 'Completed',      value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`${bg} ${color} p-2.5 rounded-xl`}><Icon size={18} /></div>
            <div><p className="text-xl sm:text-2xl font-bold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search projects, clients, invoices…"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white" />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[['all','All'],['active','Active'],['completed','Completed']].map(([v,label]) => (
            <button key={v} onClick={() => setStatus(v)}
              className={`px-3.5 py-1.5 text-sm rounded-lg font-medium transition-all ${
                statusFilter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading projects…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center bg-white border border-slate-200 rounded-2xl">
          <Layers size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">{search || statusFilter !== 'all' ? 'No projects match your filters' : 'No projects yet'}</p>
          <p className="text-slate-400 text-sm mt-1">Click "New Project" to start your first production run</p>
        </div>
      ) : (() => {
        const activeProjects    = filtered.filter(p => p.status !== 'completed');
        const completedProjects = filtered.filter(p => p.status === 'completed');
        const openCard = p => { setSelectedId(p.id); setView('detail'); };

        return (
          <div className="space-y-6">

            {/* ── Active / Running ── */}
            {activeProjects.length > 0 && (
              <div>
                <button
                  onClick={() => setShowActive(v => !v)}
                  className="flex items-center gap-2.5 w-full text-left mb-3 group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0 animate-pulse" />
                    <span className="font-bold text-slate-800 text-sm uppercase tracking-wider">Active</span>
                    <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                      {activeProjects.length}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0">
                    {showActive ? '▲ Hide' : '▼ Show'}
                  </span>
                </button>
                {showActive && (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    {activeProjects.map(p => (
                      <ProjectRow key={p.id} project={p} onClick={() => openCard(p)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Completed ── */}
            {completedProjects.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCompleted(v => !v)}
                  className="flex items-center gap-2.5 w-full text-left mb-3 group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="font-bold text-slate-800 text-sm uppercase tracking-wider">Completed</span>
                    <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                      {completedProjects.length}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0">
                    {showCompleted ? '▲ Hide' : '▼ Show'}
                  </span>
                </button>
                {showCompleted && (() => {
                  // Group by the month each project was actually completed in.
                  // Falls back to updated_at for older rows saved before completed_at existed.
                  const groups = {};
                  for (const p of completedProjects) {
                    const d   = p.completed_at || p.updated_at;
                    const key = d ? d.slice(0, 7) : 'unknown';
                    (groups[key] ??= []).push(p);
                  }
                  const monthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

                  return (
                    <div className="space-y-4">
                      {monthKeys.map(key => {
                        const monthProjects = groups[key];
                        const label = key === 'unknown'
                          ? 'Completion date unknown'
                          : new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        const totals = monthProjects.reduce((acc, p) => ({
                          cost:     acc.cost     + (p.fin_total_expense || 0),
                          received: acc.received + (p.fin_received      || 0),
                          profit:   acc.profit   + (p.fin_net           || 0),
                        }), { cost: 0, received: 0, profit: 0 });

                        const isCollapsed = collapsedMonths.has(key);
                        const toggleMonth = () => setCollapsedMonths(prev => {
                          const next = new Set(prev);
                          next.has(key) ? next.delete(key) : next.add(key);
                          return next;
                        });

                        return (
                          <div key={key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            {/* Month header + overview — click to collapse/expand this month */}
                            <button type="button" onClick={toggleMonth}
                              className="w-full px-4 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left hover:bg-slate-100/70 transition-colors">
                              <div className="flex items-center gap-2">
                                <ChevronDown size={14} className={`text-slate-400 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                                <span className="font-bold text-slate-800 text-sm">{label}</span>
                                <span className="text-2xs bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                                  {monthProjects.length} project{monthProjects.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 sm:flex sm:items-center gap-x-4 gap-y-1 text-xs">
                                <span className="text-slate-400">Cost <span className="font-semibold text-slate-700">{pkr(totals.cost)}</span></span>
                                <span className="text-slate-400">Received <span className="font-semibold text-emerald-600">{pkr(totals.received)}</span></span>
                                <span className="text-slate-400">Profit <span className={`font-bold ${totals.profit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{pkr(totals.profit)}</span></span>
                              </div>
                            </button>
                            {!isCollapsed && monthProjects.map(p => (
                              <CompletedProjectRow key={p.id} project={p} onClick={() => openCard(p)} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        );
      })()}

    </div>
  );
}
