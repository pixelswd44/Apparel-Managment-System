import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, X, ChevronDown, ChevronUp, Trash2, Pencil, Search,
  Package, Users, FileText, Receipt, Check, AlertTriangle,
  Printer, Box, TrendingUp, DollarSign, ArrowLeft,
  Clock, CheckCircle2, Circle, ChevronRight, Save,
  Tag, AlertCircle, PackageOpen, Scissors, Layers,
  ToggleLeft, ToggleRight, Flame, Shirt, Wand2,
  MoreHorizontal, Banknote, Eye, GripVertical,
  Store, Phone, Star, CreditCard, Truck, User, Building2,
  ImagePlus, FileImage,
} from 'lucide-react';
import api, { apiFetch } from '../lib/api';
import { printDoc } from '../lib/printDoc';
import SidePanel from '../components/SidePanel';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const DEFAULT_SIZES  = STANDARD_SIZES.map(s => ({ size: s, qty: 0 }));

const STATUS_CONFIG = {
  planning:    { label: 'Planning',    color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
  cutting:     { label: 'Cutting',     color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  decoration:  { label: 'Decoration',  color: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-500' },
  stitching:   { label: 'Stitching',   color: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  press_pack:  { label: 'Press & Pack',color: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  // Legacy stage keys (existing projects)
  sublimation: { label: 'Sublimation', color: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500' },
  embroidery:  { label: 'Embroidery',  color: 'bg-pink-100 text-pink-700',      dot: 'bg-pink-500' },
  screen_print:{ label: 'Screen Print',color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
  completed:   { label: 'Completed',   color: 'bg-emerald-100 text-emerald-700',dot:'bg-emerald-500' },
};

const STAGE_ICON = {
  cutting:     Scissors,
  decoration:  Wand2,
  stitching:   Shirt,
  press_pack:  PackageOpen,
  // legacy
  sublimation: Flame,
  embroidery:  Layers,
  screen_print:Printer,
};

const STAGE_COLOR = {
  cutting:     'text-blue-600 bg-blue-50',
  decoration:  'text-purple-600 bg-purple-50',
  stitching:   'text-green-600 bg-green-50',
  press_pack:  'text-amber-600 bg-amber-50',
  // legacy
  sublimation: 'text-violet-600 bg-violet-50',
  embroidery:  'text-pink-600 bg-pink-50',
  screen_print:'text-orange-600 bg-orange-50',
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

function calcPP(pp) {
  const qty = parseFloat(pp.total_quantity) || 0;
  // Multi-fabric: sum all fabric rows (new format)
  let fabric = 0;
  if (Array.isArray(pp.fabrics) && pp.fabrics.length > 0) {
    fabric = pp.fabrics.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);
  } else {
    // Legacy single-fabric fields
    fabric = (parseFloat(pp.fabric_per_piece)||0) * (parseFloat(pp.fabric_price_per_unit)||0) * qty;
  }
  const proc = (pp.costs||[]).reduce((s,c) => s + (parseFloat(c.cost_per_piece)||0), 0) * qty;
  const ext  = (pp.external_costs||[]).reduce((s,c) => s + (parseFloat(c.total)||0), 0);
  return { qty, fabric, proc, ext, total: fabric + proc + ext };
}

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

// Compute the true billed amount for a project-vendor record.
// If tasks exist, sum rate×qty dynamically (fixes stale invoice_amount in DB).
// Falls back to stored invoice_amount when there are no tasks.
function pvBilled(pv) {
  const tasks = Array.isArray(pv.tasks) ? pv.tasks : [];
  const tasksTotal = tasks.reduce((s, t) => {
    if (t.type === 'per_piece') return s + (parseFloat(t.agreed)||0) * (parseFloat(t.qty)||0);
    return s + (parseFloat(t.agreed)||0);
  }, 0);
  return tasksTotal > 0 ? tasksTotal : Number(pv.invoice_amount || 0);
}

function calcProject(project, currencies = []) {
  // ── What we committed to spend (total expense) ─────────────────────────────
  const productCost    = (project.products||[]).reduce((s,pp)=>s+calcPP(pp).total, 0);
  const vendorBilled   = (project.vendors||[]).reduce((s,pv)=>s+pvBilled(pv), 0);
  const workerAgreed   = (project.workers||[]).reduce((s,pw)=>s+Number(pw.agreed_amount||0), 0);
  const _ec = Array.isArray(project.extra_costs) ? project.extra_costs
    : (typeof project.extra_costs === 'string' ? (() => { try { return JSON.parse(project.extra_costs); } catch { return []; } })() : []);
  const extraCostTotal = _ec.reduce((s,e)=>s+(parseFloat(e.amount)||0), 0);
  const totalExpense   = productCost + vendorBilled + workerAgreed + extraCostTotal;

  // ── What we have actually paid so far ──────────────────────────────────────
  const vendorPaid  = (project.vendors||[]).reduce((s,pv)=>s+Number(pv.total_paid||0), 0);
  const workerPaid  = (project.workers||[]).reduce((s,pw)=>s+Number(pw.paid_amount||0), 0);
  // Product-level payments (amount_paid fields saved via Costs tab)
  const productPaid = (project.products||[]).reduce((s, pp) => {
    const fabs = migrateFabrics(pp);
    const fp = fabs.reduce((fs, f) => fs + (parseFloat(f.amount_paid)||0), 0);
    const cp = (pp.costs||[]).reduce((cs, c) => cs + (parseFloat(c.amount_paid)||0), 0);
    const ep = (pp.external_costs||[]).reduce((es, e) => es + (parseFloat(e.amount_paid)||0), 0);
    return s + fp + cp + ep;
  }, 0);
  // Extra costs are treated as already paid
  const totalPaid = productPaid + vendorPaid + workerPaid + extraCostTotal;
  const due       = totalExpense - totalPaid;

  // ── Revenue ────────────────────────────────────────────────────────────────
  const receivedCurrency = project.invoice_id
    ? (project.invoice_currency || 'USD')
    : (project.currency || 'PKR');
  const receivedRaw = project.invoice_id
    ? (parseFloat(project.invoice_amount_paid) || 0)
    : (parseFloat(project.amount_received)     || 0);
  const exchangeRate = (project.exchange_rate_actual && project.exchange_rate_actual > 0)
    ? project.exchange_rate_actual
    : getExchangeRate(receivedCurrency, currencies);
  const received = (parseFloat(receivedRaw) || 0) * exchangeRate;

  return {
    // Totals
    totalExpense, totalPaid, due,
    // By category (expense / paid)
    productCost, productPaid,
    vendorBilled, vendorPaid,
    workerAgreed, workerPaid,
    extraCostTotal,
    // Revenue & profit
    received, profit: received - totalExpense,
    receivedRaw, receivedCurrency, exchangeRate,
    // Backward-compat alias
    spent: totalExpense,
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
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planning;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StageDot({ status }) {
  if (status === 'done')        return <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />;
  if (status === 'in_progress') return <Clock        size={16} className="text-blue-500 flex-shrink-0 animate-pulse" />;
  return <Circle size={16} className="text-slate-300 flex-shrink-0" />;
}

// ─── Project Modal (create / edit) ────────────────────────────────────────────

function ProjectModal({ project, clients, invoices, onClose, onSave }) {
  const [form, setForm] = useState({
    title:                project?.title                ?? '',
    client_id:            project?.client_id            ?? '',
    invoice_id:           project?.invoice_id           ?? '',
    currency:             project?.currency             ?? 'PKR',
    amount_received:      project?.amount_received      ?? '',
    exchange_rate_actual: project?.exchange_rate_actual ?? '',
    notes:                project?.notes                ?? '',
    use_invoice:          !!project?.invoice_id,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Filter invoices by selected client
  const clientInvoices = invoices.filter(i =>
    !form.client_id || String(i.client_id) === String(form.client_id)
  );

  async function handleSubmit() {
    if (!form.title.trim()) { setError('Project title is required.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({
        title:                form.title.trim(),
        client_id:            form.client_id || null,
        invoice_id:           form.use_invoice ? (form.invoice_id || null) : null,
        currency:             form.currency,
        amount_received:      form.use_invoice ? 0 : (parseFloat(form.amount_received) || 0),
        exchange_rate_actual: form.use_invoice ? 0 : (parseFloat(form.exchange_rate_actual) || 0),
        notes:                form.notes,
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <SidePanel
      open={true}
      onClose={onClose}
      title={project ? 'Edit Project' : 'New Production Project'}
      subtitle="Fill in the basic details to get started"
      footer={
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      }
    >
        {error && <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

        <div className="space-y-4">
          <Field label="Project Title" required>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className={inputCls} placeholder="e.g. Spring Collection 2026 — XYZ Fashion" autoFocus />
          </Field>

          <Field label="Client">
            <select value={form.client_id} onChange={e => {
              const cid = e.target.value;
              const client = clients.find(c => String(c.id) === cid);
              set('client_id', cid);
              set('invoice_id', '');
              if (client?.currency) set('currency', client.currency);
            }} className={selectCls}>
              <option value="">— No Client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ''}</option>)}
            </select>
          </Field>

          {/* Payment source toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Source</p>
            <div className="flex gap-2">
              {[['false','Manual Entry'],['true','Link Invoice']].map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => { set('use_invoice', v === 'true'); set('invoice_id', ''); set('amount_received', ''); }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    String(form.use_invoice) === v
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-indigo-50'
                  }`}>
                  {String(form.use_invoice) === v && <Check size={11} className="inline mr-1" />}{label}
                </button>
              ))}
            </div>

            {form.use_invoice ? (
              <Field label="Invoice">
                <select value={form.invoice_id} onChange={e => set('invoice_id', e.target.value)} className={selectCls}>
                  <option value="">— Select Invoice —</option>
                  {clientInvoices.map(i => (
                    <option key={i.id} value={i.id}>{i.number} — {i.currency} {(parseFloat(i.total)||0).toLocaleString()}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="space-y-3">
                <Field label="Currency">
                  <select value={form.currency} onChange={e => { set('currency', e.target.value); set('exchange_rate_actual', ''); }} className={selectCls}>
                    {['PKR','USD','EUR','GBP','AED'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label={`Amount Received (${form.currency})`}>
                  <div className="relative">
                    {form.currency === 'PKR' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>}
                    <input type="number" min="0" value={form.amount_received}
                      onChange={e => set('amount_received', e.target.value)}
                      className={`${inputCls} ${form.currency === 'PKR' ? 'pl-7' : ''}`} placeholder="0" />
                  </div>
                </Field>
                {form.currency !== 'PKR' && (
                  <Field label={`Actual Exchange Rate (PKR per 1 ${form.currency})`}>
                    <input type="number" min="0" step="0.01" value={form.exchange_rate_actual}
                      onChange={e => set('exchange_rate_actual', e.target.value)}
                      className={inputCls} placeholder={`e.g. 285 per 1 ${form.currency}`} />
                    {form.exchange_rate_actual > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        You got ₨{parseFloat(form.exchange_rate_actual).toLocaleString()} per 1 {form.currency}
                      </p>
                    )}
                  </Field>
                )}
              </div>
            )}
          </div>

          <Field label="Notes">
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              className={`${inputCls} resize-none`} placeholder="Any special instructions or notes…" />
          </Field>
        </div>
    </SidePanel>
  );
}

// ─── Fabric Inventory Combobox ────────────────────────────────────────────────

const INV_CATEGORIES = ['fabric','trim','accessory','thread','packaging','other'];

function FabricCombobox({ value, inventoryItems, onSelect, onNameChange, onInventoryAdded }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState(value || '');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', category: 'fabric', unit: 'KG', rate: '', qty_total: '' });
  const [saving, setSaving] = useState(false);
  const ref                 = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setAdding(false); }
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = inventoryItems.filter(it =>
    !query.trim() || it.name.toLowerCase().includes(query.toLowerCase())
  );
  const exact          = inventoryItems.find(it => it.name.toLowerCase() === query.trim().toLowerCase());
  const showAddOption  = query.trim().length > 0 && !exact;

  function pick(item) {
    setQuery(item.name);
    setOpen(false);
    setAdding(false);
    onSelect(item);
  }

  function openAddForm() {
    setAdding(true);
    setNewItem({ name: query.trim(), category: 'fabric', unit: 'KG', rate: '', qty_total: '' });
  }

  async function submitNew() {
    if (!newItem.name.trim()) return;
    setSaving(true);
    try {
      const r = await api.post('/inventory', {
        name:      newItem.name.trim(),
        category:  newItem.category,
        unit:      newItem.unit,
        rate:      parseFloat(newItem.rate)      || 0,
        qty_total: parseFloat(newItem.qty_total) || 0,
      });
      const created = r.data;
      setQuery(created.name);
      setOpen(false);
      setAdding(false);
      onSelect(created);
      onInventoryAdded?.();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to add item to inventory');
    } finally { setSaving(false); }
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        placeholder="Search inventory…"
        onFocus={() => setOpen(true)}
        onChange={e => {
          const val = e.target.value;
          setQuery(val);
          setOpen(true);
          setAdding(false);
          const m = inventoryItems.find(it => it.name.toLowerCase() === val.toLowerCase());
          if (m) onSelect(m);
          else   onNameChange(val);
        }}
        className={`w-full border rounded-lg px-2.5 py-2 text-sm outline-none bg-white placeholder:text-slate-300 transition-colors ${
          exact
            ? 'border-emerald-400 bg-emerald-50/40 focus:border-emerald-500'
            : 'border-blue-200 focus:border-blue-400'
        }`}
      />
      {/* Stock badge when matched and closed */}
      {exact && !open && (() => {
        const avail = exact.qty_available ?? Math.max(0, (exact.qty_total||0) - (exact.qty_used||0));
        return (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-emerald-600 font-semibold pointer-events-none select-none whitespace-nowrap">
            ✓ {avail.toLocaleString()} {exact.unit}
          </span>
        );
      })()}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[60] top-full mt-1 left-0 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">

          {/* Item list */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 italic px-4 py-3">No matches in inventory.</p>
            ) : filtered.map(item => {
              const avail      = item.qty_available ?? Math.max(0, (item.qty_total||0) - (item.qty_used||0));
              const isSelected = item.name.toLowerCase() === query.toLowerCase();
              return (
                <button key={item.id} type="button"
                  onMouseDown={e => { e.preventDefault(); pick(item); }}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-indigo-50 ${
                    isSelected ? 'bg-emerald-50 border-l-2 border-emerald-400' : ''
                  }`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-2xs text-slate-400 capitalize">{item.category} · {item.unit}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-bold text-indigo-600">₨{parseFloat(item.rate||0).toLocaleString()}</p>
                    <p className={`text-2xs font-semibold ${avail > 0 ? 'text-emerald-600' : 'text-rose-400'}`}>
                      {avail > 0 ? `${avail.toLocaleString()} ${item.unit}` : 'Out of stock'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* "Add to Inventory" trigger — shown when no exact match */}
          {showAddOption && !adding && (
            <button type="button"
              onMouseDown={e => { e.preventDefault(); openAddForm(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 border-t border-dashed border-slate-200 hover:bg-indigo-50 transition-colors text-left">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Plus size={13} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-indigo-600">Add "{query.trim()}" to Inventory</p>
                <p className="text-2xs text-slate-400">Create a new inventory item</p>
              </div>
            </button>
          )}

          {/* Inline quick-add form */}
          {adding && (
            <div className="border-t border-indigo-100 bg-indigo-50/60 px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-2xs font-bold uppercase tracking-widest text-indigo-600">New Inventory Item</p>
                <button type="button"
                  onMouseDown={e => { e.preventDefault(); setAdding(false); }}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
              </div>

              {/* Name */}
              <input
                value={newItem.name}
                onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))}
                placeholder="Item name *"
                className="w-full border border-indigo-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 bg-white"
              />

              {/* Category + Unit */}
              <div className="grid grid-cols-2 gap-2">
                <select value={newItem.category}
                  onChange={e => setNewItem(n => ({ ...n, category: e.target.value }))}
                  className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:border-indigo-400 capitalize">
                  {INV_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                </select>
                <select value={newItem.unit}
                  onChange={e => setNewItem(n => ({ ...n, unit: e.target.value }))}
                  className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:border-indigo-400">
                  {['KG','Yards','Meters','Grams','Rolls','Pcs'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>

              {/* Rate + Opening stock */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">₨</span>
                  <input type="number" min="0" step="0.01"
                    value={newItem.rate}
                    onChange={e => setNewItem(n => ({ ...n, rate: e.target.value }))}
                    placeholder="Rate / unit"
                    className="w-full pl-5 pr-2 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white outline-none focus:border-indigo-400"
                  />
                </div>
                <input type="number" min="0" step="0.01"
                  value={newItem.qty_total}
                  onChange={e => setNewItem(n => ({ ...n, qty_total: e.target.value }))}
                  placeholder="Opening stock"
                  className="w-full px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white outline-none focus:border-indigo-400"
                />
              </div>

              {/* Submit / cancel */}
              <div className="flex gap-2 pt-0.5">
                <button type="button"
                  onMouseDown={e => { e.preventDefault(); submitNew(); }}
                  disabled={saving || !newItem.name.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Adding…' : <><Plus size={11} /> Add to Inventory</>}
                </button>
                <button type="button"
                  onMouseDown={e => { e.preventDefault(); setAdding(false); }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-white transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Product Line (within Project detail) ────────────────────────────────────

const FABRIC_UNIT_OPTS = ['KG', 'Yards', 'Meters', 'Grams', 'Rolls', 'Pcs'];
const ALL_STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const EMPTY_PP = {
  product_id: '', product_name: '', unit: 'pcs',
  sizes: DEFAULT_SIZES,
  fabrics: [], // [{ id, name, unit, qty, rate, amount_paid }]
  costs: [], external_costs: [], notes: '',
};

// Migrate old single-fabric fields → new fabrics array on load
function migrateFabrics(pp) {
  if (Array.isArray(pp.fabrics) && pp.fabrics.length > 0) return pp.fabrics;
  if (pp.fabric_material || parseFloat(pp.fabric_price_per_unit) > 0 || parseFloat(pp.fabric_total_purchased) > 0) {
    return [{
      id: Date.now(),
      name: pp.fabric_material || 'Fabric',
      unit: pp.fabric_unit === 'yards' ? 'Yards' : (pp.fabric_unit === 'kg' ? 'KG' : (pp.fabric_unit || 'KG')),
      qty:  String(pp.fabric_total_purchased || ''),
      rate: String(pp.fabric_price_per_unit  || ''),
      amount_paid: String(pp.fabric_amount_paid || ''),
    }];
  }
  return [];
}

function ProductLine({ pp, catalogProducts, costFields, onSave, onRemove }) {
  const [expanded, setExpanded] = useState(!pp.id);
  const [form, setForm]         = useState(() => ({
    ...pp,
    sizes:   pp.sizes?.length ? pp.sizes : DEFAULT_SIZES.map(s => ({ size: s, qty: 0 })),
    fabrics: migrateFabrics(pp),
    costs:   pp.costs  || [],
    external_costs: pp.external_costs || [],
  }));
  const [saving, setSaving]             = useState(false);
  const [delConf, setDelConf]           = useState(false);
  const [customSizeName, setCustomSizeName] = useState('');
  const [nameMode, setNameMode]         = useState(pp.product_id ? 'catalog' : (pp.product_name ? 'custom' : 'catalog'));
  const [syncing, setSyncing]           = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);

  useEffect(() => {
    api.get('/inventory')
      .then(r => setInventoryItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const totalQty    = form.sizes.reduce((s, sz) => s + (parseFloat(sz.qty) || 0), 0);
  const fabricTotal = form.fabrics.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);
  const proc        = form.costs.reduce((s, c) => s + (parseFloat(c.cost_per_piece)||0), 0) * totalQty;
  const ext         = form.external_costs.reduce((s, c) => s + (parseFloat(c.total)||0), 0);
  const total       = fabricTotal + proc + ext;

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

  // Fabric helpers
  function addFabric() {
    setForm(f => ({ ...f, fabrics: [...f.fabrics, { id: Date.now(), name: '', unit: 'KG', qty: '', rate: '', amount_paid: '' }] }));
  }
  function setFabric(id, field, val) {
    setForm(f => ({ ...f, fabrics: f.fabrics.map(fb => fb.id === id ? { ...fb, [field]: val } : fb) }));
  }
  function removeFabric(id) {
    setForm(f => ({ ...f, fabrics: f.fabrics.filter(fb => fb.id !== id) }));
  }
  function findInvMatch(name) {
    if (!name?.trim()) return null;
    return inventoryItems.find(it => it.name.toLowerCase() === name.trim().toLowerCase()) || null;
  }

  // Process cost helpers
  function setCostPerPiece(key, label, val) {
    setForm(f => {
      const existing = f.costs.find(c => c.key === key);
      const amount_paid = existing?.amount_paid ?? 0;
      const costs = f.costs.filter(c => c.key !== key);
      if (val !== '' && parseFloat(val) > 0) costs.push({ key, label, cost_per_piece: parseFloat(val), amount_paid });
      return { ...f, costs };
    });
  }
  function getCost(key) { return form.costs.find(c => c.key === key)?.cost_per_piece ?? ''; }

  // External cost helpers
  function addExternal() {
    setForm(f => ({ ...f, external_costs: [...f.external_costs, { id: Date.now(), label: '', total: '', amount_paid: '' }] }));
  }
  function setExternal(id, field, val) {
    setForm(f => ({ ...f, external_costs: f.external_costs.map(e => e.id === id ? { ...e, [field]: val } : e) }));
  }
  function removeExternal(id) {
    setForm(f => ({ ...f, external_costs: f.external_costs.filter(e => e.id !== id) }));
  }

  // Catalog product pick
  function pickCatalogProduct(productId) {
    if (!productId) { set('product_id', ''); return; }
    const prod = catalogProducts.find(p => String(p.id) === String(productId));
    if (prod) setForm(f => ({ ...f, product_id: prod.id, product_name: prod.name, unit: prod.unit || f.unit }));
  }

  // Sync process costs from saved calculator template
  async function syncFromCalculator() {
    if (!form.product_id) return;
    setSyncing(true);
    try {
      const r = await apiFetch(`/api/calculator-templates?product_id=${form.product_id}`);
      const templates = await r.json();
      const tpl = Array.isArray(templates) && templates[0];
      if (!tpl) { alert('No saved calculator found for this product.'); return; }
      let saved = {};
      try { saved = JSON.parse(tpl.costs || '{}'); } catch {}
      setForm(f => {
        const newCosts = [...f.costs];
        costFields.forEach(cf => {
          const val = parseFloat(saved[cf.key]);
          if (!val || val <= 0) return;
          const idx = newCosts.findIndex(c => c.key === cf.key);
          if (idx >= 0) { newCosts[idx] = { ...newCosts[idx], cost_per_piece: val }; }
          else { newCosts.push({ key: cf.key, label: cf.label, cost_per_piece: val, amount_paid: 0 }); }
        });
        return { ...f, costs: newCosts };
      });
    } finally { setSyncing(false); }
  }

  async function handleSave() {
    if (!form.product_name.trim()) return;
    setSaving(true);
    try {
      const saved = await onSave({ ...form, total_quantity: totalQty });
      const ppId = saved?.id || pp.id;

      // Auto-sync inventory deductions for any fabric row linked to an inventory item.
      // Use inventory_item_id directly (set when item was selected/created) or fall back to name lookup.
      if (ppId) {
        const invItems = form.fabrics
          .filter(fb => parseFloat(fb.qty) > 0 && (fb.inventory_item_id || findInvMatch(fb.name)))
          .map(fb => {
            const m = findInvMatch(fb.name);
            const invId = fb.inventory_item_id || m?.id;
            return { inventory_item_id: invId, qty: parseFloat(fb.qty), name: fb.name };
          });
        // Always call sync (even with empty items) so removed rows get reversed
        await api.post('/inventory/sync-project-product', {
          project_product_id: ppId,
          items: invItems,
        }).catch(() => {}); // non-fatal — don't block save if inventory sync fails
      }

      setExpanded(false);
    } finally { setSaving(false); }
  }

  const removedStandard = ALL_STANDARD_SIZES.filter(s => !form.sizes.find(sz => sz.size === s));

  return (
    <div className={`bg-white border rounded-2xl shadow-sm transition-all ${expanded ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'}`}>

      {/* ── Collapsed header ── */}
      <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Shirt size={15} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate">{form.product_name || <span className="text-slate-400 font-normal">Unnamed Product</span>}</p>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
            <span>{totalQty.toLocaleString()} {form.unit}</span>
            {total > 0 && <span className="text-indigo-600 font-medium">{pkr(total)}</span>}
            {form.fabrics.length > 0 && (
              <span className="text-blue-500">{form.fabrics.length} fabric{form.fabrics.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-5">

          {/* ══ Row 1: Col 1 (Product Info + Sizes) | Col 2 (Process Costs + External) ══ */}
          <div className="grid grid-cols-2 gap-5">

            {/* ── Col 1: Product Info stacked above Sizes ── */}
            <div className="space-y-4">

              {/* Product Info */}
              <div>
                <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Product</p>
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
                        {catalogProducts.map(p => (
                          <option key={p.id} value={String(p.id)}>
                            {p.name}{p.article_number ? ` (${p.article_number})` : ''}
                          </option>
                        ))}
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

              {/* Sizes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400">Sizes</p>
                  <span className="text-xs font-bold text-indigo-600">Total: {totalQty.toLocaleString()} {form.unit}</span>
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

            {/* ── Col 2: Process Costs + External Costs ── */}
            <div className="space-y-4">

              {/* Process Costs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400">
                    Process Costs <span className="normal-case font-normal text-slate-300">(₨/pc)</span>
                  </p>
                  {form.product_id && (
                    <button onClick={syncFromCalculator} disabled={syncing}
                      className="flex items-center gap-1 text-2xs text-indigo-600 font-semibold border border-indigo-200 bg-indigo-50 px-2 py-0.5 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50">
                      <Save size={9} /> {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {costFields.map(cf => {
                    const v      = getCost(cf.key);
                    const active = v !== '' && parseFloat(v) > 0;
                    const cTotal = (parseFloat(v)||0) * totalQty;
                    return (
                      <div key={cf.key}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors ${
                          active ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}>
                        <span className={`text-sm font-medium flex-1 min-w-0 leading-tight ${active ? 'text-indigo-700' : 'text-slate-600'}`}>
                          {cf.label}
                        </span>
                        <div className="relative flex-shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none select-none">₨</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={v}
                            onChange={e => setCostPerPiece(cf.key, cf.label, e.target.value)}
                            placeholder="0"
                            className={`w-24 pl-5 pr-1 py-1 border rounded-lg bg-white text-sm font-semibold outline-none text-right focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 placeholder:text-slate-300 ${
                              active ? 'text-indigo-700 border-indigo-200' : 'text-slate-700 border-slate-200'
                            }`}
                          />
                        </div>
                        {active && cTotal > 0 && totalQty > 0 ? (
                          <span className="text-xs text-indigo-500 font-semibold whitespace-nowrap w-20 text-right flex-shrink-0">
                            ={pkr(cTotal).replace('₨','')}
                          </span>
                        ) : (
                          <span className="w-20 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* External Costs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400">External Costs</p>
                  <button onClick={addExternal}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    <Plus size={12} /> Add Line
                  </button>
                </div>
                {form.external_costs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No external costs yet.</p>
                ) : (
                  <div className="space-y-2">
                    {form.external_costs.map(ec => (
                      <div key={ec.id} className="flex gap-1.5 items-center">
                        <input value={ec.label} onChange={e => setExternal(ec.id, 'label', e.target.value)}
                          placeholder="e.g. Labels from Lahore"
                          className="flex-1 min-w-0 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 bg-white" />
                        <div className="relative w-24 flex-shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-2xs">₨</span>
                          <input type="number" min="0" value={ec.total} onChange={e => setExternal(ec.id, 'total', e.target.value)}
                            placeholder="Total"
                            className="w-full pl-5 pr-1.5 py-1.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 bg-white" />
                        </div>
                        <button onClick={() => removeExternal(ec.id)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ Row 2: Fabrics / Materials (full width) ══ */}
          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-blue-700">
                Fabrics / Materials
                {fabricTotal > 0 && <span className="text-blue-500 font-bold ml-2">{pkr(fabricTotal)}</span>}
              </p>
              <button onClick={addFabric}
                className="flex items-center gap-1 text-xs text-blue-600 font-semibold border border-blue-200 bg-white px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                <Plus size={11} /> Add Material
              </button>
            </div>

            {form.fabrics.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs text-blue-400 italic">No materials yet.</p>
                <p className="text-2xs text-blue-300 mt-0.5">Track fabrics, accessories & supplies (zips, buttons, labels…)</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid gap-2 px-0.5" style={{ gridTemplateColumns: 'minmax(0,3fr) 72px 76px 92px 80px 26px' }}>
                  {['Name / Material', 'Unit', 'Qty', '₨ per Unit', 'Total', ''].map(h => (
                    <span key={h} className="text-2xs font-bold text-blue-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {form.fabrics.map(fb => {
                  const fbTotal = (parseFloat(fb.qty)||0) * (parseFloat(fb.rate)||0);
                  return (
                    <div key={fb.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: 'minmax(0,3fr) 72px 76px 92px 80px 26px' }}>
                      {/* Name — inventory combobox */}
                      <FabricCombobox
                        value={fb.name}
                        inventoryItems={inventoryItems}
                        onSelect={item => setForm(f => ({
                          ...f,
                          fabrics: f.fabrics.map(x => x.id !== fb.id ? x : {
                            ...x,
                            name: item.name,
                            unit: item.unit || x.unit,
                            rate: String(item.rate || ''),
                            inventory_item_id: item.id, // link directly so sync never misses
                          }),
                        }))}
                        onNameChange={val => setForm(f => ({
                          ...f,
                          fabrics: f.fabrics.map(x => x.id !== fb.id ? x : { ...x, name: val, inventory_item_id: null }),
                        }))}
                        onInventoryAdded={() => {
                          // Refresh local list so findInvMatch works after a new item is created
                          api.get('/inventory')
                            .then(r => setInventoryItems(Array.isArray(r.data) ? r.data : []))
                            .catch(() => {});
                        }}
                      />
                      {/* Unit */}
                      <select value={fb.unit} onChange={e => setFabric(fb.id, 'unit', e.target.value)}
                        className="border border-blue-200 rounded-lg px-1.5 py-2 text-sm outline-none focus:border-blue-400 bg-white cursor-pointer w-full">
                        {FABRIC_UNIT_OPTS.map(u => <option key={u}>{u}</option>)}
                      </select>
                      {/* Qty */}
                      <input type="number" min="0" step="0.01" value={fb.qty}
                        onChange={e => setFabric(fb.id, 'qty', e.target.value)}
                        placeholder="0"
                        className="border border-blue-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-400 bg-white text-center w-full" />
                      {/* Rate */}
                      <div className="relative w-full">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none select-none">₨</span>
                        <input type="number" min="0" step="0.01" value={fb.rate}
                          onChange={e => setFabric(fb.id, 'rate', e.target.value)}
                          placeholder="0"
                          className="border border-blue-200 rounded-lg pl-5 pr-2 py-2 text-sm outline-none focus:border-blue-400 bg-white w-full text-right" />
                      </div>
                      {/* Row total */}
                      <div className={`text-sm font-bold text-center rounded-lg px-1 py-2 ${
                        fbTotal > 0 ? 'text-blue-700 bg-blue-100' : 'text-slate-300 bg-slate-50'
                      }`}>
                        {fbTotal > 0 ? `₨${Math.round(fbTotal).toLocaleString()}` : '—'}
                      </div>
                      {/* Delete */}
                      <button onClick={() => removeFabric(fb.id)}
                        className="flex items-center justify-center w-6 h-7 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}

                {form.fabrics.length > 1 && fabricTotal > 0 && (
                  <div className="flex items-center justify-between bg-blue-100 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs text-blue-700 font-semibold">Total Material Cost</span>
                    <span className="text-sm font-bold text-blue-800">{pkr(fabricTotal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ Row 3: Cost Summary (full-width horizontal bar) ══ */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-6">
              <p className="text-2xs font-bold uppercase tracking-widest text-white/40 flex-shrink-0">Summary</p>
              <div className="flex-1 grid grid-cols-3 gap-4">
                {[
                  { label: 'Fabric & Materials', val: fabricTotal, color: 'text-blue-300' },
                  { label: 'Process Costs',       val: proc,        color: 'text-indigo-300' },
                  { label: 'External Costs',      val: ext,         color: 'text-violet-300' },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <p className="text-2xs text-white/40 font-medium">{label}</p>
                    <p className={`text-base font-bold mt-0.5 ${val > 0 ? color : 'text-white/20'}`}>
                      {val > 0 ? pkr(val) : '—'}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 text-right border-l border-white/10 pl-6">
                <p className="text-2xs font-bold uppercase tracking-widest text-white/40">Grand Total</p>
                <p className="text-2xl font-black text-white leading-tight mt-0.5">
                  {total > 0 ? pkr(total) : <span className="text-white/20 text-lg">—</span>}
                </p>
                {totalQty > 0 && total > 0 && (
                  <p className="text-2xs text-indigo-300 mt-1">{pkr(total / totalQty)} / pc</p>
                )}
                {totalQty > 0 && (
                  <p className="text-2xs text-white/25">{totalQty.toLocaleString()} {form.unit}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Save / Cancel ── */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving || !form.product_name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <Save size={14} /> {saving ? 'Saving…' : pp.id ? 'Save Changes' : 'Add Product'}
            </button>
            {pp.id && (
              <button onClick={() => setExpanded(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Print Views ──────────────────────────────────────────────────────────────

function PrintMaterials({ project }) {
  // Build consolidated list across all products
  const consolidated = {};
  (project.products || []).forEach(pp => {
    migrateFabrics(pp).forEach(fb => {
      if (!fb.name?.trim()) return;
      const key = fb.name.trim().toLowerCase();
      if (!consolidated[key]) {
        consolidated[key] = { name: fb.name.trim(), unit: fb.unit || '', totalQty: 0 };
      }
      const qty = parseFloat(fb.qty) || 0;
      consolidated[key].totalQty += qty;
    });
  });
  const summaryRows = Object.values(consolidated).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-8 font-sans text-slate-900 text-sm">
      {/* Header */}
      <div className="border-b-2 border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide">Materials Purchase List</h1>
        <div className="flex justify-between mt-2 text-sm text-slate-600">
          <span><strong>Project:</strong> {project.title}</span>
          <span><strong>Client:</strong> {project.client_name || '—'}{project.client_company ? ` — ${project.client_company}` : ''}</span>
          <span><strong>Date:</strong> {fmtDate(project.created_at)}</span>
        </div>
      </div>

      {/* Consolidated summary — shown first so buyer sees total at a glance */}
      {summaryRows.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-1">Total Materials Required</h2>
          <p className="text-xs text-slate-500 mb-3">All materials combined across every product in this project.</p>
          <table className="w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wider">
                <th className="border border-slate-600 px-4 py-2.5 text-left">Material / Fabric</th>
                <th className="border border-slate-600 px-4 py-2.5 text-center">Unit</th>
                <th className="border border-slate-600 px-4 py-2.5 text-center">Total Qty</th>
                <th className="border border-slate-600 px-4 py-2.5 text-right">Rate (₨)</th>
                <th className="border border-slate-600 px-4 py-2.5 text-right">Est. Cost (₨)</th>
                <th className="border border-slate-600 px-4 py-2.5 text-center w-24">Ordered ✓</th>
                <th className="border border-slate-600 px-4 py-2.5 text-center w-24">Received ✓</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r, i) => (
                <tr key={r.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-slate-300 px-4 py-2 font-semibold">{r.name}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{r.unit}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-bold text-base">{r.totalQty % 1 === 0 ? r.totalQty.toLocaleString() : r.totalQty.toFixed(2)}</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">&nbsp;</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">&nbsp;</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-product breakdown */}
      <h2 className="text-lg font-bold uppercase tracking-wide mb-4 border-t-2 border-slate-800 pt-6">Breakdown by Product</h2>
      {(project.products || []).map((pp, i) => {
        const fabrics = migrateFabrics(pp);
        if (fabrics.length === 0) return (
          <div key={pp.id} className="mb-6">
            <p className="font-bold text-slate-700">{pp.product_name} <span className="font-normal text-slate-400 text-xs">({parseFloat(pp.total_quantity)||0} {pp.unit}) — no materials listed</span></p>
          </div>
        );
        return (
          <div key={pp.id} className={`mb-8 ${i < (project.products||[]).length - 1 ? 'pb-8 border-b border-slate-200' : ''}`}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-bold text-slate-900">{pp.product_name}</h3>
              <span className="text-slate-500 text-xs">· {(parseFloat(pp.total_quantity)||0).toLocaleString()} {pp.unit}</span>
              {pp.notes && <span className="text-slate-400 text-xs italic">{pp.notes}</span>}
            </div>
            <table className="w-full border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600">
                  <th className="border border-slate-300 px-4 py-2 text-left">Material</th>
                  <th className="border border-slate-300 px-4 py-2 text-center">Unit</th>
                  <th className="border border-slate-300 px-4 py-2 text-center">Qty</th>
                  <th className="border border-slate-300 px-4 py-2 text-right">Rate (₨)</th>
                  <th className="border border-slate-300 px-4 py-2 text-right">Total (₨)</th>
                  <th className="border border-slate-300 px-4 py-2 text-center w-24">Ordered ✓</th>
                </tr>
              </thead>
              <tbody>
                {fabrics.map((fb, fi) => (
                  <tr key={fi}>
                    <td className="border border-slate-300 px-4 py-2 font-medium">{fb.name || '—'}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center">{fb.unit}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-bold">{parseFloat(fb.qty)||0}</td>
                    <td className="border border-slate-300 px-4 py-2 text-right">&nbsp;</td>
                    <td className="border border-slate-300 px-4 py-2 text-right">&nbsp;</td>
                    <td className="border border-slate-300 px-4 py-2 text-center">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="border-t border-slate-300 pt-4 mt-6 flex justify-between text-xs text-slate-400">
        <span>Materials Purchase List — {project.title}</span>
        <span>Printed: {new Date().toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ─── Print Summary — compact all-in-one project record ───────────────────────
function PrintSummary({ project, fin = {} }) {
  const prods        = project.products || [];
  const vendors      = project.vendors  || [];
  const workers      = project.workers  || [];
  const extraCosts   = project.extra_costs || [];
  const stages       = project.stages   || [];
  const images       = Array.isArray(project.images) ? project.images : [];

  const totalQty     = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity) || 0), 0);
  const productCost  = prods.reduce((s, pp) => {
    const f = migrateFabrics(pp).reduce((sf, fb) => sf + (parseFloat(fb.qty)||0)*(parseFloat(fb.rate)||0), 0);
    const p = (pp.costs||[]).reduce((sp, c) => sp + (parseFloat(c.cost_per_piece)||0), 0) * (parseFloat(pp.total_quantity)||0);
    const e = (pp.external_costs||[]).reduce((se, c) => se + (parseFloat(c.total)||0), 0);
    return s + f + p + e;
  }, 0);
  const vendorBilled = vendors.reduce((s, pv) => {
    const tasks = Array.isArray(pv.tasks) ? pv.tasks : [];
    const t = tasks.reduce((st, t) => st + (t.type==='per_piece' ? (parseFloat(t.agreed)||0)*(parseFloat(t.qty)||0) : (parseFloat(t.agreed)||0)), 0);
    return s + (t > 0 ? t : Number(pv.invoice_amount || 0));
  }, 0);
  const vendorPaid   = vendors.reduce((s, pv) => s + Number(pv.total_paid || 0), 0);
  const workerAgreed = workers.reduce((s, pw) => s + (parseFloat(pw.agreed_amount) || 0), 0);
  const workerPaid   = workers.reduce((s, pw) => s + (parseFloat(pw.paid_amount) || 0), 0);
  // Use e.amount for all extra costs (same as calcProject).
  // The amount field is always the pre-calculated total — for per_piece costs
  // it is computed at save time (rate × qty), so re-deriving it here would
  // fail for 'manual' entries where manual_qty is not persisted separately.
  const extraTotal   = extraCosts.reduce((s, ec) => s + (parseFloat(ec.amount) || 0), 0);
  const totalExpense = productCost + vendorBilled + workerAgreed + extraTotal;
  // Use fin.received (already PKR-converted, uses invoice_amount_paid when linked)
  const received     = (fin && fin.received != null) ? fin.received : (parseFloat(project.amount_received) || 0);
  const profit       = received - totalExpense;
  const costPP       = totalQty > 0 ? totalExpense / totalQty : 0;

  const stagesDone  = stages.filter(s => s.status === 'done').length;
  const stagesTotal = stages.filter(s => s.enabled !== 0).length;

  return (
    <div className="p-8 font-sans text-slate-900 text-2xs leading-snug">

      {/* ── Header ── */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-5">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">{project.title}</h1>
          <div className="flex gap-4 mt-1 text-xs text-slate-500">
            {project.client_name && <span>Client: <strong className="text-slate-800">{project.client_name}{project.client_company && project.client_company !== project.client_name ? ` — ${project.client_company}` : ''}</strong></span>}
            {project.invoice_number && <span>Invoice: <strong className="text-slate-800">#{project.invoice_number}</strong></span>}
            <span>Status: <strong className="text-slate-800 uppercase">{project.status}</strong></span>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Printed: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
          <p>Date: {fmtDate(project.created_at)}</p>
          {totalQty > 0 && <p className="font-bold text-slate-800 mt-1">{totalQty.toLocaleString()} pcs total</p>}
        </div>
      </div>

      {/* ── Reference images ── */}
      {images.length > 0 && (
        <div className="mb-5">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 mb-2">Reference Images / Tech Packs</p>
          <div className="flex flex-wrap gap-3">
            {images.map((img, i) => (
              <div key={i} className="border border-slate-200 rounded overflow-hidden">
                <img src={img.url} alt={img.originalName || `Image ${i+1}`}
                  className="h-28 w-auto object-contain" style={{ maxWidth: 200 }} />
                {img.originalName && (
                  <p className="text-2xs text-slate-400 px-1 py-0.5 truncate max-w-[200px]">{img.originalName}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5 mb-5">

        {/* ── Financial summary ── */}
        <div className="col-span-1">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Financials</p>
          <table className="w-full text-2xs">
            <tbody>
              {[
                { label: 'Materials + Process', val: productCost,  cls: '' },
                vendorBilled > 0 && { label: 'Vendors (Billed)', val: vendorBilled, cls: '' },
                workerAgreed > 0 && { label: 'Workers',           val: workerAgreed, cls: '' },
                extraTotal   > 0 && { label: 'Extra Costs',       val: extraTotal,   cls: '' },
              ].filter(Boolean).map(r => (
                <tr key={r.label}>
                  <td className="py-0.5 text-slate-500">{r.label}</td>
                  <td className="py-0.5 text-right font-semibold">{pkr(r.val)}</td>
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
              {vendorPaid > 0 && vendorBilled > 0 && (
                <tr>
                  <td className="py-0.5 text-slate-400 text-2xs">Vendor Due</td>
                  <td className={`py-0.5 text-right text-2xs ${vendorBilled - vendorPaid > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{vendorBilled - vendorPaid > 0 ? pkr(vendorBilled - vendorPaid) : '✓ Settled'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Products & Sizes ── */}
        <div className="col-span-2">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Products & Sizes</p>
          {prods.length === 0 ? (
            <p className="text-slate-400 italic">No products added</p>
          ) : prods.map(pp => {
            const activeSizes = (pp.sizes || []).filter(s => parseFloat(s.qty) > 0);
            return (
              <div key={pp.id} className="mb-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-bold text-slate-900">{pp.product_name}</span>
                  <span className="text-slate-400 text-2xs">{parseFloat(pp.total_quantity)||0} {pp.unit}</span>
                  {pp.notes && <span className="text-slate-400 italic text-2xs">{pp.notes}</span>}
                </div>
                {activeSizes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeSizes.map(sz => (
                      <span key={sz.size} className="border border-slate-300 rounded px-2 py-0.5 font-semibold text-slate-700">
                        {sz.size}: <strong>{parseFloat(sz.qty)}</strong>
                      </span>
                    ))}
                    <span className="border border-slate-800 bg-slate-800 text-white rounded px-2 py-0.5 font-bold">
                      Total: {parseFloat(pp.total_quantity)||0}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Vendors ── */}
      {vendors.length > 0 && (
        <div className="mb-4">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Vendors</p>
          <table className="w-full border-collapse text-2xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Vendor</th>
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Service</th>
                <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Billed</th>
                <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Paid</th>
                <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Due</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(pv => {
                const tasks  = Array.isArray(pv.tasks) ? pv.tasks : [];
                const t      = tasks.reduce((st, t) => st + (t.type==='per_piece' ? (parseFloat(t.agreed)||0)*(parseFloat(t.qty)||0) : (parseFloat(t.agreed)||0)), 0);
                const billed = t > 0 ? t : Number(pv.invoice_amount || 0);
                const paid   = Number(pv.total_paid || 0);
                const due    = billed - paid;
                return (
                  <tr key={pv.id}>
                    <td className="border border-slate-200 px-2 py-1 font-medium">{pv.vendor_name}</td>
                    <td className="border border-slate-200 px-2 py-1 text-slate-500">{pv.service_description || '—'}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right">{pkr(billed)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right text-emerald-700">{pkr(paid)}</td>
                    <td className={`border border-slate-200 px-2 py-1 text-right font-semibold ${due > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{due > 0 ? pkr(due) : '✓'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Workers & Extra Costs ── */}
      <div className="grid grid-cols-2 gap-5 mb-4">
        {workers.length > 0 && (
          <div>
            <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Workers</p>
            <table className="w-full border-collapse text-2xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Name</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Agreed</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(pw => (
                  <tr key={pw.id}>
                    <td className="border border-slate-200 px-2 py-1">{pw.employee_name || pw.worker_name || '—'}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right">{pkr(pw.agreed_amount)}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right text-emerald-700">{pkr(pw.paid_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {extraCosts.length > 0 && (
          <div>
            <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Extra Costs</p>
            <table className="w-full border-collapse text-2xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Item</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {extraCosts.map((ec, i) => {
                  // Use stored amount directly (pre-calculated at save time)
                  const amt = parseFloat(ec.amount) || 0;
                  return (
                    <tr key={i}>
                      <td className="border border-slate-200 px-2 py-1">{ec.label}</td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-semibold">{pkr(amt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Stages progress ── */}
      {stages.filter(s => s.enabled !== 0).length > 0 && (
        <div className="mb-4">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">
            Progress — {stagesDone}/{stagesTotal} stages completed
          </p>
          <div className="flex flex-wrap gap-2">
            {stages.filter(s => s.enabled !== 0).map(s => (
              <div key={s.id} className={`flex items-center gap-1.5 px-2 py-1 rounded border text-2xs font-medium ${
                s.status === 'done'        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                s.status === 'in_progress' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                             'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <span>{s.status === 'done' ? '✓' : s.status === 'in_progress' ? '◑' : '○'}</span>
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {project.notes && (
        <div className="mb-4">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">Notes</p>
          <p className="text-2xs text-slate-700 whitespace-pre-wrap leading-relaxed">{project.notes}</p>
        </div>
      )}

      {/* ── Boxes summary ── */}
      {project.boxes?.length > 0 && (
        <div className="mb-4">
          <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-1 mb-2">
            Boxes — {project.boxes.length} boxes
          </p>
          <div className="flex flex-wrap gap-2">
            {project.boxes.map(b => {
              const pcs = (b.contents||[]).reduce((s,item)=>s+(item.sizes||[]).reduce((ss,sz)=>ss+(parseFloat(sz.qty)||0),0),0);
              return (
                <div key={b.id} className={`px-2 py-1 rounded border text-2xs font-medium ${b.shipped ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  Box #{b.box_number} · {pcs} pcs{b.shipped ? ' ✓ Shipped' : ''}
                </div>
              );
            })}
          </div>
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
      {images.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Reference Images / Tech Packs</p>
          <div className="flex flex-wrap gap-4">
            {images.map((img, i) => (
              <div key={i} className="border border-slate-200 rounded overflow-hidden">
                <img src={img.url} alt={img.originalName || `Image ${i+1}`}
                  className="h-40 w-auto object-contain" style={{ maxWidth: 280 }} />
                {img.originalName && (
                  <p className="text-2xs text-slate-400 px-2 py-1 truncate max-w-[280px]">{img.originalName}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
      {images.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Reference Images / Tech Packs</p>
          <div className="flex flex-wrap gap-4">
            {images.map((img, i) => (
              <div key={i} className="border border-slate-200 rounded overflow-hidden">
                <img src={img.url} alt={img.originalName || `Image ${i+1}`}
                  className="h-40 w-auto object-contain" style={{ maxWidth: 280 }} />
                {img.originalName && (
                  <p className="text-2xs text-slate-400 px-2 py-1 truncate max-w-[280px]">{img.originalName}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
  const client = project;
  return (
    <div className="p-8 font-sans text-slate-900">
      {(project.boxes||[]).length === 0 ? (
        <p className="text-slate-500 text-center py-8">No boxes defined for this project.</p>
      ) : (project.boxes||[]).map((box, bi) => (
        <div key={box.id} className={`${bi > 0 ? 'page-break-before mt-8 pt-8 border-t-2 border-slate-800' : ''}`}>
          <div className="border-b-2 border-slate-800 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold uppercase">Box #{box.box_number}</h1>
                <p className="text-sm text-slate-600 mt-1"><strong>Project:</strong> {project.title}</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p><strong>Client:</strong> {client.client_name}</p>
                {client.client_company && <p>{client.client_company}</p>}
              </div>
            </div>
          </div>

          {/* Shipping */}
          {(client.client_ship_address || client.client_ship_city) && (
            <div className="mb-6 bg-slate-50 border border-slate-200 rounded p-4">
              <p className="font-bold text-sm uppercase tracking-wide mb-2">Ship To:</p>
              {client.client_ship_name  && <p className="text-sm font-semibold">{client.client_ship_name}</p>}
              {client.client_ship_phone && <p className="text-sm">{client.client_ship_phone}</p>}
              {client.client_ship_address && <p className="text-sm">{client.client_ship_address}</p>}
              <p className="text-sm">{[client.client_ship_city, client.client_ship_country].filter(Boolean).join(', ')}</p>
            </div>
          )}

          {/* Contents */}
          <table className="w-full border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-4 py-2 text-left font-semibold">Product</th>
                <th className="border border-slate-300 px-4 py-2 text-left font-semibold">Size</th>
                <th className="border border-slate-300 px-4 py-2 text-center font-semibold">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(box.contents||[]).flatMap(item =>
                (item.sizes||[]).filter(s => parseFloat(s.qty) > 0).map((sz, si) => (
                  <tr key={`${item.project_product_id}-${si}`}>
                    {si === 0 && <td className="border border-slate-300 px-4 py-2 font-medium" rowSpan={(item.sizes||[]).filter(s=>parseFloat(s.qty)>0).length}>{item.product_name}</td>}
                    <td className="border border-slate-300 px-4 py-2">{sz.size}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-bold">{parseFloat(sz.qty)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td colSpan={2} className="border border-slate-300 px-4 py-2">TOTAL PIECES</td>
                <td className="border border-slate-300 px-4 py-2 text-center">
                  {(box.contents||[]).reduce((s,item) => s + (item.sizes||[]).reduce((ss,sz) => ss + (parseFloat(sz.qty)||0), 0), 0)}
                </td>
              </tr>
            </tfoot>
          </table>

          {box.notes && <p className="text-xs text-slate-500 mt-3 italic">Note: {box.notes}</p>}
          <div className="border-t border-slate-300 pt-3 mt-6 flex justify-between text-xs text-slate-400">
            <span>Box #{box.box_number} of {project.boxes.length} — {project.title}</span>
            <span>Printed: {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Project Image Uploader ───────────────────────────────────────────────────

function ProjectImageUploader({ images, onSave }) {
  const inputRef  = useRef();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [open, setOpen]           = useState(false);

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
            <p className="font-semibold text-slate-900 text-sm">Tech Packs &amp; Reference Images</p>
            <p className="text-xs text-slate-400">
              {images.length === 0 ? 'Attach images that print with Cutting & Stitching docs' : `${images.length} image${images.length !== 1 ? 's' : ''} attached · prints with Cutting & Stitching docs`}
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
                  <img src={img.url} alt={img.originalName}
                    className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <button
                      onClick={() => removeImage(img)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity bg-rose-600 text-white rounded-full p-1">
                      <X size={12} />
                    </button>
                  </div>
                  <p className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-2xs px-1.5 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">{img.originalName}</p>
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
    </div>
  );
}

// ─── Project Detail ───────────────────────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Products', 'Costs', 'Stages', 'Boxes'];

function ProjectDetail({ projectId, onBack, clients, invoices, catalogProducts, costFields, currencies, baseCurrency, onProjectUpdated }) {
  const [project, setProject]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('Overview');
  const [editModal, setEdit]    = useState(false);
  const [delConf, setDelConf]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [printMode, setPrint]   = useState(null); // 'cutting' | 'stitching' | 'packaging'
  const [addingProduct, setAddingProduct] = useState(false);
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
      materials: 'Materials Purchase List',
    };
    return `${base} – ${labels[mode] || mode}`;
  }

  useEffect(() => {
    if (!printMode) return;
    const timer = setTimeout(() => {
      const prevTitle = document.title;
      document.title = getPrintTitle(printMode);
      window.print();
      const handler = () => {
        document.title = prevTitle;
        setPrint(null);
      };
      window.addEventListener('afterprint', handler, { once: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [printMode]);

  async function handleSaveProduct(pp, form) {
    let saved;
    if (pp.id) {
      const r = await api.put(`/projects/${projectId}/products/${pp.id}`, form);
      saved = r.data;
    } else {
      const r = await api.post(`/projects/${projectId}/products`, form);
      saved = r.data;
      setAddingProduct(false);
    }
    await load();
    return saved; // ProductLine uses this to get the real ppId for inventory sync
  }

  async function handleRemoveProduct(ppId) {
    await api.delete(`/projects/${projectId}/products/${ppId}`);
    await load();
  }

  async function handleStageUpdate(stageId, body) {
    await api.put(`/projects/${projectId}/stages/${stageId}`, body);
    await load();
    onProjectUpdated?.();
  }

  async function handleSaveBox(box, form) {
    if (box.id) {
      await api.put(`/projects/${projectId}/boxes/${box.id}`, form);
    } else {
      await api.post(`/projects/${projectId}/boxes`, form);
    }
    await load();
  }

  async function handleDeleteBox(boxId) {
    await api.delete(`/projects/${projectId}/boxes/${boxId}`);
    await load();
  }

  async function handleSaveImages(images) {
    await api.put(`/projects/${projectId}/images`, { images });
    await load();
  }

  async function handleEditProject(form) {
    await api.put(`/projects/${projectId}`, form);
    await load();
    onProjectUpdated?.();
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
  // Base currency symbol/label for inline annotations
  const baseCode = baseCurrency || 'PKR';
  const baseSym  = baseCode === 'PKR' ? '₨' : ((currencies.find(c => c.code === baseCode)?.symbol) || baseCode);

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
              {printMode === 'cutting' ? 'Cutting Hall Order' : printMode === 'stitching' ? 'Stitching Order' : printMode === 'materials' ? 'Materials Purchase List' : printMode === 'summary' ? 'Project Summary' : 'Packaging List'}
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
          {printMode === 'materials'  && <PrintMaterials project={project} />}
        </div>
      </>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={16} /> Projects
        </button>
        <ChevronRight size={14} className="text-slate-300" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">{project.title}</h1>
          <StatusBadge status={project.status} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setPrint('summary')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold transition-colors shadow-sm">
            <FileImage size={12} /> Summary
          </button>
          <button onClick={() => setPrint('cutting')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-blue-200 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 font-semibold transition-colors">
            <Scissors size={12} /> Cutting
          </button>
          <button onClick={() => setPrint('stitching')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-green-200 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 font-semibold transition-colors">
            <Shirt size={12} /> Stitching
          </button>
          <button onClick={() => setPrint('packaging')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-amber-200 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 font-semibold transition-colors">
            <PackageOpen size={12} /> Packaging
          </button>
          <button onClick={() => setPrint('materials')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-violet-200 bg-violet-50 text-violet-700 rounded-xl hover:bg-violet-100 font-semibold transition-colors">
            <Package size={12} /> Materials
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button onClick={() => setEdit(true)}
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
      </div>

      {/* ── Project Summary Cards ── */}
      {(() => {
        const prods       = project.products || [];
        const totalQtyAll = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity)||0), 0);
        const expPerPc    = totalQtyAll > 0 ? fin.totalExpense / totalQtyAll : 0;
        const recvPerPc   = totalQtyAll > 0 && fin.received > 0 ? fin.received / totalQtyAll : 0;
        return (
          <div className="grid grid-cols-3 gap-3 mb-6">

            {/* Total Expense */}
            <div className="bg-rose-500 rounded-2xl p-4 shadow-sm text-white">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-rose-200" />
                <p className="text-xs font-bold uppercase tracking-wider text-rose-100">Total Expense</p>
              </div>
              <p className="text-2xl font-bold leading-tight">{fmt(fin.totalExpense)}</p>
              <div className="text-2xs text-rose-200 mt-1 space-y-0.5">
                <p>Materials+Process: {fmt(fin.productCost)}</p>
                {fin.vendorBilled  > 0 && <p>Vendors: {fmt(fin.vendorBilled)}</p>}
                {fin.workerAgreed  > 0 && <p>Workers: {fmt(fin.workerAgreed)}</p>}
                {fin.extraCostTotal > 0 && <p>Extra: {fmt(fin.extraCostTotal)}</p>}
              </div>
              <div className="mt-2 pt-1.5 border-t border-rose-400/40 flex items-center justify-between text-2xs">
                <span className="text-rose-100">Paid: <span className="font-bold">{fmt(fin.totalPaid)}</span></span>
                {fin.due > 0
                  ? <span className="text-rose-200">Due: {fmt(fin.due)}</span>
                  : <span className="text-emerald-300 font-semibold">✓ Settled</span>}
              </div>
              {expPerPc > 0 && (
                <p className="text-xs text-rose-100 mt-1 font-semibold">
                  {fmt(expPerPc)}/pc
                </p>
              )}
            </div>

            {/* Amount Received */}
            <div className="bg-emerald-500 rounded-2xl p-4 shadow-sm text-white">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-emerald-200" />
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-100">Amount Received</p>
              </div>
              <p className="text-2xl font-bold leading-tight">{fmt(fin.received)}</p>
              <p className="text-2xs text-emerald-200 mt-1">
                {fin.receivedCurrency !== 'PKR' ? `${fin.receivedCurrency} ${fin.receivedRaw.toLocaleString()}` : 'From client'}
              </p>
              {recvPerPc > 0 && (
                <p className="text-xs text-emerald-100 mt-1.5 font-semibold border-t border-emerald-400/40 pt-1.5">
                  {fmt(recvPerPc)}/pc
                </p>
              )}
            </div>

            {/* Net Profit */}
            <div className={`rounded-2xl p-4 shadow-sm text-white ${fin.profit >= 0 ? 'bg-amber-500' : 'bg-rose-700'}`}>
              <div className="flex items-center gap-2 mb-2">
                {fin.profit >= 0 ? <CheckCircle2 size={14} className="text-amber-200" /> : <AlertTriangle size={14} className="text-rose-200" />}
                <p className="text-xs font-bold uppercase tracking-wider text-white/80">{fin.profit >= 0 ? 'Net Profit' : 'Net Loss'}</p>
              </div>
              <p className="text-2xl font-bold leading-tight">{fmt(Math.abs(fin.profit))}</p>
              <p className={`text-2xs mt-1 ${fin.profit >= 0 ? 'text-amber-100' : 'text-rose-200'}`}>
                {fin.received > 0 ? `Margin: ${((fin.profit/fin.received)*100).toFixed(1)}%` : 'No income yet'}
              </p>
              {totalQtyAll > 0 && (
                <p className="text-xs text-white/70 mt-1.5 font-semibold border-t border-white/20 pt-1.5">
                  {fmt(Math.abs(fin.profit/totalQtyAll))}/pc {fin.profit < 0 ? '(loss)' : ''}
                </p>
              )}
            </div>

          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all duration-150 ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{t}</button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'Overview' && (() => {
        const prods          = project.products || [];
        const totalQtyAll    = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity)||0), 0);
        const recvPerPc      = totalQtyAll > 0 && fin.received > 0 ? fin.received / totalQtyAll : 0;
        return (
          <div className="space-y-5">

            {/* ── Row 3: Spending breakdown | Client | Invoice ── */}
            <div className="grid grid-cols-3 gap-5">

              {/* Spending breakdown with bars */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Spending Breakdown</p>
                </div>
                {fin.totalExpense > 0 ? (
                  <div className="space-y-3.5">
                    {[
                      { label: 'Materials + Process', val: fin.productCost,    color: 'bg-indigo-500' },
                      { label: 'Vendors',             val: fin.vendorBilled,   color: 'bg-rose-400'   },
                      { label: 'Workers',             val: fin.workerAgreed,   color: 'bg-amber-400'  },
                      { label: 'Extra Costs',         val: fin.extraCostTotal, color: 'bg-orange-400' },
                    ].filter(x => x.val > 0).map(({ label, val, color }) => (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-500 font-medium">{label}</span>
                          <span className="font-bold text-slate-800">{fmt(val)}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`}
                            style={{ width: `${Math.min(100,(val/fin.totalExpense*100)).toFixed(1)}%` }} />
                        </div>
                        <p className="text-2xs text-slate-400 mt-1 text-right">
                          {((val/fin.totalExpense)*100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Expense</span>
                      <span className="text-base font-black text-rose-600">{fmt(fin.totalExpense)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-600 font-semibold">Paid: {fmt(fin.totalPaid)}</span>
                      {fin.due > 0
                        ? <span className="text-rose-500 font-semibold">Due: {fmt(fin.due)}</span>
                        : <span className="text-emerald-500 font-semibold">✓ Settled</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No expenses recorded yet.</p>
                )}
              </div>

              {/* Client */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</p>
                </div>
                {project.client_name ? (
                  <>
                    <p className="font-semibold text-slate-900">{project.client_name}</p>
                    {project.client_company  && <p className="text-sm text-slate-500 mt-0.5">{project.client_company}</p>}
                    {project.client_email    && <p className="text-xs text-slate-400 mt-2">{project.client_email}</p>}
                    {project.client_phone    && <p className="text-xs text-slate-400">{project.client_phone}</p>}
                    {project.client_ship_address && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-medium text-slate-500 mb-1">Ship To</p>
                        <p className="text-xs text-slate-600">{project.client_ship_address}</p>
                        <p className="text-xs text-slate-600">{[project.client_ship_city, project.client_ship_country].filter(Boolean).join(', ')}</p>
                      </div>
                    )}
                  </>
                ) : <p className="text-sm text-slate-400 italic">No client linked</p>}
              </div>

              {/* Invoice / manual payment */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Receipt size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice</p>
                </div>
                {project.invoice_id ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 font-mono">{project.invoice_number}</p>
                      {project.invoice_currency && project.invoice_currency !== 'PKR' && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{project.invoice_currency}</span>
                      )}
                    </div>
                    <div className="space-y-1.5 mt-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Invoice Total</span>
                        <span className="font-medium">
                          {project.invoice_currency && project.invoice_currency !== 'PKR'
                            ? `${project.invoice_currency} ${(parseFloat(project.invoice_total)||0).toLocaleString()}`
                            : pkr(project.invoice_total)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Amount Paid</span>
                        <span className="font-semibold text-emerald-600">
                          {project.invoice_currency && project.invoice_currency !== 'PKR'
                            ? `${project.invoice_currency} ${(parseFloat(project.invoice_amount_paid)||0).toLocaleString()}`
                            : pkr(project.invoice_amount_paid)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Balance Due</span>
                        <span className="font-semibold text-rose-500">
                          {project.invoice_currency && project.invoice_currency !== 'PKR'
                            ? `${project.invoice_currency} ${((parseFloat(project.invoice_total)||0)-(parseFloat(project.invoice_amount_paid)||0)).toLocaleString()}`
                            : pkr((project.invoice_total||0)-(project.invoice_amount_paid||0))}
                        </span>
                      </div>
                      {project.invoice_currency && project.invoice_currency !== 'PKR' && fin.exchangeRate > 1 && (
                        <div className="pt-1.5 border-t border-slate-100 text-xs text-slate-400">
                          Converted @ 1 {project.invoice_currency} = {pkr(fin.exchangeRate)}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400 italic">Manual entry</p>
                    <p className="text-lg font-bold text-emerald-600 mt-2">{fmt(toPKR(project.amount_received, project.currency || 'PKR', currencies))}</p>
                    <p className="text-xs text-slate-400">Amount received</p>
                  </>
                )}
              </div>
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
          {project.products.map(pp => (
            <ProductLine key={pp.id}
              pp={pp}
              catalogProducts={catalogProducts}
              costFields={costFields}
              onSave={form => handleSaveProduct(pp, form)}
              onRemove={() => handleRemoveProduct(pp.id)}
            />
          ))}

          {addingProduct && (
            <ProductLine
              pp={EMPTY_PP}
              catalogProducts={catalogProducts}
              costFields={costFields}
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

      {/* ── Stages Tab ── */}
      {tab === 'Stages' && (
        <StagesTab stages={project.stages||[]} onUpdate={handleStageUpdate} />
      )}

      {/* ── Boxes Tab ── */}
      {tab === 'Boxes' && (
        <BoxesTab project={project} onSave={handleSaveBox} onDelete={handleDeleteBox} onReload={load} onPrint={() => setPrint('packaging')} />
      )}

      {/* ── Costs Tab ── */}
      {tab === 'Costs' && (
        <CostsTab project={project} onReload={load} fmt={fmt} />
      )}

      {/* Edit Modal */}
      {editModal && (
        <ProjectModal
          project={project}
          clients={clients}
          invoices={invoices}
          onClose={() => setEdit(false)}
          onSave={handleEditProject}
        />
      )}
    </div>
  );
}

// ─── Stages Tab ───────────────────────────────────────────────────────────────

const STATUS_BTNS = [
  { s: 'pending',     label: 'Pending',     cls: 'bg-slate-600 border-slate-600 text-white' },
  { s: 'in_progress', label: 'In Progress', cls: 'bg-blue-600 border-blue-600 text-white'   },
  { s: 'done',        label: 'Done',        cls: 'bg-emerald-600 border-emerald-600 text-white' },
];

function StageStatusButtons({ stage, onUpdate }) {
  return (
    <div className="flex gap-1 flex-shrink-0">
      {STATUS_BTNS.map(({ s, label, cls }) => {
        const active = stage.status === s;
        return (
          <button key={s} onClick={() => onUpdate(stage.id, { status: s })}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              active ? cls : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}>
            {active && s === 'done' && <Check size={10} />}
            {active && s === 'in_progress' && <Clock size={10} className="animate-pulse" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DecorationSubTasks({ stage, onUpdate }) {
  const [tasks, setTasksState] = useState(() => {
    try { return JSON.parse(stage.tasks || '[]'); }
    catch { return []; }
  });
  const [newLabel, setNewLabel] = useState('');

  // Sync when stage.tasks changes externally
  useEffect(() => {
    try { setTasksState(JSON.parse(stage.tasks || '[]')); }
    catch { setTasksState([]); }
  }, [stage.tasks]);

  function saveTasks(updated) {
    setTasksState(updated);
    onUpdate(stage.id, { tasks: updated });
  }

  function toggleEnabled(id) {
    saveTasks(tasks.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  }

  function toggleDone(id) {
    saveTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function addTask() {
    const label = newLabel.trim();
    if (!label) return;
    const nextId = (tasks.length ? Math.max(...tasks.map(t => t.id)) : 0) + 1;
    saveTasks([...tasks, { id: nextId, label, enabled: true, done: false }]);
    setNewLabel('');
  }

  function removeTask(id) {
    saveTasks(tasks.filter(t => t.id !== id));
  }

  const enabledTasks  = tasks.filter(t => t.enabled);
  const doneCount     = enabledTasks.filter(t => t.done).length;

  return (
    <div className="border-t border-slate-100 px-5 pb-4 pt-3 space-y-2">
      <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
        Decoration Sub-Tasks
        {enabledTasks.length > 0 && (
          <span className="ml-2 text-purple-600">{doneCount}/{enabledTasks.length} done</span>
        )}
      </p>

      {/* Existing tasks */}
      {tasks.map(task => (
        <div key={task.id}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${
            task.enabled ? 'bg-white border border-slate-200' : 'bg-slate-50/60 border border-dashed border-slate-200 opacity-60'
          }`}>
          {/* Enable/disable toggle */}
          <button onClick={() => toggleEnabled(task.id)}
            className="flex-shrink-0 transition-colors">
            {task.enabled
              ? <ToggleRight size={18} className="text-purple-600" />
              : <ToggleLeft  size={18} className="text-slate-300" />}
          </button>

          {/* Label */}
          <span className={`flex-1 text-sm ${task.enabled ? 'text-slate-800' : 'text-slate-400'}`}>
            {task.label}
          </span>

          {/* Done checkbox (only when enabled) */}
          {task.enabled && (
            <button onClick={() => toggleDone(task.id)}
              className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                task.done
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-slate-300 hover:border-emerald-400'
              }`}>
              {task.done && <Check size={12} className="text-white" />}
            </button>
          )}

          {/* Remove */}
          <button onClick={() => removeTask(task.id)}
            className="flex-shrink-0 text-slate-200 hover:text-rose-400 transition-colors">
            <X size={13} />
          </button>
        </div>
      ))}

      {/* Add custom task */}
      <div className="flex gap-2 mt-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="+ Add custom task (e.g. Acid Wash)"
          className="flex-1 border border-dashed border-purple-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100 placeholder:text-slate-400 bg-white" />
        <button onClick={addTask}
          className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100 font-medium transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

function StagesTab({ stages, onUpdate }) {
  // Sort by sort_order
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
        <Package size={28} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No stages found for this project</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stage count progress header */}
      {(() => {
        const enabled = sorted.filter(s => s.enabled);
        const done    = enabled.filter(s => s.status === 'done').length;
        const pct     = enabled.length > 0 ? Math.round((done / enabled.length) * 100) : 0;
        return (
          <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-600 flex-shrink-0">{done}/{enabled.length} stages complete · {pct}%</span>
          </div>
        );
      })()}

      {sorted.map((stage, idx) => {
        const Icon       = STAGE_ICON[stage.stage_key] ?? Package;
        const color      = STAGE_COLOR[stage.stage_key] ?? 'text-slate-600 bg-slate-50';
        const isDecoration = stage.stage_key === 'decoration';
        // Legacy optional stages (old projects)
        const isLegacyOptional = ['sublimation', 'embroidery', 'screen_print'].includes(stage.stage_key);

        return (
          <div key={stage.id}
            className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all ${
              stage.enabled ? 'border-slate-200' : 'border-slate-100 opacity-55'
            }`}>
            <div className="flex items-center gap-4 px-5 py-4">
              {/* Sort order indicator */}
              <div className="text-xs font-bold text-slate-300 w-5 text-center flex-shrink-0">{idx + 1}</div>

              {/* Icon */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                stage.enabled ? color : 'text-slate-300 bg-slate-100'
              }`}>
                <Icon size={16} />
              </div>

              {/* Name + timestamps */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900">{stage.stage_name}</p>
                  {isDecoration && (
                    <span className="text-2xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">Decoration</span>
                  )}
                  {isLegacyOptional && !stage.enabled && (
                    <span className="text-2xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium">Disabled</span>
                  )}
                </div>
                {stage.started_at && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Started: {fmtDate(stage.started_at)}
                    {stage.completed_at && <span> · Done: {fmtDate(stage.completed_at)}</span>}
                  </p>
                )}
              </div>

              {/* Legacy optional toggle */}
              {isLegacyOptional && (
                <button onClick={() => onUpdate(stage.id, { enabled: !stage.enabled, status: 'pending' })}
                  className="flex-shrink-0 mr-1 transition-colors">
                  {stage.enabled
                    ? <ToggleRight size={20} className="text-indigo-600" />
                    : <ToggleLeft  size={20} className="text-slate-300" />}
                </button>
              )}

              {/* Status buttons */}
              {stage.enabled && <StageStatusButtons stage={stage} onUpdate={onUpdate} />}
            </div>

            {/* Decoration sub-tasks */}
            {isDecoration && stage.enabled && (
              <DecorationSubTasks stage={stage} onUpdate={onUpdate} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Costs Tab (Vendors + Workers) ───────────────────────────────────────────

const VENDOR_TYPES = {
  fabric:    { label: 'Fabric / Material', icon: Layers,  color: 'text-violet-600 bg-violet-50' },
  process:   { label: 'Process',           icon: Scissors,color: 'text-blue-600 bg-blue-50' },
  packaging: { label: 'Packaging',         icon: Box,     color: 'text-amber-600 bg-amber-50' },
  freight:   { label: 'Freight',           icon: Truck,   color: 'text-emerald-600 bg-emerald-50' },
};

const PAYMENT_METHODS = ['cash','bank_transfer','cheque','online'];

// Preset task labels sourced from standard process stages
const TASK_PRESETS = [
  'Cutting', 'Stitching', 'Sublimation', 'Embroidery', 'Screen Print',
  'Packing', 'Pressing', 'Finishing', 'Washing', 'Acid Wash',
  'Rhinestone', 'Fabric Supply', 'Thread & Accessories', 'Labels & Tags', 'Other',
];

function VendorForm({ pv, allVendors, projectProducts = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    vendor_id:           pv?.vendor_id           ?? '',
    vendor_name:         pv?.vendor_name         ?? '',
    service_description: pv?.service_description ?? '',
    invoice_amount:      pv?.invoice_amount      ?? '',
    currency:            pv?.currency            ?? 'PKR',
    notes:               pv?.notes               ?? '',
    tasks:               Array.isArray(pv?.tasks) ? pv.tasks : [],
  });
  const [saving, setSaving]     = useState(false);
  const [newTaskLabel, setNTL]  = useState('');
  const [syncing, setSyncing]   = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // Invoice-level type toggle (shown when no tasks)
  const [invoiceType, setInvoiceType]   = useState('lump_sum'); // 'lump_sum' | 'per_piece'
  const [invoiceRate, setInvoiceRate]   = useState('');
  const [invoiceProdId, setInvoiceProdId] = useState('all');

  // '__manual__' means user wants to type a name manually
  const [vendorMode, setVendorMode] = useState(
    pv?.vendor_id ? 'catalog' : (pv?.vendor_name ? 'manual' : 'catalog')
  );

  const selectedVendorInfo = vendorMode === 'catalog' && form.vendor_id
    ? allVendors.find(x => String(x.id) === String(form.vendor_id))
    : null;

  // Total project quantity across all products (default for per-piece tasks)
  const totalProjectQty = projectProducts.reduce((s, pp) => s + (parseFloat(pp.total_quantity) || 0), 0);

  // Per-piece invoice calculations (when no tasks are used)
  const invoiceQty = invoiceProdId === 'all'
    ? totalProjectQty
    : parseFloat(projectProducts.find(p => String(p.id) === String(invoiceProdId))?.total_quantity || 0);
  const invoicePerPieceTotal = (parseFloat(invoiceRate) || 0) * invoiceQty;

  // Task total helper: lump_sum → agreed directly; per_piece → agreed × qty
  function taskAmt(t) {
    if (t.type === 'per_piece') return (parseFloat(t.agreed) || 0) * (parseFloat(t.qty) || 0);
    return parseFloat(t.agreed) || 0;
  }
  const tasksTotal = form.tasks.reduce((s, t) => s + taskAmt(t), 0);
  const hasTaskAmt = form.tasks.length > 0;

  function pickVendor(vid) {
    if (vid === '__manual__') {
      setVendorMode('manual');
      set('vendor_id', '');
    } else {
      setVendorMode('catalog');
      const v = allVendors.find(x => String(x.id) === String(vid));
      set('vendor_id', vid);
      if (v) set('vendor_name', v.name);
      else   set('vendor_name', '');
    }
  }

  function addTask(label) {
    const l = (label || newTaskLabel).trim();
    if (!l) return;
    setForm(f => ({
      ...f,
      tasks: [...f.tasks, {
        id:         `t-${Date.now()}`,
        label:      l,
        type:       'lump_sum',   // 'lump_sum' | 'per_piece'
        agreed:     '',           // lump sum total OR per-piece rate
        qty:        String(totalProjectQty || ''),
        cost_key:   '',
        product_id: 'all',        // 'all' or specific product id for per-piece tasks
      }],
    }));
    setNTL('');
  }

  function setTaskField(id, field, val) {
    setForm(f => ({
      ...f,
      tasks: f.tasks.map(t => t.id === id ? { ...t, [field]: val } : t),
    }));
  }

  // When user picks a product for a per-piece task, auto-fill qty from that product
  function setTaskProduct(id, pid) {
    const qty = pid === 'all'
      ? String(totalProjectQty || '')
      : String(projectProducts.find(p => String(p.id) === String(pid))?.total_quantity || '');
    setForm(f => ({
      ...f,
      tasks: f.tasks.map(t => t.id === id ? { ...t, product_id: pid, qty } : t),
    }));
  }

  function removeTask(id) {
    setForm(f => ({ ...f, tasks: f.tasks.filter(t => t.id !== id) }));
  }

  // Sync agreed amounts from project product process costs
  function syncFromProducts() {
    if (!projectProducts.length || !form.tasks.length) return;
    setSyncing(true);
    // Collect per-piece rates per cost key (averaged when multiple products)
    const costMap = {};
    projectProducts.forEach(pp => {
      (pp.costs || []).forEach(c => {
        if (!costMap[c.key]) costMap[c.key] = { key: c.key, label: c.label, rate: 0, count: 0 };
        costMap[c.key].rate  += parseFloat(c.cost_per_piece) || 0;
        costMap[c.key].count += 1;
      });
    });
    const allCosts = Object.values(costMap).map(c => ({ ...c, rate: c.count > 1 ? c.rate / c.count : c.rate }));

    setForm(f => ({
      ...f,
      tasks: f.tasks.map(t => {
        const match = allCosts.find(c =>
          c.label.toLowerCase().includes(t.label.toLowerCase()) ||
          t.label.toLowerCase().includes(c.label.toLowerCase()) ||
          (t.cost_key && c.key === t.cost_key)
        );
        if (!match) return t;
        // For per_piece tasks → fill the per-piece rate; for lump_sum → fill the total
        if (t.type === 'per_piece') {
          return { ...t, agreed: String(match.rate), qty: String(totalProjectQty || t.qty), cost_key: match.key };
        }
        return { ...t, agreed: String(match.rate * totalProjectQty), cost_key: match.key };
      }),
    }));
    setSyncing(false);
  }

  async function save() {
    if (!form.vendor_name.trim()) return;
    setSaving(true);
    try {
      let finalAmount;
      if (hasTaskAmt)                      finalAmount = tasksTotal;
      else if (invoiceType === 'per_piece') finalAmount = invoicePerPieceTotal;
      else                                 finalAmount = parseFloat(form.invoice_amount) || 0;
      await onSave({ ...form, invoice_amount: finalAmount });
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">

      {/* ── Vendor selector ── */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Vendor</label>
        <select
          value={vendorMode === 'manual' ? '__manual__' : (form.vendor_id || '')}
          onChange={e => pickVendor(e.target.value)}
          className={selectCls}>
          <option value="">— Select Vendor —</option>
          {allVendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
          <option value="__manual__">✏ Add New (manual)</option>
        </select>
      </div>

      {/* Read-only vendor info when catalog vendor selected */}
      {selectedVendorInfo && (selectedVendorInfo.phone || selectedVendorInfo.bank_details) && (
        <div className="bg-white border border-slate-100 rounded-xl px-3 py-2 space-y-1">
          {selectedVendorInfo.phone && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Phone size={10} className="text-slate-400" /> {selectedVendorInfo.phone}
            </p>
          )}
          {selectedVendorInfo.bank_details && (
            <p className="text-xs text-slate-400 whitespace-pre-wrap leading-tight">{selectedVendorInfo.bank_details}</p>
          )}
        </div>
      )}

      {/* Manual name entry */}
      {vendorMode === 'manual' && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Vendor Name *</label>
          <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
            className={inputCls} placeholder="Enter vendor name" autoFocus />
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Service / Description</label>
        <input value={form.service_description} onChange={e => set('service_description', e.target.value)}
          className={inputCls} placeholder="e.g. Stitching + Cutting for 50 suits" />
      </div>

      {/* ── Tasks Section ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Tag size={13} className="text-indigo-500" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tasks / Processes</span>
            {form.tasks.length > 0 && (
              <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">
                {form.tasks.length}
              </span>
            )}
          </div>
          {form.tasks.length > 0 && projectProducts.length > 0 && (
            <button
              type="button"
              onClick={syncFromProducts}
              disabled={syncing}
              className="flex items-center gap-1 text-2xs text-violet-600 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg hover:bg-violet-100 font-semibold transition-colors"
            >
              <Wand2 size={10} /> Sync from Products
            </button>
          )}
        </div>

        {/* Task rows */}
        {form.tasks.length > 0 && (
          <div className="divide-y divide-slate-50">
            {form.tasks.map(t => {
              const isPerPiece = t.type === 'per_piece';
              const lineTotal  = taskAmt(t);
              return (
                <div key={t.id} className="px-3 py-2.5 space-y-2">
                  {/* Row 1: label + type toggle + delete */}
                  <div className="flex items-center gap-2">
                    <input
                      value={t.label}
                      onChange={e => setTaskField(t.id, 'label', e.target.value)}
                      className="flex-1 text-sm border-0 bg-transparent outline-none text-slate-800 font-medium placeholder:text-slate-400 min-w-0"
                      placeholder="Task name"
                    />
                    {/* Type toggle pills */}
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0 text-2xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setTaskField(t.id, 'type', 'lump_sum')}
                        title="Fixed lump-sum amount"
                        className={`px-2.5 py-1.5 transition-colors ${!isPerPiece ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                      >
                        Lump Sum
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTaskField(t.id, 'type', 'per_piece');
                          // auto-fill qty from product if not already set
                          if (!t.qty || t.qty === '0') {
                            setTaskField(t.id, 'qty', String(totalProjectQty || ''));
                          }
                        }}
                        title="Rate per piece × quantity"
                        className={`px-2.5 py-1.5 transition-colors border-l border-slate-200 ${isPerPiece ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                      >
                        Per Piece
                      </button>
                    </div>
                    <button type="button" onClick={() => removeTask(t.id)}
                      className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Row 2: amount inputs */}
                  {isPerPiece ? (
                    <div className="space-y-1.5 pl-0.5">
                      {/* Product selector (only shown when project has products) */}
                      {projectProducts.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs text-slate-400 whitespace-nowrap flex-shrink-0">Product:</span>
                          <select
                            value={t.product_id || 'all'}
                            onChange={e => setTaskProduct(t.id, e.target.value)}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white cursor-pointer min-w-0"
                          >
                            <option value="all">All Products ({totalProjectQty.toLocaleString()} pcs)</option>
                            {projectProducts.map(pp => (
                              <option key={pp.id} value={String(pp.id)}>
                                {pp.product_name} ({(parseFloat(pp.total_quantity)||0).toLocaleString()} pcs)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Rate × qty = total */}
                      <div className="flex items-center gap-2">
                        {/* Rate per piece */}
                        <div className="flex items-center gap-1">
                          <span className="text-2xs text-slate-400 whitespace-nowrap">₨/pc</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={t.agreed}
                            onChange={e => setTaskField(t.id, 'agreed', e.target.value)}
                            placeholder="Rate"
                            className="w-24 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                          />
                        </div>
                        <span className="text-slate-300 font-light">×</span>
                        {/* Quantity (auto-filled from product selector, still editable) */}
                        <div className="flex items-center gap-1">
                          <span className="text-2xs text-slate-400">pcs</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={t.qty}
                            onChange={e => setTaskField(t.id, 'qty', e.target.value)}
                            placeholder={String(totalProjectQty || '0')}
                            className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                          />
                        </div>
                        {/* Computed total */}
                        {lineTotal > 0 && (
                          <>
                            <span className="text-slate-300 font-light">=</span>
                            <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">
                              ₨{Math.round(lineTotal).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 pl-0.5">
                      <span className="text-2xs text-slate-400">Total ₨</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={t.agreed}
                        onChange={e => setTaskField(t.id, 'agreed', e.target.value)}
                        placeholder="0"
                        className="w-36 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                      />
                      {lineTotal > 0 && (
                        <span className="text-2xs text-slate-400 ml-1">
                          = ₨{Math.round(lineTotal).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Tasks subtotal */}
            <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/60">
              <span className="text-xs text-indigo-600 font-semibold">Tasks Total</span>
              <span className="text-sm font-bold text-indigo-700">
                ₨{Math.round(tasksTotal).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Add task row */}
        <div className="px-3 py-2.5 border-t border-slate-100">
          {/* Preset chips */}
          <div className="flex flex-wrap gap-1 mb-2">
            {TASK_PRESETS.filter(p => !form.tasks.find(t => t.label === p)).slice(0, 8).map(p => (
              <button key={p} type="button" onClick={() => addTask(p)}
                className="text-2xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors font-medium">
                + {p}
              </button>
            ))}
          </div>
          {/* Custom task input */}
          <div className="flex gap-2">
            <input
              value={newTaskLabel}
              onChange={e => setNTL(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              className={`${inputCls} flex-1`}
              placeholder="Custom task name…"
            />
            <button type="button" onClick={() => addTask()}
              disabled={!newTaskLabel.trim()}
              className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Invoice amount — manual when no tasks, auto-calculated when tasks exist */}
      {!hasTaskAmt && (
        <div className="space-y-3">
          {/* Type toggle */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Invoice Type</label>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
              <button type="button" onClick={() => setInvoiceType('lump_sum')}
                className={`flex-1 px-3 py-2 transition-colors ${invoiceType === 'lump_sum' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                Lump Sum
              </button>
              <button type="button" onClick={() => setInvoiceType('per_piece')}
                className={`flex-1 px-3 py-2 border-l border-slate-200 transition-colors ${invoiceType === 'per_piece' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                Per Piece
              </button>
            </div>
          </div>

          {invoiceType === 'lump_sum' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Invoice Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
                  <input type="number" min="0" value={form.invoice_amount} onChange={e => set('invoice_amount', e.target.value)}
                    className={`${inputCls} pl-7`} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
                <input value={form.notes} onChange={e => set('notes', e.target.value)}
                  className={inputCls} placeholder="Optional notes" />
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
              {/* Product selector */}
              {projectProducts.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Applies To</label>
                  <select value={invoiceProdId} onChange={e => setInvoiceProdId(e.target.value)} className={selectCls}>
                    <option value="all">All Products ({totalProjectQty.toLocaleString()} pcs)</option>
                    {projectProducts.map(pp => (
                      <option key={pp.id} value={String(pp.id)}>
                        {pp.product_name} ({(parseFloat(pp.total_quantity)||0).toLocaleString()} pcs)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Rate × qty = total */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-xs text-slate-500 whitespace-nowrap">₨/pc</span>
                  <input type="number" min="0" value={invoiceRate} onChange={e => setInvoiceRate(e.target.value)}
                    placeholder="Rate per piece"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white" />
                </div>
                <span className="text-slate-400 text-sm">×</span>
                <span className="text-sm text-slate-700 font-semibold whitespace-nowrap">{invoiceQty.toLocaleString()} pcs</span>
                {invoicePerPieceTotal > 0 && (
                  <>
                    <span className="text-slate-400 text-sm">=</span>
                    <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">
                      ₨{Math.round(invoicePerPieceTotal).toLocaleString()}
                    </span>
                  </>
                )}
              </div>
              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
                <input value={form.notes} onChange={e => set('notes', e.target.value)}
                  className={inputCls} placeholder="Optional notes" />
              </div>
            </div>
          )}
        </div>
      )}
      {hasTaskAmt && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)}
            className={inputCls} placeholder="Optional notes" />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !form.vendor_name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          <Save size={13} /> {saving ? 'Saving…' : pv ? 'Save Changes' : 'Add Vendor'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

function PaymentForm({ pvId, projectId, onSaved, onCancel }) {
  const [form, setForm]         = useState({ amount: '', method: 'cash', reference: '', notes: '', paid_at: new Date().toISOString().slice(0,10), receipt_url: '' });
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef            = useRef(null);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  async function handleReceiptUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/upload', { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        set('receipt_url', data.url || '');
      }
    } finally { setUploading(false); }
  }

  async function save() {
    if (!form.amount || parseFloat(form.amount) <= 0) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/vendors/${pvId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (res.ok) { onSaved(); }
    } finally { setSaving(false); }
  }

  const isImage = form.receipt_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(form.receipt_url);

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2 mt-2">
      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Record Payment</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₨</span>
          <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
            placeholder="Amount"
            className="w-full pl-5 pr-2 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white" />
        </div>
        <select value={form.method} onChange={e => set('method', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-indigo-400 bg-white">
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}
        </select>
        <input type="date" value={form.paid_at} onChange={e => set('paid_at', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-indigo-400 bg-white" />
        <input value={form.reference} onChange={e => set('reference', e.target.value)}
          placeholder="Reference / Cheque #"
          className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-indigo-400 bg-white" />
      </div>

      {/* Receipt upload */}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleReceiptUpload} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Receipt size={11} /> {uploading ? 'Uploading…' : 'Attach Receipt'}
        </button>
        {form.receipt_url && (
          isImage ? (
            <a href={form.receipt_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1">
              <img src={form.receipt_url} alt="receipt"
                className="h-8 w-8 object-cover rounded border border-slate-200" />
              <span className="text-2xs text-slate-400">Receipt attached</span>
            </a>
          ) : (
            <a href={form.receipt_url} target="_blank" rel="noreferrer"
              className="text-xs text-indigo-600 underline flex items-center gap-1">
              <Eye size={11} /> View Receipt
            </a>
          )
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !form.amount}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
          <Check size={11} /> {saving ? 'Saving…' : 'Record Payment'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-xs hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

function WorkerForm({ pw, onSave, onCancel }) {
  const [form, setForm] = useState({
    worker_type:       pw?.worker_type       ?? 'contract',
    worker_name:       pw?.worker_name       ?? '',
    worker_phone:      pw?.worker_phone      ?? '',
    task_description:  pw?.task_description  ?? '',
    agreed_amount:     pw?.agreed_amount     ?? '',
    paid_amount:       pw?.paid_amount       ?? '',
    notes:             pw?.notes             ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.worker_name.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Type</label>
          <select value={form.worker_type} onChange={e => set('worker_type', e.target.value)} className={selectCls}>
            <option value="contract">Contract</option>
            <option value="employee">Employee</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Name *</label>
          <input value={form.worker_name} onChange={e => set('worker_name', e.target.value)}
            className={inputCls} placeholder="Worker name" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Phone</label>
          <input value={form.worker_phone} onChange={e => set('worker_phone', e.target.value)}
            className={inputCls} placeholder="+92 300…" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Task / Description</label>
        <input value={form.task_description} onChange={e => set('task_description', e.target.value)}
          className={inputCls} placeholder="e.g. Stitching 200 jackets" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Agreed Amount (PKR)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
            <input type="number" min="0" value={form.agreed_amount} onChange={e => set('agreed_amount', e.target.value)}
              className={`${inputCls} pl-7`} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Paid So Far (PKR)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
            <input type="number" min="0" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)}
              className={`${inputCls} pl-7`} placeholder="0" />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !form.worker_name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          <Save size={13} /> {saving ? 'Saving…' : pw ? 'Save Changes' : 'Add Worker'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

/* ─── Vendor Payment Receipt (print-safe, inline styles) ───────────────────── */
function VendorPaymentReceipt({ payment, pv, project, settings }) {
  const totalBilled = parseFloat(pv.invoice_amount) || 0;
  const allPayments  = pv.payments || [];
  const thisIdx      = allPayments.findIndex(p => p.id === payment.id);
  const paymentsUpTo = thisIdx >= 0 ? allPayments.slice(0, thisIdx + 1) : allPayments;
  const cumPaid      = paymentsUpTo.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const thisPaid     = parseFloat(payment.amount) || 0;
  const prevPaid     = cumPaid - thisPaid;
  const remaining    = totalBilled - cumPaid;
  const receiptNum   = `VPR-${String(payment.id).padStart(5, '0')}`;
  const dateStr      = payment.paid_at
    ? new Date(payment.paid_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const companyName  = settings?.company_name || 'Apparel Management';
  const companyCity  = settings?.company_city  || '';
  const companyCountry = settings?.company_country || '';
  const companyLocation = [companyCity, companyCountry].filter(Boolean).join(', ');
  const companyPhone = settings?.company_phone || '';

  const S = {
    page:      { width:'100%', maxWidth:'560px', margin:'0 auto', fontFamily:'-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif', background:'#fff', padding:'44px 48px', color:'#1c1c1e', boxSizing:'border-box' },
    accent:    { height:'3px', background:'linear-gradient(90deg,#6366f1,#10b981)', margin:'-44px -48px 36px', borderRadius:'0' },
    header:    { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'28px', paddingBottom:'20px', borderBottom:'1px solid #e5e7eb' },
    coName:    { fontSize:'18px', fontWeight:'700', color:'#1c1c1e', margin:'0 0 2px 0' },
    coSub:     { fontSize:'11px', color:'#9ca3af', margin:'2px 0 0' },
    badge:     { background:'#6366f1', color:'#fff', fontSize:'9px', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', padding:'4px 10px', borderRadius:'4px', marginBottom:'6px', display:'inline-block' },
    rcptNum:   { fontSize:'16px', fontWeight:'700', color:'#1c1c1e', margin:'0' },
    rcptDate:  { fontSize:'11px', color:'#6b7280', marginTop:'3px' },
    grid2:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px', marginBottom:'24px' },
    label:     { fontSize:'9px', fontWeight:'700', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'4px' },
    val:       { fontSize:'13px', fontWeight:'600', color:'#1c1c1e', margin:'0' },
    valSub:    { fontSize:'11px', color:'#6b7280', marginTop:'2px' },
    tblHead:   { borderBottom:'1px solid #e5e7eb', fontSize:'10px', fontWeight:'700', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em' },
    tblTh:     { padding:'5px 8px 5px 0', textAlign:'left' },
    tblThR:    { padding:'5px 0', textAlign:'right' },
    tblTd:     { padding:'7px 8px 7px 0', fontSize:'12px', color:'#374151', borderBottom:'1px solid #f3f4f6' },
    tblTdR:    { padding:'7px 0', fontSize:'12px', color:'#374151', textAlign:'right', borderBottom:'1px solid #f3f4f6' },
    tblTdBold: { padding:'7px 8px 7px 0', fontSize:'12px', color:'#1c1c1e', fontWeight:'600', borderBottom:'1px solid #f3f4f6' },
    tblTdBoldR:{ padding:'7px 0', fontSize:'12px', color:'#1c1c1e', fontWeight:'600', textAlign:'right', borderBottom:'1px solid #f3f4f6' },
    summBox:   { background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'16px 20px', marginBottom:'24px' },
    summRow:   { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:'12px' },
    summDiv:   { borderTop:'1px solid #e5e7eb', margin:'6px 0' },
    summMain:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0 4px', fontSize:'15px', fontWeight:'700' },
    fullPaid:  { textAlign:'center', color:'#059669', fontSize:'12px', fontWeight:'700', padding:'6px 0 2px' },
    footer:    { borderTop:'1px solid #e5e7eb', paddingTop:'16px', textAlign:'center', marginTop:'8px' },
    footTxt:   { fontSize:'10px', color:'#9ca3af', margin:'0' },
  };

  return (
    <div style={S.page}>
      <div style={S.accent} />
      {/* Header */}
      <div style={S.header}>
        <div>
          {settings?.company_logo
            ? <img src={settings.company_logo} alt="logo" style={{ height:'36px', objectFit:'contain', display:'block', marginBottom:'4px' }} />
            : <p style={S.coName}>{companyName}</p>
          }
          {companyLocation && <p style={S.coSub}>{companyLocation}</p>}
          {companyPhone    && <p style={S.coSub}>{companyPhone}</p>}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={S.badge}>Payment Receipt</div>
          <p style={S.rcptNum}>{receiptNum}</p>
          {dateStr && <p style={S.rcptDate}>{dateStr}</p>}
        </div>
      </div>

      {/* Vendor + Project */}
      <div style={S.grid2}>
        <div>
          <div style={S.label}>Paid To</div>
          <p style={S.val}>{pv.vendor_name}</p>
          {pv.vendor_phone && <p style={S.valSub}>{pv.vendor_phone}</p>}
          {pv.service_description && <p style={S.valSub}>{pv.service_description}</p>}
        </div>
        <div>
          <div style={S.label}>Project</div>
          <p style={S.val}>{project.title}</p>
          {project.order_number && <p style={S.valSub}>Order #{project.order_number}</p>}
        </div>
      </div>

      {/* Tasks table */}
      {Array.isArray(pv.tasks) && pv.tasks.length > 0 && (
        <div style={{ marginBottom:'24px' }}>
          <div style={S.label}>Services</div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={S.tblHead}>
                <th style={S.tblTh}>Task</th>
                <th style={S.tblThR}>Rate</th>
                <th style={S.tblThR}>Qty</th>
                <th style={S.tblThR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {pv.tasks.map(t => {
                const isPP = t.type === 'per_piece';
                const amt  = isPP
                  ? (parseFloat(t.agreed)||0) * (parseFloat(t.qty)||0)
                  : (parseFloat(t.agreed)||0);
                return (
                  <tr key={t.id}>
                    <td style={S.tblTdBold}>{t.label}</td>
                    <td style={S.tblTdR}>{isPP ? `₨${(parseFloat(t.agreed)||0).toLocaleString()}/pc` : '—'}</td>
                    <td style={S.tblTdR}>{isPP ? (parseFloat(t.qty)||0) : '—'}</td>
                    <td style={S.tblTdBoldR}>₨{amt.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment summary box */}
      <div style={S.summBox}>
        {totalBilled > 0 && (
          <div style={S.summRow}>
            <span style={{ color:'#6b7280' }}>Total Billed</span>
            <span style={{ color:'#1c1c1e', fontWeight:'600' }}>₨{totalBilled.toLocaleString()}</span>
          </div>
        )}
        {prevPaid > 0 && (
          <div style={S.summRow}>
            <span style={{ color:'#6b7280' }}>Previously Paid</span>
            <span style={{ color:'#6b7280' }}>₨{prevPaid.toLocaleString()}</span>
          </div>
        )}
        <div style={S.summDiv} />
        <div style={S.summMain}>
          <span>This Payment</span>
          <span style={{ color:'#059669' }}>₨{thisPaid.toLocaleString()}</span>
        </div>
        {remaining > 0 ? (
          <div style={S.summRow}>
            <span style={{ color:'#6b7280' }}>Remaining Balance</span>
            <span style={{ color:'#ef4444', fontWeight:'700' }}>₨{remaining.toLocaleString()}</span>
          </div>
        ) : remaining <= 0 ? (
          <div style={S.fullPaid}>✓ Fully Paid</div>
        ) : null}
      </div>

      {/* Method + Reference */}
      <div style={S.grid2}>
        <div>
          <div style={S.label}>Payment Method</div>
          <p style={S.val}>{(payment.method || '').replace(/_/g, ' ')}</p>
        </div>
        {payment.reference && (
          <div>
            <div style={S.label}>Reference / Cheque No.</div>
            <p style={S.val}>{payment.reference}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <p style={S.footTxt}>Thank you for your services. This is a computer-generated receipt.</p>
      </div>
    </div>
  );
}

// ─── Extra Costs Section ──────────────────────────────────────────────────────

const EXTRA_COST_FIXED_SUGGESTIONS = [
  'Transport', 'Customs Duty', 'Freight', 'Packaging Material',
  'Export Charges', 'Agent Fee', 'Bank Charges', 'Insurance',
  'Storage', 'Loading / Unloading', 'Miscellaneous',
];
const EXTRA_COST_PERPIECE_SUGGESTIONS = [
  'Overhead', 'Commission', 'Profit Margin', 'Handling Fee',
  'Quality Check', 'Inspection Fee', 'Label Cost', 'Tags & Cards',
];

function ExtraCostsSection({ project, onReload, fmt = pkr, pid }) {
  const [adding, setAdding]     = useState(false);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(null);

  const products   = project.products || [];
  const totalQtyAll = products.reduce((s, pp) => s + (parseFloat(pp.total_quantity)||0), 0);

  const blank = {
    cost_type: 'fixed',       // 'fixed' | 'per_piece'
    label: '',
    amount: '',               // fixed: total amount; per_piece: auto-calculated
    rate: '',                 // per_piece rate per piece
    applies_to: 'all',        // 'all' | product id | 'manual'
    manual_qty: '',           // custom qty when applies_to === 'manual'
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  };
  const [form, setForm] = useState(blank);

  // Resolve qty for per_piece calculation
  function resolvedQty(appliesTo, manualQty) {
    if (appliesTo === 'manual') return parseFloat(manualQty) || 0;
    if (appliesTo === 'all') return totalQtyAll;
    const pp = products.find(p => String(p.id) === String(appliesTo));
    return pp ? (parseFloat(pp.total_quantity)||0) : 0;
  }

  // Calculated total for per_piece
  const perPieceTotal = form.cost_type === 'per_piece'
    ? (parseFloat(form.rate)||0) * resolvedQty(form.applies_to, form.manual_qty)
    : 0;

  const extras = Array.isArray(project.extra_costs) ? project.extra_costs : [];
  const total  = extras.reduce((s, e) => s + (parseFloat(e.amount)||0), 0);

  function startAdd() { setForm(blank); setEditId(null); setAdding(true); }
  function startEdit(e) {
    setForm({
      cost_type:  e.cost_type  || 'fixed',
      label:      e.label      || '',
      amount:     e.cost_type === 'per_piece' ? '' : String(e.amount ?? ''),
      rate:       String(e.rate ?? ''),
      applies_to: String(e.applies_to ?? 'all'),
      manual_qty: String(e.manual_qty ?? ''),
      date:       e.date  || '',
      notes:      e.notes || '',
    });
    setEditId(e.id); setAdding(true);
  }
  function cancel() { setAdding(false); setEditId(null); setForm(blank); }

  async function save() {
    if (!form.label.trim()) return;
    const payload = {
      ...form,
      amount: form.cost_type === 'per_piece' ? perPieceTotal : (parseFloat(form.amount)||0),
    };
    setSaving(true);
    try {
      if (editId) await api.put(`/projects/${pid}/extra-costs/${editId}`, payload);
      else        await api.post(`/projects/${pid}/extra-costs`, payload);
      cancel(); onReload();
    } catch(err) { alert(err?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function remove(ecId) {
    if (!confirm('Remove this extra cost?')) return;
    setDeleting(ecId);
    try { await api.delete(`/projects/${pid}/extra-costs/${ecId}`); onReload(); }
    catch { alert('Failed to delete'); }
    finally { setDeleting(null); }
  }

  const isPerPiece = form.cost_type === 'per_piece';
  const canSave = form.label.trim() && (isPerPiece
    ? (parseFloat(form.rate)||0) > 0 && resolvedQty(form.applies_to, form.manual_qty) > 0
    : (parseFloat(form.amount)||0) > 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-orange-500" />
          <h3 className="font-semibold text-slate-900">Extra Costs</h3>
          {extras.length > 0 && (
            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">{extras.length}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {total > 0 && <span className="text-xs text-slate-500">Total: <span className="font-semibold text-orange-600">{fmt(total)}</span></span>}
          {!adding && (
            <button onClick={startAdd}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-semibold hover:bg-orange-600 transition-colors">
              <Plus size={12} /> Add Cost
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit form */}
      {adding && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-600">{editId ? 'Edit Cost' : 'New Extra Cost'}</p>

          {/* Cost type toggle */}
          <div>
            <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cost Type</label>
            <div className="flex gap-2">
              {[
                { val: 'fixed',     label: 'Fixed Amount',  desc: 'One total amount (transport, customs…)' },
                { val: 'per_piece', label: 'Per Piece',     desc: 'Rate × qty (overhead, commission…)' },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setForm(f => ({ ...f, cost_type: opt.val, amount: '', rate: '' }))}
                  className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                    form.cost_type === opt.val
                      ? 'border-orange-400 bg-white shadow-sm'
                      : 'border-slate-200 bg-white/60 hover:border-slate-300'
                  }`}>
                  <p className={`text-xs font-bold ${form.cost_type === opt.val ? 'text-orange-600' : 'text-slate-600'}`}>{opt.label}</p>
                  <p className="text-2xs text-slate-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Label */}
            <div className="col-span-2">
              <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Label</label>
              <input
                list="extra-cost-suggestions"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                placeholder={isPerPiece ? 'e.g. Overhead, Commission…' : 'e.g. Transport, Customs…'}
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
              <datalist id="extra-cost-suggestions">
                {(isPerPiece ? EXTRA_COST_PERPIECE_SUGGESTIONS : EXTRA_COST_FIXED_SUGGESTIONS).map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            {/* Fixed: amount field */}
            {!isPerPiece && (
              <div>
                <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Amount (₨)</label>
                <input
                  type="number" min="0"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                  placeholder="0"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
            )}

            {/* Per-piece: rate + product selector */}
            {isPerPiece && (
              <>
                <div>
                  <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rate per Piece (₨)</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                    placeholder="e.g. 50"
                    value={form.rate}
                    onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Applies To</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white cursor-pointer"
                    value={form.applies_to}
                    onChange={e => setForm(f => ({ ...f, applies_to: e.target.value, manual_qty: '' }))}>
                    <option value="all">All Products ({totalQtyAll.toLocaleString()} pcs)</option>
                    {products.map(pp => (
                      <option key={pp.id} value={String(pp.id)}>
                        {pp.product_name} ({(parseFloat(pp.total_quantity)||0).toLocaleString()} pcs)
                      </option>
                    ))}
                    <option value="manual">✏ Manual Quantity</option>
                  </select>
                  {/* Manual qty input — shown when "Manual Quantity" is selected */}
                  {form.applies_to === 'manual' && (
                    <input
                      type="number" min="1"
                      className="mt-2 w-full border border-orange-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                      placeholder="Enter quantity (e.g. 21 for 21 sizes)"
                      value={form.manual_qty}
                      onChange={e => setForm(f => ({ ...f, manual_qty: e.target.value }))}
                      autoFocus
                    />
                  )}
                </div>

                {/* Live preview */}
                {(parseFloat(form.rate)||0) > 0 && resolvedQty(form.applies_to, form.manual_qty) > 0 && (
                  <div className="col-span-2 bg-white border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {fmt(parseFloat(form.rate)||0)} × {resolvedQty(form.applies_to, form.manual_qty).toLocaleString()} {form.applies_to === 'manual' ? 'units' : 'pcs'}
                    </span>
                    <span className="text-base font-bold text-orange-600">= {fmt(perPieceTotal)}</span>
                  </div>
                )}
              </>
            )}

            {/* Date */}
            <div>
              <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white"
                placeholder="Optional notes…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={saving || !canSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors">
              <Save size={13} /> {saving ? 'Saving…' : editId ? 'Update' : 'Add'}
            </button>
            <button onClick={cancel} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      {extras.length === 0 && !adding ? (
        <div className="text-center py-8 bg-white border border-dashed border-slate-200 rounded-2xl">
          <Truck size={22} className="text-slate-200 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No extra costs yet — add fixed costs or per-piece overheads.</p>
        </div>
      ) : extras.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="grid text-2xs text-slate-400 font-semibold uppercase tracking-wider px-4 py-2.5 bg-slate-50 border-b border-slate-100"
               style={{ gridTemplateColumns: '1fr 120px 110px auto' }}>
            <span>Description</span>
            <span>Type / Rate</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {extras.map(e => {
            const isPP = e.cost_type === 'per_piece';
            const isManual = isPP && e.applies_to === 'manual';
            const appliedPP = isPP && !isManual && e.applies_to !== 'all'
              ? products.find(p => String(p.id) === String(e.applies_to))
              : null;
            const displayQty = resolvedQty(e.applies_to, e.manual_qty);
            const displayUnit = isManual ? 'units' : 'pcs';
            return (
              <div key={e.id} className="grid items-center px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                   style={{ gridTemplateColumns: '1fr 120px 110px auto' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{e.label}</p>
                    {isPP && (
                      <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md font-semibold">
                        {isManual ? 'per unit' : 'per piece'}
                      </span>
                    )}
                  </div>
                  {e.notes && <p className="text-2xs text-slate-400 mt-0.5">{e.notes}</p>}
                  {isPP && (
                    <p className="text-2xs text-slate-400 mt-0.5">
                      {isManual
                        ? `Manual qty: ${displayQty.toLocaleString()} units`
                        : `Applies to: ${appliedPP ? appliedPP.product_name : 'All Products'}`}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {isPP
                    ? <><span className="font-semibold text-indigo-600">{fmt(e.rate)}/{isManual ? 'unit' : 'pc'}</span><span className="text-slate-300 mx-1">×</span>{displayQty.toLocaleString()} {displayUnit}</>
                    : <span className="text-slate-400">{e.date || '—'}</span>
                  }
                </div>
                <span className="text-sm font-semibold text-orange-600 text-right">{fmt(e.amount)}</span>
                <div className="flex items-center gap-1 ml-3">
                  <button onClick={() => startEdit(e)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => remove(e.id)} disabled={deleting === e.id}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {extras.length > 0 && (
            <div className="grid items-center px-4 py-3 bg-orange-50 border-t border-orange-100"
                 style={{ gridTemplateColumns: '1fr 120px 110px auto' }}>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total</span>
              <span />
              <span className="text-sm font-bold text-orange-600 text-right">{fmt(total)}</span>
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostsTab({ project, onReload, fmt = pkr }) {
  const [allVendors, setAllVendors]   = useState([]);
  const [addingVendor, setAddingV]    = useState(false);
  const [editVendor, setEditV]        = useState(null);
  const [payingFor, setPayingFor]     = useState(null); // pvId
  const [addingWorker, setAddingW]    = useState(false);
  const [editWorker, setEditW]        = useState(null);

  // Product cost payment tracking
  const [ppPaid, setPpPaid]         = useState({});
  const [savingPP, setSavingPP]     = useState({});
  const [expandedPP, setExpandedPP] = useState({});

  // Receipt print
  const receiptRef                  = useRef(null);
  const [printPayment, setPrintPayment] = useState(null); // { payment, pv }
  const [companySettings, setCompanySettings] = useState({});

  const pid = project.id;
  const BASE = '/api';

  useEffect(() => {
    fetch(`${BASE}/vendors`).then(r => r.json()).then(setAllVendors).catch(() => {});
  }, []);

  // Fetch company settings for receipt header
  useEffect(() => {
    fetch(`${BASE}/settings`).then(r => r.json()).then(s => setCompanySettings(s || {})).catch(() => {});
  }, []);

  // Trigger print once receipt is rendered
  useEffect(() => {
    if (!printPayment) return;
    const id = requestAnimationFrame(() => {
      if (receiptRef.current) {
        const { payment, pv } = printPayment;
        const safeVendor = pv.vendor_name.replace(/[\\/:*?"<>|]/g, '-').trim();
        const safeProject = (project?.title || '').replace(/[\\/:*?"<>|]/g, '-').trim();
        printDoc(receiptRef, `Receipt – ${safeVendor} – ${safeProject}`);
      }
      setPrintPayment(null);
    });
    return () => cancelAnimationFrame(id);
  }, [printPayment]);

  // Initialise editable paid amounts from saved project data
  useEffect(() => {
    const init = {};
    (project.products || []).forEach(pp => {
      const fabs = migrateFabrics(pp);
      const fabrics = {};
      fabs.forEach((f, i) => { fabrics[String(i)] = String(f.amount_paid ?? ''); });
      const costs = {};
      (pp.costs || []).forEach((c, i) => { costs[String(c.key ?? i)] = String(c.amount_paid ?? ''); });
      const external = {};
      (pp.external_costs || []).forEach((e, i) => { external[String(e.id ?? i)] = String(e.amount_paid ?? ''); });
      init[pp.id] = { fabrics, costs, external };
    });
    setPpPaid(init);
  }, [project.id]);

  async function saveProductPayments(pp) {
    setSavingPP(prev => ({ ...prev, [pp.id]: true }));
    try {
      const paid = ppPaid[pp.id] || {};
      const fabs = migrateFabrics(pp);
      const updatedForm = {
        ...pp,
        fabrics: fabs.map((f, i) => ({
          ...f,
          amount_paid: paid.fabrics?.[String(i)] ?? f.amount_paid ?? '',
        })),
        costs: (pp.costs || []).map((c, i) => ({
          ...c,
          amount_paid: paid.costs?.[String(c.key ?? i)] ?? c.amount_paid ?? '',
        })),
        external_costs: (pp.external_costs || []).map((e, i) => ({
          ...e,
          amount_paid: paid.external?.[String(e.id ?? i)] ?? e.amount_paid ?? '',
        })),
      };
      await api.put(`/projects/${pid}/products/${pp.id}`, updatedForm);
      onReload();
    } finally {
      setSavingPP(prev => ({ ...prev, [pp.id]: false }));
    }
  }

  async function saveVendor(form) {
    const url  = editVendor ? `${BASE}/projects/${pid}/vendors/${editVendor.id}` : `${BASE}/projects/${pid}/vendors`;
    const meth = editVendor ? 'PUT' : 'POST';
    const res  = await fetch(url, { method: meth, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { setAddingV(false); setEditV(null); onReload(); }
  }

  async function deleteVendor(pvId) {
    if (!confirm('Remove this vendor from the project?')) return;
    await fetch(`${BASE}/projects/${pid}/vendors/${pvId}`, { method: 'DELETE' });
    onReload();
  }

  async function deletePayment(pvId, payId) {
    await fetch(`${BASE}/projects/${pid}/vendors/${pvId}/payments/${payId}`, { method: 'DELETE' });
    onReload();
  }

  async function saveWorker(form) {
    const url  = editWorker ? `${BASE}/projects/${pid}/workers/${editWorker.id}` : `${BASE}/projects/${pid}/workers`;
    const meth = editWorker ? 'PUT' : 'POST';
    const res  = await fetch(url, { method: meth, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { setAddingW(false); setEditW(null); onReload(); }
  }

  async function deleteWorker(wId) {
    if (!confirm('Remove this worker from the project?')) return;
    await fetch(`${BASE}/projects/${pid}/workers/${wId}`, { method: 'DELETE' });
    onReload();
  }

  const vendors  = project.vendors  || [];
  const workers  = project.workers  || [];
  const products = project.products || [];

  const totalVendorBilled  = vendors.reduce((s,pv) => s + pvBilled(pv), 0);
  const totalVendorPaid    = vendors.reduce((s,pv) => s + Number(pv.total_paid||0), 0);
  const totalWorkerAgreed  = workers.reduce((s,pw) => s + Number(pw.agreed_amount||0), 0);
  const totalWorkerPaid    = workers.reduce((s,pw) => s + Number(pw.paid_amount||0), 0);

  // ── Grand totals: product cost + vendors + workers + extra costs ─────────────
  const grandProductCost = products.reduce((s, pp) => s + calcPP(pp).total, 0);
  const _ecArr = Array.isArray(project.extra_costs) ? project.extra_costs : [];
  const extraCostTotal   = _ecArr.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);

  // Distribute project-level costs proportionally by each product's cost share
  function sharesFor(pp) {
    const ratio = grandProductCost > 0
      ? calcPP(pp).total / grandProductCost
      : 1 / Math.max(products.length, 1);
    return {
      vendorBilled:  totalVendorBilled  * ratio,
      vendorPaid:    totalVendorPaid    * ratio,
      workerAgreed:  totalWorkerAgreed  * ratio,
      workerPaid:    totalWorkerPaid    * ratio,
      extraCost:     extraCostTotal     * ratio,  // already paid
    };
  }

  const grandTotal        = grandProductCost + totalVendorBilled + totalWorkerAgreed + extraCostTotal;
  const totalProjectQty   = products.reduce((s, pp) => s + (parseFloat(pp.total_quantity)||0), 0);
  // Product-level payments from ppPaid state (unsaved edits reflected live)
  const grandProductPaidRaw = products.reduce((s, pp) => {
    const paid = ppPaid[pp.id] || {};
    const fabs = migrateFabrics(pp);
    const fp = fabs.reduce((fs, _f, i) => fs + (parseFloat(paid.fabrics?.[String(i)])||0), 0);
    const cp = (pp.costs||[]).reduce((cs, c) => cs + (parseFloat(paid.costs?.[String(c.key)])||0), 0);
    const ep = (pp.external_costs||[]).reduce((es, e) => es + (parseFloat(paid.external?.[String(e.id)])||0), 0);
    return s + fp + cp + ep;
  }, 0);
  const grandTotalPaid = grandProductPaidRaw + totalVendorPaid + totalWorkerPaid + extraCostTotal;
  const grandDue       = grandTotal - grandTotalPaid;
  // Keep old names for header display section
  const grandProductTotal = grandTotal;
  const grandProductPaid  = grandTotalPaid;

  return (
    <div className="space-y-8">

      {/* ── Product Costs Payment Summary ── */}
      {products.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-indigo-500" />
              <h3 className="font-semibold text-slate-900">Product Costs</h3>
              <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">{products.length}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">Total: <span className="font-semibold text-slate-800">{fmt(grandTotal)}</span></span>
              <span className="text-emerald-600 font-semibold">Paid: {fmt(grandTotalPaid)}</span>
              {grandDue > 0
                ? <span className="text-rose-500 font-semibold">Due: {fmt(grandDue)}</span>
                : grandDue < 0
                  ? <span className="text-emerald-600 font-semibold">Credit: +{fmt(-grandDue)}</span>
                  : <span className="text-emerald-600 font-semibold">✓ Settled</span>
              }
            </div>
          </div>

          <div className="space-y-3">
            {products.map(pp => {
              const fabs       = migrateFabrics(pp);
              const qty        = parseFloat(pp.total_quantity) || 0;
              const paid       = ppPaid[pp.id] || {};
              const isExpanded = expandedPP[pp.id] !== false; // default expanded
              const saving     = savingPP[pp.id];

              // per-product totals — project-level costs (vendors/workers/extra) distributed proportionally
              const fabricTotal = fabs.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);
              const procTotal   = (pp.costs||[]).reduce((s, c) => s + (parseFloat(c.cost_per_piece)||0), 0) * qty;
              const extTotal    = (pp.external_costs||[]).reduce((s, e) => s + (parseFloat(e.total)||0), 0);
              const { vendorBilled: vBilled, vendorPaid: vPaid,
                      workerAgreed: wAgreed, workerPaid: wPaid,
                      extraCost: eShare } = sharesFor(pp);
              const ppTotal     = fabricTotal + procTotal + extTotal + vBilled + wAgreed + eShare;

              const fabricPaid  = fabs.reduce((s, f, i) => s + (parseFloat(paid.fabrics?.[String(f.id ?? i)])||0), 0);
              const costPaid    = (pp.costs||[]).reduce((s, c, i) => s + (parseFloat(paid.costs?.[String(c.key ?? i)])||0), 0);
              const extPaid     = (pp.external_costs||[]).reduce((s, e, i) => s + (parseFloat(paid.external?.[String(e.id ?? i)])||0), 0);
              const ppPaidTotal = fabricPaid + costPaid + extPaid + vPaid + wPaid + eShare;
              const ppRemaining = ppTotal - ppPaidTotal;
              const pct         = ppTotal > 0 ? Math.min(100, Math.round((ppPaidTotal / ppTotal) * 100)) : 0;

              return (
                <div key={pp.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {/* Card header — click to expand/collapse */}
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedPP(prev => ({ ...prev, [pp.id]: !isExpanded }))}
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Package size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{pp.product_name || '—'}</p>
                        {qty > 0 && ppTotal > 0 && (
                          <span className="text-2xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold tracking-tight">
                            {fmt(ppTotal / qty)}/pc
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap">
                        <span className="text-slate-400">Qty: <span className="font-semibold text-slate-600">{qty.toLocaleString()}</span></span>
                        <span className="text-slate-500">Total: <span className="font-semibold text-slate-800">{fmt(ppTotal)}</span></span>
                        <span className="text-emerald-600 font-semibold">Paid: {fmt(ppPaidTotal)}</span>
                        {ppRemaining > 0
                          ? <span className="text-rose-500 font-semibold">Due: {fmt(ppRemaining)}</span>
                          : ppTotal > 0 && <span className="text-emerald-500 font-semibold">✓ Fully paid</span>
                        }
                      </div>
                      {ppTotal > 0 && (
                        <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); saveProductPayments(pp); }}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-60"
                      >
                        {saving ? '...' : <Save size={11} />}
                        {saving ? 'Saving' : 'Save'}
                      </button>
                      {isExpanded
                        ? <ChevronUp   size={16} className="text-slate-400" />
                        : <ChevronDown size={16} className="text-slate-400" />
                      }
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (ppTotal > 0) && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                      {/* Column headers */}
                      <div className="grid text-2xs text-slate-400 font-semibold uppercase tracking-wider gap-3"
                           style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                        <span>Item</span>
                        <span className="text-right">Total</span>
                        <span className="text-right">Paid (₨)</span>
                        <span className="text-right">Remaining</span>
                      </div>

                      {/* ── Fabrics ── */}
                      {fabs.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-2xs text-blue-500 font-bold uppercase tracking-wider">Fabrics</p>
                          {fabs.map((f, i) => {
                            // Always use index i as key — legacy fabrics have id:Date.now()
                            // which changes every render and breaks controlled input binding
                            const fabKey   = String(i);
                            const rowTotal = (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0);
                            const rowPaid  = parseFloat(paid.fabrics?.[fabKey]) || 0;
                            const rowDiff  = rowTotal - rowPaid;
                            return (
                              <div key={i} className="grid items-center gap-3"
                                   style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                                <span className="text-sm text-slate-700 truncate">
                                  {f.name || 'Fabric'}
                                  <span className="text-slate-400 text-xs ml-1">({f.qty} {f.unit})</span>
                                </span>
                                <span className="text-sm text-right text-slate-800 font-medium">{fmt(rowTotal)}</span>
                                <div className="flex justify-end">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={paid.fabrics?.[fabKey] ?? ''}
                                    onChange={ev => setPpPaid(prev => ({
                                      ...prev,
                                      [pp.id]: {
                                        ...(prev[pp.id] || {}),
                                        fabrics: { ...(prev[pp.id]?.fabrics || {}), [fabKey]: ev.target.value },
                                      },
                                    }))}
                                    placeholder="0"
                                    className="w-24 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                                  />
                                </div>
                                {rowDiff > 0
                                  ? <span className="text-sm text-right font-semibold text-rose-500">{fmt(rowDiff)}</span>
                                  : rowDiff < 0
                                    ? <span className="text-sm text-right font-semibold text-emerald-600">+{fmt(-rowDiff)} cr.</span>
                                    : <span className="text-sm text-right font-semibold text-emerald-600">✓</span>
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ── Process Costs ── */}
                      {(pp.costs||[]).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-2xs text-violet-500 font-bold uppercase tracking-wider">Process Costs</p>
                          {(pp.costs||[]).map((c, i) => {
                            const rowTotal = (parseFloat(c.cost_per_piece)||0) * qty;
                            const rowPaid  = parseFloat(paid.costs?.[String(c.key ?? i)]) || 0;
                            const rowDiff  = rowTotal - rowPaid;
                            return (
                              <div key={c.key ?? i} className="grid items-center gap-3"
                                   style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                                <span className="text-sm text-slate-700 truncate">{c.label}</span>
                                <span className="text-sm text-right text-slate-800 font-medium">{fmt(rowTotal)}</span>
                                <div className="flex justify-end">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={paid.costs?.[String(c.key ?? i)] ?? ''}
                                    onChange={ev => setPpPaid(prev => ({
                                      ...prev,
                                      [pp.id]: {
                                        ...(prev[pp.id] || {}),
                                        costs: { ...(prev[pp.id]?.costs || {}), [String(c.key ?? i)]: ev.target.value },
                                      },
                                    }))}
                                    placeholder="0"
                                    className="w-24 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                                  />
                                </div>
                                {rowDiff > 0
                                  ? <span className="text-sm text-right font-semibold text-rose-500">{fmt(rowDiff)}</span>
                                  : rowDiff < 0
                                    ? <span className="text-sm text-right font-semibold text-emerald-600">+{fmt(-rowDiff)} cr.</span>
                                    : <span className="text-sm text-right font-semibold text-emerald-600">✓</span>
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ── External Costs ── */}
                      {(pp.external_costs||[]).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-2xs text-amber-500 font-bold uppercase tracking-wider">External Costs</p>
                          {(pp.external_costs||[]).map((e, i) => {
                            const rowTotal = parseFloat(e.total) || 0;
                            const rowPaid  = parseFloat(paid.external?.[String(e.id ?? i)]) || 0;
                            const rowDiff  = rowTotal - rowPaid;
                            return (
                              <div key={e.id ?? i} className="grid items-center gap-3"
                                   style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                                <span className="text-sm text-slate-700 truncate">{e.label}</span>
                                <span className="text-sm text-right text-slate-800 font-medium">{fmt(rowTotal)}</span>
                                <div className="flex justify-end">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={paid.external?.[String(e.id ?? i)] ?? ''}
                                    onChange={ev => setPpPaid(prev => ({
                                      ...prev,
                                      [pp.id]: {
                                        ...(prev[pp.id] || {}),
                                        external: { ...(prev[pp.id]?.external || {}), [String(e.id ?? i)]: ev.target.value },
                                      },
                                    }))}
                                    placeholder="0"
                                    className="w-24 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                                  />
                                </div>
                                {rowDiff > 0
                                  ? <span className="text-sm text-right font-semibold text-rose-500">{fmt(rowDiff)}</span>
                                  : rowDiff < 0
                                    ? <span className="text-sm text-right font-semibold text-emerald-600">+{fmt(-rowDiff)} cr.</span>
                                    : <span className="text-sm text-right font-semibold text-emerald-600">✓</span>
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Vendor payments row */}
                      {vBilled > 0 && (
                        <div className="grid items-center gap-3 bg-indigo-50 rounded-xl px-3 py-2.5"
                             style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                          <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                            <Store size={11} className="text-indigo-400" /> Vendors
                            {products.length > 1 && <span className="text-2xs text-indigo-400">(proportional)</span>}
                          </span>
                          <span className="text-xs font-semibold text-right text-indigo-800">{fmt(vBilled)}</span>
                          <span className="text-xs font-semibold text-right text-emerald-600">{fmt(vPaid)}</span>
                          {vBilled - vPaid > 0
                            ? <span className="text-xs font-semibold text-right text-rose-500">{fmt(vBilled - vPaid)}</span>
                            : <span className="text-xs font-semibold text-right text-emerald-600">✓</span>
                          }
                        </div>
                      )}

                      {/* Workers row */}
                      {wAgreed > 0 && (
                        <div className="grid items-center gap-3 bg-blue-50 rounded-xl px-3 py-2.5"
                             style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                          <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                            <Users size={11} className="text-blue-400" /> Workers
                            {products.length > 1 && <span className="text-2xs text-blue-400">(proportional)</span>}
                          </span>
                          <span className="text-xs font-semibold text-right text-blue-800">{fmt(wAgreed)}</span>
                          <span className="text-xs font-semibold text-right text-emerald-600">{fmt(wPaid)}</span>
                          {wAgreed - wPaid > 0
                            ? <span className="text-xs font-semibold text-right text-rose-500">{fmt(wAgreed - wPaid)}</span>
                            : <span className="text-xs font-semibold text-right text-emerald-600">✓</span>
                          }
                        </div>
                      )}

                      {/* Extra costs row */}
                      {eShare > 0 && (
                        <div className="grid items-center gap-3 bg-orange-50 rounded-xl px-3 py-2.5"
                             style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                          <span className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                            <Truck size={11} className="text-orange-400" /> Extra Costs
                            {products.length > 1 && <span className="text-2xs text-orange-400">(proportional)</span>}
                          </span>
                          <span className="text-xs font-semibold text-right text-orange-800">{fmt(eShare)}</span>
                          <span className="text-xs font-semibold text-right text-emerald-600">{fmt(eShare)}</span>
                          <span className="text-xs font-semibold text-right text-emerald-600">✓ Paid</span>
                        </div>
                      )}

                      {/* Subtotal row */}
                      <div className="border-t border-slate-100 pt-3 grid gap-3 bg-slate-50 rounded-xl px-3 py-2.5 items-center"
                           style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                        <span className="text-xs font-bold text-slate-700">Total ({qty.toLocaleString()} pcs)</span>
                        <span className="text-xs font-bold text-right text-slate-900">{fmt(ppTotal)}</span>
                        <span className="text-xs font-bold text-right text-emerald-600">{fmt(ppPaidTotal)}</span>
                        {ppRemaining > 0
                          ? <span className="text-xs font-bold text-right text-rose-500">{fmt(ppRemaining)}</span>
                          : ppRemaining < 0
                            ? <span className="text-xs font-bold text-right text-emerald-600">+{fmt(-ppRemaining)} cr.</span>
                            : <span className="text-xs font-bold text-right text-emerald-600">✓ Paid</span>
                        }
                      </div>

                      {/* Cost per Piece highlight */}
                      {qty > 0 && ppTotal > 0 && (
                        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-2xs font-bold uppercase tracking-widest text-indigo-200 mb-0.5">Cost per Piece</p>
                            <p className="text-xs text-indigo-200">
                              {fmt(ppTotal)} ÷ {qty.toLocaleString()} pcs
                              {products.length > 1 && <span className="ml-1 opacity-70">(incl. proportional share)</span>}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-white tracking-tight">{fmt(ppTotal / qty)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && (fabricTotal + procTotal + extTotal) === 0 && vBilled === 0 && wAgreed === 0 && eShare === 0 && (
                    <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-400 italic">
                      No costs entered for this product yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grand total footer (only when multiple products) */}
          {products.length > 1 && (
            <div className="mt-3 bg-gradient-to-r from-indigo-700 to-indigo-600 rounded-2xl px-5 py-4">
              <div className="grid gap-3 items-center" style={{ gridTemplateColumns: '1fr 88px 108px 88px' }}>
                <span className="text-indigo-200 text-xs font-bold uppercase tracking-wider">All Products</span>
                <span className="text-white font-bold text-right">{fmt(grandProductTotal)}</span>
                <span className="text-emerald-300 font-bold text-right">{fmt(grandProductPaid)}</span>
                {grandProductTotal - grandProductPaid > 0
                  ? <span className="font-bold text-right text-rose-300">{fmt(grandProductTotal - grandProductPaid)}</span>
                  : grandProductPaid > grandProductTotal && grandProductTotal > 0
                    ? <span className="font-bold text-right text-emerald-300">+{fmt(grandProductPaid - grandProductTotal)} cr.</span>
                    : <span className="font-bold text-right text-emerald-300">✓ All Paid</span>
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Summary bar ── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
        <p className="text-2xs font-bold uppercase tracking-widest text-slate-400 mb-4">Project Cost Breakdown</p>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {[
            { label: 'Materials + Process', total: grandProductCost,  paid: grandProductPaidRaw, color: 'text-indigo-300' },
            { label: 'Vendors',             total: totalVendorBilled,  paid: totalVendorPaid,     color: 'text-violet-300' },
            { label: 'Workers',             total: totalWorkerAgreed,  paid: totalWorkerPaid,     color: 'text-blue-300'   },
            { label: 'Extra Costs',         total: extraCostTotal,     paid: extraCostTotal,      color: 'text-orange-300' },
            { label: 'TOTAL',               total: grandTotal,         paid: grandTotalPaid,      color: 'text-white', bold: true },
          ].map(s => (
            <div key={s.label} className={s.bold ? 'border-l border-white/10 pl-4' : ''}>
              <p className={`text-2xs font-semibold uppercase tracking-wider mb-1 ${s.bold ? 'text-slate-300' : 'text-slate-400'}`}>{s.label}</p>
              <p className={`font-bold ${s.bold ? 'text-xl text-white' : 'text-base'} ${s.color}`}>{fmt(s.total)}</p>
              <p className="text-2xs text-emerald-400 mt-0.5">Paid: {fmt(s.paid)}</p>
              {s.total - s.paid > 0
                ? <p className="text-2xs text-rose-400">Due: {fmt(s.total - s.paid)}</p>
                : s.total > 0 && <p className="text-2xs text-emerald-400">✓ Settled</p>
              }
            </div>
          ))}
        </div>

        {/* Cost per Piece — project-wide */}
        {totalProjectQty > 0 && grandTotal > 0 && (
          <div className="border-t border-white/10 pt-4 flex items-center justify-between">
            <div>
              <p className="text-2xs font-bold uppercase tracking-widest text-slate-400">
                Average Cost per Piece
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmt(grandTotal)} ÷ {totalProjectQty.toLocaleString()} total pcs
                {products.length > 1 && ' (all products combined)'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-white">{fmt(grandTotal / totalProjectQty)}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Vendors section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Store size={16} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Vendors</h3>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{vendors.length}</span>
          </div>
          {!addingVendor && !editVendor && (
            <button onClick={() => setAddingV(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors">
              <Plus size={12} /> Add Vendor
            </button>
          )}
        </div>

        {(addingVendor && !editVendor) && (
          <div className="mb-4">
            <VendorForm pv={null} allVendors={allVendors} projectProducts={products}
              onSave={saveVendor} onCancel={() => setAddingV(false)} />
          </div>
        )}

        {vendors.length === 0 && !addingVendor ? (
          <div className="text-center py-10 bg-white border border-dashed border-slate-200 rounded-2xl">
            <Store size={24} className="text-slate-200 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No vendors linked. Add vendors to track material & service costs.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vendors.map(pv => {
              const billed = pvBilled(pv);   // computed from tasks if tasks exist
              const paid   = Number(pv.total_paid || 0);
              const bal    = billed - paid;
              const pct    = billed > 0 ? Math.min(100, Math.round((paid/billed)*100)) : 0;
              const typeInfo = VENDOR_TYPES[pv.vendor_type] ?? VENDOR_TYPES.process;
              const TypeIcon = typeInfo.icon;
              const isEditing = editVendor?.id === pv.id;

              return (
                <div key={pv.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {isEditing ? (
                    <div className="p-4">
                      <VendorForm pv={pv} allVendors={allVendors} projectProducts={products}
                        onSave={saveVendor} onCancel={() => setEditV(null)} />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3 px-5 py-4">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
                          <TypeIcon size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900">{pv.vendor_name}</p>
                            {pv.vendor_type && (
                              <span className="text-2xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{typeInfo.label}</span>
                            )}
                          </div>
                          {pv.service_description && (
                            <p className="text-xs text-slate-500 mt-0.5">{pv.service_description}</p>
                          )}
                          {pv.vendor_phone && (
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Phone size={10} />{pv.vendor_phone}</p>
                          )}

                          {/* Task breakdown */}
                          {Array.isArray(pv.tasks) && pv.tasks.length > 0 && (
                            <div className="mt-3 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                              <p className="text-2xs text-slate-400 font-bold uppercase tracking-wider px-3 pt-2.5 pb-1.5 flex items-center gap-1 border-b border-slate-100">
                                <Tag size={9} /> Tasks
                              </p>
                              {pv.tasks.map(t => {
                                const isPerPiece = t.type === 'per_piece';
                                const amt = isPerPiece
                                  ? (parseFloat(t.agreed)||0) * (parseFloat(t.qty)||0)
                                  : (parseFloat(t.agreed)||0);
                                return (
                                  <div key={t.id} className="px-3 py-2 border-b border-slate-100 last:border-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-xs text-slate-700 font-semibold truncate">{t.label}</span>
                                        <span className={`text-2xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${isPerPiece ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                          {isPerPiece ? 'per piece' : 'lump sum'}
                                        </span>
                                      </div>
                                      <span className="text-sm font-bold text-slate-800 whitespace-nowrap flex-shrink-0">{fmt(amt)}</span>
                                    </div>
                                    {isPerPiece && (
                                      <p className="text-2xs text-slate-400 mt-0.5">
                                        {fmt(parseFloat(t.agreed)||0)}/pc × {(parseFloat(t.qty)||0).toLocaleString()} pcs
                                        {t.product_id && t.product_id !== 'all' && (() => {
                                          const prod = products.find(p => String(p.id) === String(t.product_id));
                                          return prod ? ` · ${prod.product_name}` : '';
                                        })()}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                              {pv.tasks.length > 1 && (
                                <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border-t border-indigo-100">
                                  <span className="text-xs text-indigo-600 font-bold">Tasks Total</span>
                                  <span className="text-sm text-indigo-700 font-bold">{fmt(billed)}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Billed / Paid / Due summary */}
                          {billed > 0 && (
                            <div className="mt-3 space-y-1.5">
                              <div className="flex items-center gap-3 text-xs">
                                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-center">
                                  <p className="text-slate-400 text-2xs font-medium mb-0.5">Billed</p>
                                  <p className="font-bold text-slate-800">{fmt(billed)}</p>
                                </div>
                                <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-center">
                                  <p className="text-slate-400 text-2xs font-medium mb-0.5">Paid</p>
                                  <p className="font-bold text-emerald-600">{fmt(paid)}</p>
                                </div>
                                <div className={`flex-1 rounded-lg px-2.5 py-1.5 text-center border ${bal > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                  <p className="text-slate-400 text-2xs font-medium mb-0.5">Due</p>
                                  <p className={`font-bold ${bal > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                    {bal > 0 ? fmt(bal) : '✓ Paid'}
                                  </p>
                                </div>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}

                          {/* Payments list */}
                          {pv.payments?.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                              <p className="text-2xs text-slate-400 font-semibold uppercase tracking-wider">Payment History</p>
                              {pv.payments.map(p => {
                                const hasReceipt = !!p.receipt_url;
                                const isImg = hasReceipt && /\.(jpg|jpeg|png|gif|webp)$/i.test(p.receipt_url);
                                return (
                                  <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                                    <span className="text-slate-500 flex-1">{p.paid_at?.slice(0,10)} · {p.method?.replace('_',' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {hasReceipt && (
                                        isImg ? (
                                          <a href={p.receipt_url} target="_blank" rel="noreferrer">
                                            <img src={p.receipt_url} alt="receipt"
                                              className="h-6 w-6 object-cover rounded border border-slate-200" />
                                          </a>
                                        ) : (
                                          <a href={p.receipt_url} target="_blank" rel="noreferrer"
                                            className="text-indigo-500 hover:text-indigo-700">
                                            <Eye size={12} />
                                          </a>
                                        )
                                      )}
                                      <button
                                        title="Print receipt"
                                        onClick={() => setPrintPayment({ payment: p, pv })}
                                        className="text-slate-300 hover:text-indigo-500 transition-colors">
                                        <Printer size={11} />
                                      </button>
                                      <span className="text-emerald-600 font-semibold">{fmt(p.amount)}</span>
                                      <button onClick={() => deletePayment(pv.id, p.id)}
                                        className="text-slate-300 hover:text-rose-500 transition-colors"><X size={11} /></button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Payment form */}
                          {payingFor === pv.id && (
                            <PaymentForm pvId={pv.id} projectId={pid}
                              onSaved={() => { setPayingFor(null); onReload(); }}
                              onCancel={() => setPayingFor(null)} />
                          )}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {payingFor !== pv.id && (
                            <button onClick={() => { setPayingFor(pv.id); setEditV(null); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium transition-colors">
                              <Banknote size={11} /> Pay
                            </button>
                          )}
                          <button onClick={() => { setEditV(pv); setAddingV(false); setPayingFor(null); }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteVendor(pv.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Workers section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User size={16} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Workers</h3>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{workers.length}</span>
          </div>
          {!addingWorker && !editWorker && (
            <button onClick={() => setAddingW(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors">
              <Plus size={12} /> Add Worker
            </button>
          )}
        </div>

        {(addingWorker && !editWorker) && (
          <div className="mb-4">
            <WorkerForm pw={null} onSave={saveWorker} onCancel={() => setAddingW(false)} />
          </div>
        )}

        {workers.length === 0 && !addingWorker ? (
          <div className="text-center py-10 bg-white border border-dashed border-slate-200 rounded-2xl">
            <Users size={24} className="text-slate-200 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No workers added. Track contract workers & employee assignments here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workers.map(pw => {
              const agreed  = Number(pw.agreed_amount || 0);
              const paid    = Number(pw.paid_amount   || 0);
              const bal     = agreed - paid;
              const isEditing = editWorker?.id === pw.id;

              return (
                <div key={pw.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {isEditing ? (
                    <div className="p-4">
                      <WorkerForm pw={pw} onSave={saveWorker} onCancel={() => setEditW(null)} />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 px-5 py-4">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        pw.worker_type === 'employee' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 bg-slate-100'
                      }`}>
                        <User size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{pw.worker_name}</p>
                          <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${
                            pw.worker_type === 'employee'
                              ? 'bg-indigo-100 text-indigo-600'
                              : 'bg-slate-100 text-slate-500'
                          }`}>{pw.worker_type}</span>
                        </div>
                        {pw.worker_phone && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Phone size={10} />{pw.worker_phone}</p>
                        )}
                        {pw.task_description && (
                          <p className="text-xs text-slate-500 mt-0.5">{pw.task_description}</p>
                        )}
                        {agreed > 0 && (
                          <div className="mt-2 flex items-center gap-4 text-xs">
                            <span className="text-slate-500">Agreed: <span className="font-semibold text-slate-800">{fmt(agreed)}</span></span>
                            <span className="text-blue-600 font-semibold">Paid: {fmt(paid)}</span>
                            {bal > 0 && <span className="text-rose-500 font-semibold">Due: {fmt(bal)}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { setEditW(pw); setAddingW(false); }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteWorker(pw.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Extra Costs section ── */}
      <ExtraCostsSection project={project} onReload={onReload} fmt={fmt} pid={pid} />

      {/* ── Hidden receipt for print ── */}
      {printPayment && (
        <div
          ref={receiptRef}
          style={{ position: 'absolute', left: '-9999px', top: 0, width: '560px', background: '#fff' }}
        >
          <VendorPaymentReceipt
            payment={printPayment.payment}
            pv={printPayment.pv}
            project={project}
            settings={companySettings}
          />
        </div>
      )}
    </div>
  );
}

// ─── Boxes Tab ────────────────────────────────────────────────────────────────

function BoxesTab({ project, onSave, onDelete, onReload, onPrint }) {
  const [addingBox, setAddingBox]       = useState(false);
  const [editBox, setEditBox]           = useState(null);
  const [pcsPerBox, setPcsPerBox]       = useState('');
  const [autoCreating, setAutoCreating] = useState(false);
  const [showAutoPanel, setShowAutoPanel] = useState(false);

  // Shipped-box force-delete modal state
  const [forceDeleteBox, setForceDeleteBox] = useState(null); // box object
  const [deleteNote, setDeleteNote]         = useState('');
  const [deletingId, setDeletingId]         = useState(null);

  // Compute already-boxed quantities: { ppId → { size → qty } }
  const alreadyBoxed = {};
  for (const box of (project.boxes || [])) {
    for (const item of (box.contents || [])) {
      const pid = item.project_product_id;
      if (!alreadyBoxed[pid]) alreadyBoxed[pid] = {};
      for (const sz of (item.sizes || [])) {
        alreadyBoxed[pid][sz.size] = (alreadyBoxed[pid][sz.size] || 0) + (parseFloat(sz.qty) || 0);
      }
    }
  }

  // Remaining unboxed quantities per product/size
  const remainingQty = (ppId, sizeLabel, totalQty) => {
    const boxed = alreadyBoxed[ppId]?.[sizeLabel] || 0;
    return Math.max(0, totalQty - boxed);
  };

  // Auto-create boxes: SEQUENTIAL packing — only pack what isn't already in a box
  async function handleAutoCreate() {
    const pcs = parseInt(pcsPerBox, 10);
    if (!pcs || pcs <= 0) return;

    const products = project.products || [];

    // Build a flat ordered queue using REMAINING (unboxed) quantities
    const queue = [];
    for (const pp of products) {
      for (const sz of (pp.sizes || [])) {
        const total   = parseFloat(sz.qty) || 0;
        const rem     = remainingQty(pp.id, sz.size, total);
        if (rem > 0) queue.push({
          ppId:        pp.id,
          productName: pp.product_name,
          size:        sz.size,
          remaining:   rem,
        });
      }
    }

    const totalUnboxed = queue.reduce((s, q) => s + q.remaining, 0);
    if (totalUnboxed === 0) return alert('All pieces are already packed in existing boxes.');

    const numBoxes = Math.ceil(totalUnboxed / pcs);
    if (numBoxes > 500) return alert(`That would create ${numBoxes} boxes — reduce pieces per box.`);
    if (!window.confirm(
      `This will create ${numBoxes} box${numBoxes!==1?'es':''} of up to ${pcs} pieces each.\n` +
      `Packing the remaining ${totalUnboxed} unboxed pieces (existing boxes are kept).\n` +
      `Sizes are packed sequentially. Continue?`
    )) return;

    setAutoCreating(true);
    try {
      const boxForms = [];
      let currentBox = {};
      let boxSpace   = pcs;

      for (const item of queue) {
        while (item.remaining > 0) {
          if (boxSpace === 0) {
            boxForms.push(currentBox);
            currentBox = {};
            boxSpace   = pcs;
          }
          const take = Math.min(item.remaining, boxSpace);
          if (!currentBox[item.ppId]) currentBox[item.ppId] = { productName: item.productName, sizes: {} };
          currentBox[item.ppId].sizes[item.size] = (currentBox[item.ppId].sizes[item.size] || 0) + take;
          item.remaining -= take;
          boxSpace       -= take;
        }
      }
      if (Object.keys(currentBox).length > 0) boxForms.push(currentBox);

      for (const box of boxForms) {
        const contents = Object.entries(box).map(([ppId, data]) => ({
          project_product_id: Number(ppId),
          product_name:       data.productName,
          sizes: Object.entries(data.sizes).map(([size, qty]) => ({ size, qty })),
        }));
        await onSave({}, { contents, notes: '' });
      }
      setPcsPerBox('');
      setShowAutoPanel(false);
    } finally {
      setAutoCreating(false);
    }
  }

  async function handleShipToggle(box) {
    await api.put(`/projects/${project.id}/boxes/${box.id}/ship`);
    await onReload();
  }

  async function handleDelete(box) {
    if (box.shipped) {
      setForceDeleteBox(box);
      setDeleteNote('');
    } else {
      setDeletingId(box.id);
      try { await onDelete(box.id); }
      finally { setDeletingId(null); }
    }
  }

  async function handleForceDelete() {
    if (!deleteNote.trim()) return;
    setDeletingId(forceDeleteBox.id);
    try {
      await api.delete(`/projects/${project.id}/boxes/${forceDeleteBox.id}`, {
        data: { force_note: deleteNote.trim() },
      });
      await onReload();
      setForceDeleteBox(null);
      setDeleteNote('');
    } finally {
      setDeletingId(null);
    }
  }

  const totalQty    = (project.products||[]).reduce((s,pp)=>s+(parseFloat(pp.total_quantity)||0),0);
  const totalBoxed  = Object.values(alreadyBoxed).reduce((s, szMap) =>
    s + Object.values(szMap).reduce((ss, q) => ss + q, 0), 0);
  const totalLeft   = Math.max(0, totalQty - totalBoxed);

  const pcsNum = parseInt(pcsPerBox, 10) || 0;
  const previewBoxes = pcsNum > 0 && totalLeft > 0 ? Math.ceil(totalLeft / pcsNum) : 0;

  return (
    <div className="space-y-4">

      {/* ── Force-delete modal (shipped box) ── */}
      {forceDeleteBox && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-modal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Delete Shipped Box</h3>
                <p className="text-xs text-slate-400 mt-0.5">Box #{forceDeleteBox.box_number} has been marked shipped</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              This box is marked as <strong>shipped</strong>. To delete it, please provide a reason.
              The note will be logged before deletion.
            </p>
            <textarea
              rows={3}
              value={deleteNote}
              onChange={e => setDeleteNote(e.target.value)}
              placeholder="Reason for deleting shipped box…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => { setForceDeleteBox(null); setDeleteNote(''); }}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                Cancel
              </button>
              <button onClick={handleForceDelete} disabled={!deleteNote.trim() || !!deletingId}
                className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors font-medium">
                {deletingId ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-box panel ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <button
          onClick={() => setShowAutoPanel(p => !p)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Wand2 size={14} className="text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-slate-900 text-sm">Auto-Create Boxes</p>
              <p className="text-xs text-slate-400">
                {totalBoxed > 0
                  ? `${totalBoxed} pieces already boxed · will pack remaining ${totalLeft}`
                  : 'Sequential packing — fills one size completely before the next'}
              </p>
            </div>
          </div>
          {showAutoPanel ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {showAutoPanel && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-4">
            {/* Remaining qty preview */}
            {(project.products||[]).length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Remaining to Pack</p>
                <p className="text-2xs text-slate-400 mb-2">Already-boxed sizes are excluded automatically</p>
                <div className="space-y-2">
                  {(project.products||[]).map(pp => {
                    const remSizes = (pp.sizes||[]).map(sz => ({
                      ...sz,
                      rem: remainingQty(pp.id, sz.size, parseFloat(sz.qty)||0),
                    })).filter(sz => sz.rem > 0);
                    if (!remSizes.length) return (
                      <div key={pp.id} className="flex items-center gap-2">
                        <p className="text-xs text-slate-500 font-semibold">{pp.product_name}</p>
                        <span className="text-2xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">✓ All packed</span>
                      </div>
                    );
                    const pcsN = parseInt(pcsPerBox,10) || 0;
                    return (
                      <div key={pp.id}>
                        <p className="text-xs font-semibold text-slate-600 mb-1.5">{pp.product_name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {remSizes.map((sz, idx) => {
                            const boxes = pcsN > 0 ? Math.ceil(sz.rem / pcsN) : 0;
                            return (
                              <div key={sz.size} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-slate-300 text-xs">→</span>}
                                <span className="text-xs bg-white border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-lg font-semibold shadow-sm">
                                  {sz.size}: {sz.rem} pcs
                                  {pcsN > 0 && (
                                    <span className="text-indigo-400 font-normal ml-1">
                                      ({boxes} box{boxes!==1?'es':''})
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Input + create */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Pieces Per Box</label>
                <input
                  type="number" min="1" step="1"
                  value={pcsPerBox}
                  onChange={e => setPcsPerBox(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-base font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
                />
              </div>
              {previewBoxes > 0 && (
                <div className="flex-shrink-0 text-center bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                  <p className="text-2xl font-bold text-indigo-700">{previewBoxes}</p>
                  <p className="text-2xs text-indigo-400 font-semibold uppercase">New Boxes</p>
                </div>
              )}
              <button
                onClick={handleAutoCreate}
                disabled={autoCreating || !pcsPerBox || parseInt(pcsPerBox,10)<=0 || totalLeft===0}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex-shrink-0">
                {autoCreating
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</>
                  : <><Wand2 size={14} /> Create Boxes</>
                }
              </button>
            </div>
            {totalLeft === 0 && totalQty > 0 && (
              <p className="text-xs text-emerald-600 font-semibold">✓ All {totalQty} pieces are already packed.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {project.boxes.length} box{project.boxes.length !== 1 ? 'es' : ''} ·{' '}
            {totalBoxed} / {totalQty} pieces packed
            {totalLeft > 0 && <span className="text-amber-600 font-semibold"> · {totalLeft} remaining</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onPrint}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-amber-200 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 font-semibold">
            <Printer size={12} /> Print All Boxes
          </button>
          <button onClick={() => { setAddingBox(true); setEditBox(null); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors">
            <Plus size={12} /> Add Box
          </button>
        </div>
      </div>

      {(addingBox || editBox) && (
        <BoxEditor
          box={editBox ?? null}
          project={project}
          onSave={async form => {
            await onSave(editBox ?? {}, form);
            setAddingBox(false); setEditBox(null);
          }}
          onCancel={() => { setAddingBox(false); setEditBox(null); }}
        />
      )}

      {project.boxes.length === 0 && !addingBox && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <PackageOpen size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No boxes yet</p>
          <p className="text-slate-400 text-sm mt-1">Add boxes to define packaging for this project</p>
        </div>
      )}

      {project.boxes.map(box => {
        const totalPcs = (box.contents||[]).reduce((s,item) =>
          s + (item.sizes||[]).reduce((ss,sz) => ss + (parseFloat(sz.qty)||0), 0), 0);
        const isShipped = !!box.shipped;
        return (
          <div key={box.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${isShipped ? 'border-emerald-200' : 'border-slate-200'}`}>
            {/* Shipped notice at top */}
            {isShipped && (
              <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-2 flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                <p className="text-xs font-semibold text-emerald-700">Shipped</p>
                {box.shipped_note && (
                  <p className="text-xs text-emerald-600 ml-1 truncate">— {box.shipped_note}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isShipped ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                  <Box size={14} className={isShipped ? 'text-emerald-600' : 'text-amber-600'} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Box #{box.box_number}</p>
                  <p className="text-xs text-slate-400">{totalPcs} pieces total</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Shipped toggle */}
                <button
                  onClick={() => handleShipToggle(box)}
                  title={isShipped ? 'Mark as not shipped' : 'Mark as shipped'}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isShipped
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}>
                  <CheckCircle2 size={12} />
                  {isShipped ? 'Shipped' : 'Ship?'}
                </button>
                <button onClick={() => { setEditBox(box); setAddingBox(false); }}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(box)}
                  disabled={deletingId === box.id}
                  title={isShipped ? 'Delete shipped box (requires note)' : 'Delete box'}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isShipped
                      ? 'text-rose-300 hover:text-rose-600 hover:bg-rose-50'
                      : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                  }`}>
                  {deletingId === box.id ? <span className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin inline-block" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
            <div className="px-5 py-3">
              {(box.contents||[]).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Empty box</p>
              ) : (
                <div className="space-y-2">
                  {box.contents.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-sm font-medium text-slate-700 w-36 truncate flex-shrink-0">{item.product_name}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(item.sizes||[]).filter(s=>parseFloat(s.qty)>0).map(sz => (
                          <span key={sz.size} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {sz.size}: {parseFloat(sz.qty)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {box.notes && <p className="text-xs text-slate-400 italic mt-2">{box.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Box Editor ───────────────────────────────────────────────────────────────

function BoxEditor({ box, project, onSave, onCancel }) {
  const [contents, setContents] = useState(() =>
    box?.contents?.length ? box.contents : []
  );
  const [notes, setNotes] = useState(box?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function addProduct(pp) {
    if (contents.find(c => c.project_product_id === pp.id)) return;
    setContents(prev => [...prev, {
      project_product_id: pp.id,
      product_name: pp.product_name,
      sizes: (pp.sizes||[]).map(s => ({ size: s.size, qty: 0 })),
    }]);
  }

  function removeContent(ppId) {
    setContents(prev => prev.filter(c => c.project_product_id !== ppId));
  }

  function updateContentSize(ppId, sizeLabel, qty) {
    setContents(prev => prev.map(c =>
      c.project_product_id !== ppId ? c : {
        ...c,
        sizes: c.sizes.map(s => s.size === sizeLabel ? { ...s, qty: parseFloat(qty)||0 } : s),
      }
    ));
  }

  async function handleSave() {
    setSaving(true);
    try { await onSave({ contents, notes }); }
    finally { setSaving(false); }
  }

  const unAdded = project.products.filter(pp => !contents.find(c => c.project_product_id === pp.id));

  return (
    <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 space-y-4">
      <p className="font-semibold text-slate-900">{box ? `Edit Box #${box.box_number}` : 'New Box'}</p>

      {/* Add product */}
      {unAdded.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Add Products to Box</p>
          <div className="flex flex-wrap gap-2">
            {unAdded.map(pp => (
              <button key={pp.id} onClick={() => addProduct(pp)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-indigo-300 text-indigo-600 rounded-xl text-xs font-medium hover:bg-indigo-50 transition-colors">
                <Plus size={11} /> {pp.product_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contents */}
      {contents.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-4">No products added to this box yet.</p>
      ) : (
        <div className="space-y-4">
          {contents.map(item => (
            <div key={item.project_product_id} className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-slate-800">{item.product_name}</p>
                <button onClick={() => removeContent(item.project_product_id)}
                  className="p-1 text-slate-300 hover:text-rose-500 transition-colors"><X size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-3">
                {(item.sizes||[]).map(sz => (
                  <div key={sz.size}>
                    <label className="block text-2xs font-semibold text-center text-slate-500 mb-1">{sz.size}</label>
                    <input type="number" min="0"
                      value={sz.qty === 0 ? '' : sz.qty}
                      onChange={e => updateContentSize(item.project_product_id, sz.size, e.target.value)}
                      placeholder="0"
                      className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-indigo-400 bg-white" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Field label="Box Notes">
        <input value={notes} onChange={e => setNotes(e.target.value)}
          className={inputCls} placeholder="Any notes for this box…" />
      </Field>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Saving…' : box ? 'Save Box' : 'Add Box'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick }) {
  const enabledStages = (project.stages_total ?? 0);
  const doneStages    = (project.stages_done  ?? 0);
  const pct           = enabledStages > 0 ? Math.round((doneStages / enabledStages) * 100) : 0;

  return (
    <div onClick={onClick}
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-150 cursor-pointer group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{project.title}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {project.client_name ?? 'No client'}
            {project.client_company ? ` · ${project.client_company}` : ''}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        <span className="flex items-center gap-1"><Package size={11} /> {project.product_count} product{project.product_count !== 1 ? 's' : ''}</span>
        {project.invoice_number && <span className="flex items-center gap-1"><Receipt size={11} /> {project.invoice_number}</span>}
        <span className="ml-auto text-slate-400">{fmtDate(project.created_at)}</span>
      </div>

      {enabledStages > 0 && (
        <>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1.5">
            <div className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <p className="text-2xs text-slate-400">{doneStages}/{enabledStages} stages complete · {pct}%</p>
        </>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function Projects() {
  const [projects, setProjects]       = useState([]);
  const [loading,  setLoading]        = useState(true);
  const [view,     setView]           = useState('list');  // 'list' | 'detail'
  const [selectedId, setSelectedId]   = useState(null);
  const [modal,    setModal]          = useState(false);
  const [search,   setSearch]         = useState('');
  const [statusFilter, setStatus]     = useState('all');
  const [clients,  setClients]        = useState([]);
  const [invoices, setInvoices]       = useState([]);
  const [catalogProducts, setCatalog] = useState([]);
  const [costFields, setCostFields]   = useState([]);
  const [currencies, setCurrencies]   = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('PKR');

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
      api.get('/clients'),
      api.get('/invoices'),
      api.get('/products'),
      api.get('/cost-breakdown-items'),
      api.get('/currencies'),
      api.get('/settings'),
    ]).then(([c, i, p, cf, cur, s]) => {
      setClients(c.data);
      setInvoices(i.data);
      setCatalog(p.data);
      setCostFields(Array.isArray(cf.data) ? cf.data.filter(x => x.enabled) : []);
      setCurrencies(Array.isArray(cur.data) ? cur.data : []);
      setBaseCurrency((s.data && s.data.base_currency) || 'PKR');
    }).catch(() => {});
  }, [loadProjects]);

  async function handleCreateProject(form) {
    const { data } = await api.post('/projects', form);
    await loadProjects();
    setSelectedId(data.id);
    setView('detail');
  }

  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
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
        onBack={() => { setView('list'); setSelectedId(null); loadProjects(); }}
        clients={clients}
        invoices={invoices}
        catalogProducts={catalogProducts}
        costFields={costFields}
        currencies={currencies}
        baseCurrency={baseCurrency}
        onProjectUpdated={loadProjects}
      />
    );
  }

  const stats = {
    total:     projects.length,
    active:    projects.filter(p => p.status !== 'completed' && p.status !== 'planning').length,
    completed: projects.filter(p => p.status === 'completed').length,
    planning:  projects.filter(p => p.status === 'planning').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track production runs from start to shipment</p>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm w-full sm:w-auto justify-center sm:justify-start">
          <Plus size={16} /> New Project
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Projects', value: stats.total,     icon: Layers,       color: 'text-indigo-600',  bg: 'bg-indigo-50' },
          { label: 'In Production',  value: stats.active,    icon: Flame,        color: 'text-orange-600',  bg: 'bg-orange-50' },
          { label: 'Completed',      value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Planning',       value: stats.planning,  icon: Clock,        color: 'text-slate-600',   bg: 'bg-slate-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`${bg} ${color} p-2.5 rounded-xl`}><Icon size={18} /></div>
            <div><p className="text-2xl font-bold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
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
          {[['all','All'],['planning','Planning'],['completed','Completed']].map(([v,label]) => (
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <ProjectCard key={p.id} project={p} onClick={() => { setSelectedId(p.id); setView('detail'); }} />
          ))}
        </div>
      )}

      {modal && (
        <ProjectModal
          project={null}
          clients={clients}
          invoices={invoices}
          onClose={() => setModal(false)}
          onSave={handleCreateProject}
        />
      )}
    </div>
  );
}
