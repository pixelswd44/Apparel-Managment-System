import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, X, ChevronDown, ChevronUp, Trash2, Pencil, Search,
  Package, Users, FileText, Receipt, Check, AlertTriangle,
  Printer, Box, TrendingUp, TrendingDown, DollarSign, ArrowLeft,
  Clock, CheckCircle2, Circle, ChevronRight, Save,
  Tag, AlertCircle, PackageOpen, Scissors, Layers,
  ToggleLeft, ToggleRight, Flame, Shirt, Wand2,
  MoreHorizontal, Banknote, Eye, GripVertical,
  Store, Phone, Star, CreditCard, Truck, User, Building2,
  ImagePlus, FileImage, Calendar,
} from 'lucide-react';
import api, { apiFetch, imgUrl } from '../lib/api';
import { printDoc } from '../lib/printDoc';

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
  // Project-level bulk fabrics + per-product costs
  const projFabrics     = Array.isArray(project.fabrics) ? project.fabrics : [];
  const projFabricCost  = projFabrics.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);
  const projFabricPaid  = projFabrics.reduce((s, f) => s + (parseFloat(f.amount_paid)||0), 0);
  const productCost    = (project.products||[]).reduce((s,pp)=>s+calcPP(pp).total, 0) + projFabricCost;
  const vendorBilled   = (project.vendors||[]).reduce((s,pv)=>s+pvBilled(pv), 0);
  const workerAgreed   = (project.workers||[]).reduce((s,pw)=>s+Number(pw.agreed_amount||0), 0);
  const _ec = Array.isArray(project.extra_costs) ? project.extra_costs
    : (typeof project.extra_costs === 'string' ? (() => { try { return JSON.parse(project.extra_costs); } catch { return []; } })() : []);
  const extraCostTotal = _ec.reduce((s,e)=>s+(parseFloat(e.amount)||0), 0);
  // Shipping
  const shippingTotal  = (project.shipping||[]).reduce((s,r)=>s+(parseFloat(r.amount)||0), 0);
  const shippingPaid   = (project.shipping||[]).reduce((s,r)=>s+(parseFloat(r.paid_amount)||0), 0);
  const totalExpense   = productCost + vendorBilled + workerAgreed + extraCostTotal + shippingTotal;
  const totalExpenseBeforeShipping = productCost + vendorBilled + workerAgreed + extraCostTotal;

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
  const totalPaid = productPaid + projFabricPaid + vendorPaid + workerPaid + extraCostTotal + shippingPaid;
  const due       = totalExpense - totalPaid;
  // Production-only due (excludes shipping) — used for "✓ Settled" badge on Costs
  const productionDue = totalExpenseBeforeShipping - (productPaid + projFabricPaid + vendorPaid + workerPaid + extraCostTotal);

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
    totalExpense, totalPaid, due, productionDue,
    totalExpenseBeforeShipping,
    // By category (expense / paid)
    productCost, productPaid,
    vendorBilled, vendorPaid,
    workerAgreed, workerPaid,
    extraCostTotal,
    shippingTotal, shippingPaid,
    // Revenue & profit
    received, profit: received - totalExpense,
    profitBeforeShipping: received - totalExpenseBeforeShipping,
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

function ProductLine({ pp, catalogProducts, costFields, invoiceNames = [], onSave, onRemove }) {
  const [expanded, setExpanded] = useState(!pp.id);
  const [form, setForm]         = useState(() => ({
    ...pp,
    sizes:   pp.sizes?.length ? pp.sizes : DEFAULT_SIZES.map(s => ({ size: s, qty: 0 })),
    fabrics: migrateFabrics(pp),
    costs:   pp.costs  || [],
    external_costs: pp.external_costs || [],
  }));
  const [saving, setSaving]             = useState(false);
  const [saveState, setSaveState]       = useState('idle'); // idle | saving | saved | error
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
    setForm(f => ({ ...f, fabrics: [...f.fabrics, { id: Date.now(), name: '', unit: 'KG', qty: '', rate: '', amount_paid: '', date: new Date().toISOString().split('T')[0] }] }));
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
    setForm(f => ({ ...f, external_costs: [...f.external_costs, { id: Date.now(), label: '', total: '', amount_paid: '', date: new Date().toISOString().split('T')[0] }] }));
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

  async function persist(collapse = true) {
    if (!form.product_name.trim()) return;
    setSaving(true);
    setSaveState('saving');
    try {
      const saved = await onSave({ ...form, total_quantity: totalQty });
      const ppId = saved?.id || pp.id;

      // Sync inventory for fabrics — two steps:
      // 1. Stock-in: record purchased qty (auto-creates inventory items if needed)
      // 2. Stock-out: deduct used qty from inventory
      if (ppId) {
        const fabricsForSync = form.fabrics
          .filter(fb => parseFloat(fb.qty) > 0 && (fb.name || '').trim());

        // Step 1: stock-in (purchase) — auto-creates items, returns inventory_item_ids
        let purchaseSynced = [];
        try {
          const res = await api.post('/inventory/sync-project-fabric-purchase', {
            project_product_id: ppId,
            fabrics: fabricsForSync.map(fb => ({
              inventory_item_id: fb.inventory_item_id || findInvMatch(fb.name)?.id || null,
              name: fb.name,
              unit: fb.unit,
              qty:  parseFloat(fb.qty),
              rate: parseFloat(fb.rate) || 0,
            })),
          });
          purchaseSynced = res.data.synced || [];
        } catch { /* non-fatal */ }

        // Step 2: stock-out (used) — use ids returned from purchase sync to ensure linkage
        const invItems = fabricsForSync.map(fb => {
          const matched = purchaseSynced.find(s => s.name.toLowerCase() === fb.name.toLowerCase());
          const invId   = fb.inventory_item_id || findInvMatch(fb.name)?.id || matched?.inventory_item_id;
          if (!invId) return null;
          return { inventory_item_id: invId, qty: parseFloat(fb.qty), name: fb.name };
        }).filter(Boolean);

        await api.post('/inventory/sync-project-product', {
          project_product_id: ppId,
          items: invItems,
        }).catch(() => {});

        // Refresh local inventory list so combobox shows updated stock
        api.get('/inventory')
          .then(r => setInventoryItems(Array.isArray(r.data) ? r.data : []))
          .catch(() => {});
      }

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
            {total > 0 && <span className="text-indigo-600 font-medium">{pkr(total)}</span>}
            {form.fabrics.length > 0 && (
              <span className="text-blue-500">{form.fabrics.length} fabric{form.fabrics.length !== 1 ? 's' : ''}</span>
            )}
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

          {/* ══ Bento grid: Product | Sizes | External Costs ══ */}
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

              {/* ── External Costs card — legacy entries only; new ones live in Costs → Extra Costs ── */}
              {form.external_costs.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0"><Receipt size={12} className="text-amber-600" /></div>
                    <p className="text-xs font-bold text-slate-700">External Costs <span className="font-normal text-slate-400">— new ones go in Costs → Extra Costs</span></p>
                  </div>
                </div>
                {(
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
              )}
          </div>

          {/* ══ Materials card — legacy per-product fabrics only; new materials live in the Fabrics tab ══ */}
          {form.fabrics.length > 0 && (
          <div className="bg-white border border-slate-200 border-t-4 border-t-blue-500 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><Package size={12} className="text-blue-600" /></div>
                <p className="text-xs font-bold text-blue-700">
                  Fabrics & Materials
                  {fabricTotal > 0 && <span className="text-blue-500 ml-2">{pkr(fabricTotal)}</span>}
                  <span className="font-normal text-blue-400 ml-2">— new materials go in the Fabrics tab</span>
                </p>
              </div>
            </div>

            {(
              <div className="space-y-2">
                {/* Header — desktop only */}
                <div className="hidden sm:grid gap-2 px-0.5" style={{ gridTemplateColumns: 'minmax(0,3fr) 72px 76px 92px 80px 26px' }}>
                  {['Name / Material', 'Unit', 'Qty', '₨ per Unit', 'Total', ''].map(h => (
                    <span key={h} className="text-2xs font-bold text-blue-500 uppercase tracking-wider">{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {form.fabrics.map(fb => {
                  const fbTotal = (parseFloat(fb.qty)||0) * (parseFloat(fb.rate)||0);
                  return (
                    <div key={fb.id} className="border border-blue-100 rounded-xl bg-white overflow-hidden">
                      {/* Desktop row */}
                      <div className="hidden sm:grid gap-2 items-center p-1" style={{ gridTemplateColumns: 'minmax(0,3fr) 72px 76px 92px 80px 26px' }}>
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
                              inventory_item_id: item.id,
                            }),
                          }))}
                          onNameChange={val => setForm(f => ({
                            ...f,
                            fabrics: f.fabrics.map(x => x.id !== fb.id ? x : { ...x, name: val, inventory_item_id: null }),
                          }))}
                          onInventoryAdded={() => {
                            api.get('/inventory')
                              .then(r => setInventoryItems(Array.isArray(r.data) ? r.data : []))
                              .catch(() => {});
                          }}
                        />
                        <select value={fb.unit} onChange={e => setFabric(fb.id, 'unit', e.target.value)}
                          className="border border-blue-200 rounded-lg px-1.5 py-2 text-sm outline-none focus:border-blue-400 bg-white cursor-pointer w-full">
                          {FABRIC_UNIT_OPTS.map(u => <option key={u}>{u}</option>)}
                        </select>
                        <input type="number" min="0" step="0.01" value={fb.qty}
                          onChange={e => setFabric(fb.id, 'qty', e.target.value)}
                          placeholder="0"
                          className="border border-blue-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-400 bg-white text-center w-full" />
                        <div className="relative w-full">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none select-none">₨</span>
                          <input type="number" min="0" step="0.01" value={fb.rate}
                            onChange={e => setFabric(fb.id, 'rate', e.target.value)}
                            placeholder="0"
                            className="border border-blue-200 rounded-lg pl-5 pr-2 py-2 text-sm outline-none focus:border-blue-400 bg-white w-full text-right" />
                        </div>
                        <div className={`text-sm font-bold text-center rounded-lg px-1 py-2 ${fbTotal > 0 ? 'text-blue-700 bg-blue-100' : 'text-slate-300 bg-slate-50'}`}>
                          {fbTotal > 0 ? `₨${Math.round(fbTotal).toLocaleString()}` : '—'}
                        </div>
                        <button onClick={() => removeFabric(fb.id)}
                          className="flex items-center justify-center w-6 h-7 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                          <X size={13} />
                        </button>
                      </div>

                      {/* Mobile card */}
                      <div className="sm:hidden p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-2xs font-bold text-blue-500 uppercase tracking-wider mb-1">Name / Material</p>
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
                                  inventory_item_id: item.id,
                                }),
                              }))}
                              onNameChange={val => setForm(f => ({
                                ...f,
                                fabrics: f.fabrics.map(x => x.id !== fb.id ? x : { ...x, name: val, inventory_item_id: null }),
                              }))}
                              onInventoryAdded={() => {
                                api.get('/inventory')
                                  .then(r => setInventoryItems(Array.isArray(r.data) ? r.data : []))
                                  .catch(() => {});
                              }}
                            />
                          </div>
                          <button onClick={() => removeFabric(fb.id)}
                            className="flex-shrink-0 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors mt-4">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-2xs font-bold text-blue-500 uppercase tracking-wider mb-1">Unit</p>
                            <select value={fb.unit} onChange={e => setFabric(fb.id, 'unit', e.target.value)}
                              className="border border-blue-200 rounded-lg px-1.5 py-2 text-sm outline-none focus:border-blue-400 bg-white w-full">
                              {FABRIC_UNIT_OPTS.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <p className="text-2xs font-bold text-blue-500 uppercase tracking-wider mb-1">Qty</p>
                            <input type="number" min="0" step="0.01" value={fb.qty}
                              onChange={e => setFabric(fb.id, 'qty', e.target.value)}
                              placeholder="0"
                              className="border border-blue-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-400 bg-white text-center w-full" />
                          </div>
                          <div>
                            <p className="text-2xs font-bold text-blue-500 uppercase tracking-wider mb-1">₨/Unit</p>
                            <input type="number" min="0" step="0.01" value={fb.rate}
                              onChange={e => setFabric(fb.id, 'rate', e.target.value)}
                              placeholder="0"
                              className="border border-blue-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-400 bg-white w-full text-right" />
                          </div>
                        </div>
                        {fbTotal > 0 && (
                          <div className="flex justify-end">
                            <span className="text-sm font-bold text-blue-700 bg-blue-100 rounded-lg px-3 py-1">
                              ₨{Math.round(fbTotal).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
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
          )}

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
  const boxes  = project.boxes || [];
  const boxPcs = box => (box.contents||[]).reduce((s,item) => s + (item.sizes||[]).reduce((ss,sz) => ss + (parseFloat(sz.qty)||0), 0), 0);
  const grand  = boxes.reduce((s, b) => s + boxPcs(b), 0);

  return (
    <div className="p-8 font-sans text-slate-900 text-sm">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide">Packing List — All Boxes</h1>
          <p className="text-sm text-slate-500 mt-1">
            <strong className="text-slate-800">{project.title}</strong>
            {project.client_name ? ` · ${project.client_name}` : ''}
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p className="font-bold text-slate-800 text-base">{project.status?.toUpperCase()}</p>
          <p>Printed: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
        </div>
      </div>

      {boxes.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No boxes defined for this project.</p>
      ) : (
        <div className="divide-y divide-slate-300 border-y border-slate-300">
          {boxes.map(box => {
            const parts = (box.contents||[]).map(item => {
              const sizes = (item.sizes||[]).filter(s => parseFloat(s.qty) > 0)
                .map(s => `${s.size}×${parseFloat(s.qty)}`).join('  ');
              return `${item.product_name}${sizes ? ` (${sizes})` : ''}`;
            });
            return (
              <div key={box.id} className="py-2.5" style={{ breakInside: 'avoid' }}>
                {/* Row 1: box + total pieces */}
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-black text-base">
                    Box #{box.box_number}
                    {box.shipped && <span className="ml-2 text-xs font-bold text-emerald-700">✓ SHIPPED</span>}
                  </span>
                  <span className="font-bold text-base whitespace-nowrap">{boxPcs(box).toLocaleString()} pcs</span>
                </div>
                {/* Row 2: contents inline */}
                <div className="text-slate-700 mt-0.5">
                  {parts.length ? parts.join('  ·  ') : <span className="italic text-slate-400">empty</span>}
                </div>
                {box.notes && <div className="text-xs text-slate-500 italic mt-0.5">Note: {box.notes}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between font-black text-base mt-3 pt-2">
        <span>TOTAL</span>
        <span>{boxes.length} boxes · {grand.toLocaleString()} pcs</span>
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

const DETAIL_TABS = ['Overview', 'Products', 'Fabrics', 'Costs', 'Shipping'];

// ─── Production pipeline — compact stepper shown above the tabs ───────────────
function StagePipeline({ stages, onUpdate }) {
  const [manage, setManage] = useState(false);
  const sorted  = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const enabled = sorted.filter(s => s.enabled);
  if (enabled.length === 0) return null;

  const done = enabled.filter(s => s.status === 'done').length;
  const pct  = Math.round((done / enabled.length) * 100);
  const NEXT = { pending: 'in_progress', in_progress: 'done', done: 'pending' };

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-2xs font-bold uppercase tracking-widest text-slate-400">Production Progress</p>
        <div className="flex items-center gap-3">
          <span className={`text-2xs font-bold ${pct === 100 ? 'text-emerald-600' : 'text-indigo-600'}`}>
            {done}/{enabled.length} · {pct}%
          </span>
          <button onClick={() => setManage(m => !m)}
            className="text-2xs text-slate-400 hover:text-indigo-600 font-medium flex items-center gap-0.5 transition-colors">
            Manage {manage ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      <div className="flex items-start overflow-x-auto scrollbar-hide pb-1">
        {enabled.map((st, i) => {
          const Icon   = STAGE_ICON[st.stage_key] ?? Package;
          const isDone = st.status === 'done';
          const isProg = st.status === 'in_progress';
          return (
            <div key={st.id} className={`flex items-start ${i < enabled.length - 1 ? 'flex-1' : ''} min-w-0`}>
              <button onClick={() => onUpdate(st.id, { status: NEXT[st.status] || 'in_progress' })}
                title={`${st.stage_name} — click to ${st.status === 'pending' ? 'start' : st.status === 'in_progress' ? 'mark done' : 'reset'}`}
                className="flex flex-col items-center gap-1 group flex-shrink-0 w-16">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  isDone ? 'bg-emerald-500 border-emerald-500 text-white'
                  : isProg ? 'bg-indigo-50 border-indigo-500 text-indigo-600 ring-4 ring-indigo-100'
                  : 'bg-white border-slate-200 text-slate-300 group-hover:border-indigo-300 group-hover:text-indigo-400'
                }`}>
                  {isDone ? <Check size={14} strokeWidth={3} /> : <Icon size={14} className={isProg ? 'animate-pulse' : ''} />}
                </span>
                <span className={`text-2xs font-medium leading-tight text-center truncate w-full ${
                  isDone ? 'text-emerald-600' : isProg ? 'text-indigo-600 font-semibold' : 'text-slate-400'
                }`}>{st.stage_name}</span>
              </button>
              {i < enabled.length - 1 && (
                <div className={`flex-1 h-0.5 mt-4 rounded ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Full stage management (sub-tasks, optional-stage toggles) */}
      {manage && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <StagesTab stages={stages} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

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

// ─── Fabrics Tab — project-level bulk materials (auto-saves) ─────────────────
function FabricsTab({ project, onReload }) {
  const [rows, setRows] = useState(() => (Array.isArray(project.fabrics) ? project.fabrics : []));
  const [inventoryItems, setInventoryItems] = useState([]);
  const [saveState, setSaveState] = useState('idle');
  const ready = useRef(false);

  useEffect(() => {
    api.get('/inventory').then(r => setInventoryItems(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const total     = rows.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);
  const totalPaid = rows.reduce((s, f) => s + (parseFloat(f.amount_paid)||0), 0);
  const totalDue  = Math.max(0, total - totalPaid);

  function payAll() {
    setRows(rs => rs.map(r => ({ ...r, amount_paid: String((parseFloat(r.qty)||0) * (parseFloat(r.rate)||0)) })));
  }

  // Legacy materials still attached to individual products (edited there)
  const legacy = (project.products||[]).flatMap(pp => (pp.fabrics||[]).map(f => ({ ...f, _product: pp.product_name })));
  const legacyTotal = legacy.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);

  function setRow(id, field, val) { setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: val } : r)); }
  function addRow() { setRows(rs => [...rs, { id: Date.now(), name: '', unit: 'KG', qty: '', rate: '', amount_paid: '', date: new Date().toISOString().split('T')[0] }]); }
  function removeRow(id) { setRows(rs => rs.filter(r => r.id !== id)); }

  // Debounced autosave + inventory sync (idempotent on the server)
  useEffect(() => {
    if (!ready.current) { ready.current = true; return; }
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.put(`/projects/${project.id}/fabrics`, { fabrics: rows });
        const forSync = rows.filter(f => parseFloat(f.qty) > 0 && (f.name||'').trim());
        let purchaseSynced = [];
        try {
          const res = await api.post('/inventory/sync-project-fabric-purchase', {
            project_product_id: `p${project.id}`,   // project-level reference
            fabrics: forSync.map(f => ({
              inventory_item_id: f.inventory_item_id || null,
              name: f.name, unit: f.unit, qty: parseFloat(f.qty), rate: parseFloat(f.rate) || 0,
            })),
          });
          purchaseSynced = res.data.synced || [];
        } catch { /* non-fatal */ }
        const items = forSync.map(f => {
          const matched = purchaseSynced.find(s => (s.name||'').toLowerCase() === (f.name||'').toLowerCase());
          const invId = f.inventory_item_id || matched?.inventory_item_id;
          return invId ? { inventory_item_id: invId, qty: parseFloat(f.qty), name: f.name } : null;
        }).filter(Boolean);
        await api.post('/inventory/sync-project-product', { project_product_id: `p${project.id}`, items }).catch(() => {});
        setSaveState('saved');
        onReload?.();
      } catch { setSaveState('error'); }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 border-t-4 border-t-blue-500 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><Package size={12} className="text-blue-600" /></div>
            <p className="text-xs font-bold text-blue-700">Bulk Fabrics & Materials</p>
            {saveState === 'saving' && <span className="text-2xs text-slate-400 flex items-center gap-1"><span className="w-3 h-3 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" /> Saving…</span>}
            {saveState === 'saved'  && <span className="text-2xs font-semibold text-emerald-500">✓ Saved</span>}
            {saveState === 'error'  && <span className="text-2xs font-semibold text-rose-500">Save failed</span>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {total > 0 && (
              <span className="text-xs">
                <span className="text-slate-500">Total: <b className="text-slate-700">{pkr(total)}</b></span>
                <span className="text-emerald-600 ml-2">Paid: <b>{pkr(totalPaid)}</b></span>
                {totalDue > 0
                  ? <span className="text-rose-500 ml-2">Due: <b>{pkr(totalDue)}</b></span>
                  : <span className="text-emerald-500 ml-2 font-semibold">✓ Settled</span>}
              </span>
            )}
            {totalDue > 0 && (
              <button onClick={payAll}
                className="flex items-center gap-1 text-xs text-amber-700 font-semibold border border-amber-200 bg-amber-50 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                Pay All
              </button>
            )}
            <button onClick={addRow}
              className="flex items-center gap-1 text-xs text-blue-600 font-semibold border border-blue-200 bg-white px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">
              <Plus size={11} /> Add Material
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-blue-400 italic">No materials yet.</p>
            <p className="text-2xs text-blue-300 mt-0.5">Bulk fabric, accessories & supplies for the whole project — auto-saves as you type.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid gap-2 px-0.5" style={{ gridTemplateColumns: 'minmax(0,3fr) 72px 76px 92px 80px 92px 34px 26px' }}>
              {['Name / Material', 'Unit', 'Qty', '₨ per Unit', 'Total', 'Paid (₨)', '', ''].map((h, i) => (
                <span key={i} className="text-2xs font-bold text-blue-500 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {rows.map(fb => {
              const fbTotal = (parseFloat(fb.qty)||0) * (parseFloat(fb.rate)||0);
              const fbPaid  = parseFloat(fb.amount_paid)||0;
              const fbDue   = fbTotal - fbPaid;
              return (
                <div key={fb.id} className="border border-blue-100 rounded-xl bg-white overflow-hidden">
                  <div className="grid gap-2 items-center p-1" style={{ gridTemplateColumns: 'minmax(0,3fr) 72px 76px 92px 80px 92px 34px 26px' }}>
                    <FabricCombobox
                      value={fb.name}
                      inventoryItems={inventoryItems}
                      onSelect={item => setRows(rs => rs.map(x => x.id !== fb.id ? x : ({
                        ...x, name: item.name, unit: item.unit || x.unit, rate: String(item.rate || ''), inventory_item_id: item.id,
                      })))}
                      onNameChange={val => setRows(rs => rs.map(x => x.id !== fb.id ? x : ({ ...x, name: val, inventory_item_id: null })))}
                      onInventoryAdded={() => {
                        api.get('/inventory').then(r => setInventoryItems(Array.isArray(r.data) ? r.data : [])).catch(() => {});
                      }}
                    />
                    <select value={fb.unit} onChange={e => setRow(fb.id, 'unit', e.target.value)}
                      className="border border-blue-200 rounded-lg px-1.5 py-2 text-sm outline-none focus:border-blue-400 bg-white cursor-pointer w-full">
                      {FABRIC_UNIT_OPTS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={fb.qty}
                      onChange={e => setRow(fb.id, 'qty', e.target.value)} placeholder="0"
                      className="border border-blue-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-400 bg-white text-center w-full" />
                    <div className="relative w-full">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none select-none">₨</span>
                      <input type="number" min="0" step="0.01" value={fb.rate}
                        onChange={e => setRow(fb.id, 'rate', e.target.value)} placeholder="0"
                        className="border border-blue-200 rounded-lg pl-5 pr-2 py-2 text-sm outline-none focus:border-blue-400 bg-white w-full text-right" />
                    </div>
                    <div className={`text-sm font-bold text-center rounded-lg px-1 py-2 ${fbTotal > 0 ? 'text-blue-700 bg-blue-100' : 'text-slate-300 bg-slate-50'}`}>
                      {fbTotal > 0 ? `₨${Math.round(fbTotal).toLocaleString()}` : '—'}
                    </div>
                    <input type="number" min="0" step="0.01" value={fb.amount_paid}
                      onChange={e => setRow(fb.id, 'amount_paid', e.target.value)} placeholder="0"
                      className={`border rounded-lg px-2 py-2 text-sm outline-none bg-white w-full text-right ${
                        fbTotal > 0 && fbPaid >= fbTotal ? 'border-emerald-300 text-emerald-700 font-semibold' : 'border-blue-200 focus:border-blue-400'
                      }`} />
                    <div className="text-center" title={fbDue > 0 ? `₨${Math.round(fbDue).toLocaleString()} remaining` : 'Fully paid'}>
                      {fbTotal > 0 && (
                        fbPaid >= fbTotal
                          ? <span className="text-emerald-500 font-bold text-sm">✓</span>
                          : <span className="text-2xs text-rose-500 font-semibold">-{Math.round(fbDue/1000)}k</span>
                      )}
                    </div>
                    <button onClick={() => removeRow(fb.id)}
                      className="flex items-center justify-center w-6 h-7 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            {rows.length > 1 && total > 0 && (
              <div className="flex items-center justify-between bg-blue-100 rounded-lg px-3 py-2 mt-1">
                <span className="text-xs text-blue-700 font-semibold">Total Material Cost</span>
                <span className="text-sm font-bold text-blue-800">
                  {pkr(total)}
                  <span className="font-normal text-blue-600 ml-2 text-xs">Paid {pkr(totalPaid)}{totalDue > 0 ? ` · Due ${pkr(totalDue)}` : ''}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legacy per-product materials — still counted in totals */}
      {legacy.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-2xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Materials attached to products <span className="normal-case font-normal">(older entries — edit inside each product)</span>
          </p>
          <div className="space-y-1">
            {legacy.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                <span className="text-slate-600 truncate">{f.name || '—'} <span className="text-slate-300">· {f._product}</span></span>
                <span className="text-slate-500 whitespace-nowrap ml-2">{f.qty} {f.unit} × ₨{(parseFloat(f.rate)||0).toLocaleString()} = <span className="font-semibold text-slate-700">₨{Math.round((parseFloat(f.qty)||0)*(parseFloat(f.rate)||0)).toLocaleString()}</span></span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1.5">
              <span className="font-semibold text-slate-500">Subtotal</span>
              <span className="font-bold text-slate-700">₨{Math.round(legacyTotal).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ projectId, onBack, clients, invoices, catalogProducts, costFields, currencies, baseCurrency, onProjectUpdated }) {
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
      materials: 'Materials Purchase List',
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
          <button onClick={() => setPrint('materials')}
            className="flex items-center gap-1 px-2.5 py-1 text-2xs border border-violet-200 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 font-semibold transition-colors whitespace-nowrap flex-shrink-0">
            <Package size={11} /> Materials
          </button>
        </div>
        <StatusBadge status={project.status} />
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
        const pocketDiff  = fin.totalPaid - fin.received;
        const pocketLoss  = pocketDiff > 0;
        const projProfit  = fin.profit >= 0;
        const items = [
          { label: 'Expense',  val: fmt(fin.totalExpense), dot: 'bg-rose-500',    cls: 'text-slate-800' },
          { label: 'Received', val: fmt(fin.received),     dot: 'bg-emerald-500', cls: 'text-slate-800' },
          { label: projProfit ? 'Profit' : 'Loss',
            val: `${projProfit ? '' : '−'}${fmt(Math.abs(fin.profit))}`,
            sub: fin.received > 0 ? `${((fin.profit / fin.received) * 100).toFixed(1)}%` : null,
            dot: projProfit ? 'bg-amber-500' : 'bg-rose-600',
            cls: projProfit ? 'text-amber-600' : 'text-rose-600' },
          { label: 'Out of Pocket',
            val: `${pocketLoss ? '−' : '+'}${fmt(Math.abs(pocketDiff))}`,
            dot: pocketLoss ? 'bg-rose-400' : 'bg-emerald-400',
            cls: pocketLoss ? 'text-rose-600' : 'text-emerald-600' },
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

      {/* ── Production pipeline ── */}
      <StagePipeline stages={project.stages || []} onUpdate={handleStageUpdate} />

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
        const prods          = project.products || [];
        const totalQtyAll    = prods.reduce((s, pp) => s + (parseFloat(pp.total_quantity)||0), 0);
        const recvPerPc      = totalQtyAll > 0 && fin.received > 0 ? fin.received / totalQtyAll : 0;
        return (
          <div className="space-y-5">

            {/* ── Spending breakdown ── */}
            <div className="grid grid-cols-1 gap-4">

              {/* Spending breakdown with bars */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
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
                      { label: 'Shipping',            val: fin.shippingTotal,  color: 'bg-sky-400'    },
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
                      {fin.productionDue > 0
                        ? <span className="text-rose-500 font-semibold">Due: {fmt(fin.productionDue)}{fin.shippingTotal > 0 ? ` (+${fmt(fin.shippingTotal - fin.shippingPaid)} ship)` : ''}</span>
                        : fin.shippingTotal > 0 && fin.shippingPaid < fin.shippingTotal
                          ? <span className="text-amber-500 font-semibold">Costs Settled · Ship Due: {fmt(fin.shippingTotal - fin.shippingPaid)}</span>
                          : <span className="text-emerald-500 font-semibold">✓ Settled</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No expenses recorded yet.</p>
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

      {/* ── Fabrics Tab (project-level bulk materials) ── */}
      {tab === 'Fabrics' && (
        <FabricsTab project={project} onReload={load} />
      )}

      {/* ── Shipping Tab (boxes + shipping) ── */}
      {tab === 'Shipping' && (
        <div className="space-y-8">
          <BoxesTab project={project} onSave={handleSaveBox} onDelete={handleDeleteBox} onReload={load} onPrint={() => setPrint('packaging')} />
          <ShippingTab project={project} onReload={load} />
        </div>
      )}

      {/* ── Costs Tab (costs + vendors + workers) ── */}
      {tab === 'Costs' && (
        <CostsTab project={project} onReload={load} fmt={fmt} view="all" />
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
            <div className="flex items-start gap-3 px-4 py-4 flex-wrap sm:flex-nowrap">
              {/* Sort order + Icon */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-xs font-bold text-slate-300 w-4 text-center">{idx + 1}</div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  stage.enabled ? color : 'text-slate-300 bg-slate-100'
                }`}>
                  <Icon size={16} />
                </div>
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

              {/* Controls: toggle + status buttons */}
              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
                {isLegacyOptional && (
                  <button onClick={() => onUpdate(stage.id, { enabled: !stage.enabled, status: 'pending' })}
                    className="transition-colors">
                    {stage.enabled
                      ? <ToggleRight size={20} className="text-indigo-600" />
                      : <ToggleLeft  size={20} className="text-slate-300" />}
                  </button>
                )}
                {stage.enabled && <StageStatusButtons stage={stage} onUpdate={onUpdate} />}
              </div>
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
  const totalProjectQty = projectProducts.reduce((s, pp) => s + (parseFloat(pp.total_quantity) || 0), 0);
  const [form, setForm] = useState({
    vendor_id:           pv?.vendor_id           ?? '',
    vendor_name:         pv?.vendor_name         ?? '',
    service_description: pv?.service_description ?? '',
    invoice_amount:      pv?.invoice_amount      ?? '',
    currency:            pv?.currency            ?? 'PKR',
    notes:               pv?.notes               ?? '',
    tasks:               Array.isArray(pv?.tasks) ? pv.tasks : [],
  });
  const [saving, setSaving]    = useState(false);
  const [newTaskLabel, setNTL] = useState('');
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // '__manual__' means user wants to type a name manually
  const [vendorMode, setVendorMode] = useState(
    pv?.vendor_id ? 'catalog' : (pv?.vendor_name ? 'manual' : 'catalog')
  );

  function pickVendor(vid) {
    if (vid === '__manual__') {
      setVendorMode('manual');
      set('vendor_id', '');
    } else {
      setVendorMode('catalog');
      const v = allVendors.find(x => String(x.id) === String(vid));
      set('vendor_id', vid);
      set('vendor_name', v ? v.name : '');
    }
  }

  // Each task: { id, label, type: 'lump_sum' | 'per_piece', agreed, qty }
  function taskAmt(t) {
    if (t.type === 'per_piece') return (parseFloat(t.agreed) || 0) * (parseFloat(t.qty) || 0);
    return parseFloat(t.agreed) || 0;
  }
  const tasksTotal = form.tasks.reduce((s, t) => s + taskAmt(t), 0);

  function addTask(label) {
    const l = (label || newTaskLabel).trim();
    if (!l) return;
    setForm(f => ({
      ...f,
      tasks: [...f.tasks, {
        id: `t-${Date.now()}`, label: l, type: 'lump_sum',
        agreed: '', qty: String(totalProjectQty || ''), cost_key: '', product_id: 'all',
      }],
    }));
    setNTL('');
  }
  function setTaskField(id, field, val) {
    setForm(f => ({ ...f, tasks: f.tasks.map(t => t.id === id ? { ...t, [field]: val } : t) }));
  }
  function removeTask(id) {
    setForm(f => ({ ...f, tasks: f.tasks.filter(t => t.id !== id) }));
  }

  async function save() {
    if (!form.vendor_name.trim()) return;
    setSaving(true);
    try {
      const finalAmount = tasksTotal || (parseFloat(form.invoice_amount) || 0);
      await onSave({ ...form, invoice_amount: finalAmount });
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">

      {/* ── Vendor ── */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Vendor *</label>
        <select
          value={vendorMode === 'manual' ? '__manual__' : (form.vendor_id || '')}
          onChange={e => pickVendor(e.target.value)}
          className={selectCls}>
          <option value="">— Select Vendor —</option>
          {allVendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
          <option value="__manual__">✏ Add New (manual)</option>
        </select>
        {vendorMode === 'manual' && (
          <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)}
            className={`${inputCls} mt-2`} placeholder="Enter vendor name" autoFocus />
        )}
      </div>

      {/* ── Tasks: name + per-piece or total ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
          <Tag size={13} className="text-indigo-500" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tasks</span>
          {form.tasks.length > 0 && (
            <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">{form.tasks.length}</span>
          )}
        </div>

        {form.tasks.length > 0 && (
          <div className="divide-y divide-slate-50">
            {form.tasks.map(t => {
              const isPerPiece = t.type === 'per_piece';
              const lineTotal  = taskAmt(t);
              return (
                <div key={t.id} className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                  <input
                    value={t.label}
                    onChange={e => setTaskField(t.id, 'label', e.target.value)}
                    className="flex-1 text-sm border-0 bg-transparent outline-none text-slate-800 font-medium placeholder:text-slate-400 min-w-[120px]"
                    placeholder="Task name"
                  />
                  {/* Per piece / total toggle */}
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0 text-2xs font-semibold">
                    <button type="button" onClick={() => setTaskField(t.id, 'type', 'lump_sum')}
                      className={`px-2.5 py-1.5 transition-colors ${!isPerPiece ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                      Total
                    </button>
                    <button type="button"
                      onClick={() => {
                        setTaskField(t.id, 'type', 'per_piece');
                        if (!t.qty || t.qty === '0') setTaskField(t.id, 'qty', String(totalProjectQty || ''));
                      }}
                      className={`px-2.5 py-1.5 transition-colors border-l border-slate-200 ${isPerPiece ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                      Per Piece
                    </button>
                  </div>
                  {isPerPiece ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-2xs text-slate-400">₨/pc</span>
                      <input type="text" inputMode="decimal" value={t.agreed}
                        onChange={e => setTaskField(t.id, 'agreed', e.target.value)} placeholder="Rate"
                        className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400" />
                      <span className="text-slate-300">×</span>
                      <input type="text" inputMode="decimal" value={t.qty}
                        onChange={e => setTaskField(t.id, 'qty', e.target.value)} placeholder="pcs"
                        className="w-16 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-2xs text-slate-400">₨</span>
                      <input type="text" inputMode="decimal" value={t.agreed}
                        onChange={e => setTaskField(t.id, 'agreed', e.target.value)} placeholder="0"
                        className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400" />
                    </div>
                  )}
                  <span className={`text-sm font-bold w-24 text-right flex-shrink-0 ${lineTotal > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                    {lineTotal > 0 ? `₨${Math.round(lineTotal).toLocaleString()}` : '—'}
                  </span>
                  <button type="button" onClick={() => removeTask(t.id)}
                    className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/60">
              <span className="text-xs text-indigo-600 font-semibold">Total</span>
              <span className="text-sm font-bold text-indigo-700">₨{Math.round(tasksTotal).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Add task */}
        <div className="px-3 py-2.5 border-t border-slate-100">
          <div className="flex flex-wrap gap-1 mb-2">
            {TASK_PRESETS.filter(p => !form.tasks.find(t => t.label === p)).slice(0, 8).map(p => (
              <button key={p} type="button" onClick={() => addTask(p)}
                className="text-2xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors font-medium">
                + {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newTaskLabel}
              onChange={e => setNTL(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              className={`${inputCls} flex-1`}
              placeholder="Task name (e.g. Stitching, Embroidery)…"
            />
            <button type="button" onClick={() => addTask()}
              disabled={!newTaskLabel.trim()}
              className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              Add
            </button>
          </div>
        </div>
      </div>

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
              <img src={imgUrl(form.receipt_url)} alt="receipt"
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

const WORKER_TASK_PRESETS = ['Cutting', 'Stitching', 'Sublimation', 'Embroidery', 'Screen Print', 'Pressing', 'Packing'];

function WorkerForm({ pw, project, onSave, onCancel }) {
  const projQty = (project?.products||[]).reduce((s, p) => s + (parseFloat(p.total_quantity)||0), 0);
  // Recover per-piece breakdown from a previously saved description
  const ppMatch = /₨([\d.]+)\/pc × ([\d,.]+)/.exec(pw?.task_description || '');
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    worker_type:       pw?.worker_type       ?? 'contract',
    employee_id:       pw?.employee_id       ?? '',
    worker_name:       pw?.worker_name       ?? '',
    worker_phone:      pw?.worker_phone      ?? '',
    task_description:  (pw?.task_description ?? '').replace(/\s*\(₨[\d.]+\/pc × [\d,.]+ pcs\)\s*$/, ''),
    rate_mode:         ppMatch ? 'per_piece' : 'total',
    rate:              ppMatch ? ppMatch[1] : '',
    qty:               ppMatch ? ppMatch[2].replace(/,/g, '') : (projQty || ''),
    agreed_amount:     pw?.agreed_amount     ?? '',
    paid_amount:       pw?.paid_amount       ?? '',
    notes:             pw?.notes             ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const perPieceTotal = (parseFloat(form.rate)||0) * (parseFloat(form.qty)||0);
  const agreed = form.rate_mode === 'per_piece' ? perPieceTotal : (parseFloat(form.agreed_amount)||0);

  function pickEmployee(id) {
    const emp = employees.find(e => String(e.id) === String(id));
    setForm(f => ({ ...f, employee_id: id, worker_name: emp?.name || f.worker_name, worker_phone: emp?.phone || f.worker_phone }));
  }

  async function save() {
    if (!form.worker_name.trim()) return;
    setSaving(true);
    try {
      const desc = form.task_description.trim();
      await onSave({
        worker_type:      form.worker_type,
        employee_id:      form.worker_type === 'employee' ? (form.employee_id || null) : null,
        worker_name:      form.worker_name,
        worker_phone:     form.worker_phone,
        task_description: form.rate_mode === 'per_piece'
          ? `${desc} (₨${parseFloat(form.rate)||0}/pc × ${(parseFloat(form.qty)||0).toLocaleString()} pcs)`
          : desc,
        agreed_amount:    agreed,
        paid_amount:      form.paid_amount,
        notes:            form.notes,
      });
    } finally { setSaving(false); }
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
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
            {form.worker_type === 'employee' ? 'Employee *' : 'Name *'}
          </label>
          {form.worker_type === 'employee' && employees.length > 0 ? (
            <select value={form.employee_id || ''} onChange={e => pickEmployee(e.target.value)} className={selectCls}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          ) : (
            <input value={form.worker_name} onChange={e => set('worker_name', e.target.value)}
              className={inputCls} placeholder="Worker name" />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Phone</label>
          <input value={form.worker_phone} onChange={e => set('worker_phone', e.target.value)}
            className={inputCls} placeholder="+92 300…" />
        </div>
      </div>

      {/* Task presets + description */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Task</label>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {WORKER_TASK_PRESETS.map(t => (
            <button key={t} type="button" onClick={() => set('task_description', t)}
              className={`text-2xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                form.task_description === t
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 bg-white'
              }`}>
              {t}
            </button>
          ))}
        </div>
        <input value={form.task_description} onChange={e => set('task_description', e.target.value)}
          className={inputCls} placeholder="e.g. Stitching 200 jackets" />
      </div>

      {/* Rate: per-piece or total */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost</label>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {[['total','Total'],['per_piece','Per Piece']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('rate_mode', v)}
                className={`text-2xs px-2.5 py-1 rounded-md font-semibold transition-all ${
                  form.rate_mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {form.rate_mode === 'per_piece' ? (
            <>
              <div>
                <label className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">₨ / piece</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
                  <input type="number" min="0" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)}
                    className={`${inputCls} pl-7`} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Pieces</label>
                <input type="number" min="0" value={form.qty} onChange={e => set('qty', e.target.value)}
                  className={inputCls} placeholder={projQty ? String(projQty) : '0'} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Agreed Total</label>
                <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-bold text-indigo-700">
                  {pkr(perPieceTotal)}
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Agreed Amount (PKR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
                <input type="number" min="0" value={form.agreed_amount} onChange={e => set('agreed_amount', e.target.value)}
                  className={`${inputCls} pl-7`} placeholder="0" />
              </div>
            </div>
          )}
          <div>
            <label className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Paid So Far (PKR)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₨</span>
              <input type="number" min="0" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)}
                className={`${inputCls} pl-7`} placeholder="0" />
            </div>
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
            ? <img src={imgUrl(settings.company_logo)} alt="logo" style={{ height:'36px', objectFit:'contain', display:'block', marginBottom:'4px' }} />
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

function CostsTab({ project, onReload, fmt = pkr, view = 'all' }) {
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
    api.get('/vendors').then(r => setAllVendors(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // Fetch company settings for receipt header
  useEffect(() => {
    api.get('/settings').then(r => setCompanySettings(r.data || {})).catch(() => {});
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
      (pp.external_costs || []).forEach((e, i) => { external[String(i)] = String(e.amount_paid ?? ''); });
      init[pp.id] = { fabrics, costs, external };
    });
    setPpPaid(init);
  }, [project]);

  async function saveProductPayments(pp) {
    setSavingPP(prev => ({ ...prev, [pp.id]: true }));
    try {
      const paid = ppPaid[pp.id] || {};
      const fabs = migrateFabrics(pp);
      const today = new Date().toISOString().split('T')[0];
      const updatedForm = {
        ...pp,
        fabrics: fabs.map((f, i) => {
          const amount_paid = paid.fabrics?.[String(i)] ?? f.amount_paid ?? '';
          // Stamp today as the payment date the first time amount_paid is recorded
          const date = f.date || (parseFloat(amount_paid) > 0 ? today : undefined);
          return { ...f, amount_paid, ...(date ? { date } : {}) };
        }),
        costs: (pp.costs || []).map((c, i) => {
          const amount_paid = paid.costs?.[String(c.key ?? i)] ?? c.amount_paid ?? '';
          const date = c.date || (parseFloat(amount_paid) > 0 ? today : undefined);
          return { ...c, amount_paid, ...(date ? { date } : {}) };
        }),
        external_costs: (pp.external_costs || []).map((e, i) => {
          const amount_paid = paid.external?.[String(i)] ?? e.amount_paid ?? '';
          const date = e.date || (parseFloat(amount_paid) > 0 ? today : undefined);
          return { ...e, amount_paid, ...(date ? { date } : {}) };
        }),
      };
      await api.put(`/projects/${pid}/products/${pp.id}`, updatedForm);
      onReload();
    } finally {
      setSavingPP(prev => ({ ...prev, [pp.id]: false }));
    }
  }

  async function saveVendor(form) {
    try {
      if (editVendor) {
        await api.put(`/projects/${pid}/vendors/${editVendor.id}`, form);
      } else {
        await api.post(`/projects/${pid}/vendors`, form);
      }
      setAddingV(false); setEditV(null); onReload();
    } catch (e) { console.error('saveVendor', e); }
  }

  async function deleteVendor(pvId) {
    if (!confirm('Remove this vendor from the project?')) return;
    try { await api.delete(`/projects/${pid}/vendors/${pvId}`); } catch {}
    onReload();
  }

  async function deletePayment(pvId, payId) {
    try { await api.delete(`/projects/${pid}/vendors/${pvId}/payments/${payId}`); } catch {}
    onReload();
  }

  async function saveWorker(form) {
    try {
      if (editWorker) {
        await api.put(`/projects/${pid}/workers/${editWorker.id}`, form);
      } else {
        await api.post(`/projects/${pid}/workers`, form);
      }
      setAddingW(false); setEditW(null); onReload();
    } catch (e) { console.error('saveWorker', e); }
  }

  async function deleteWorker(wId) {
    if (!confirm('Remove this worker from the project?')) return;
    try { await api.delete(`/projects/${pid}/workers/${wId}`); } catch {}
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

      {/* ── Product Costs Payment Summary — legacy per-product costs only ── */}
      {(view === 'all' || view === 'costs') && products.some(pp =>
        (pp.fabrics||[]).length > 0 || (pp.costs||[]).length > 0 || (pp.external_costs||[]).length > 0
      ) && (
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

              const fabricPaid  = fabs.reduce((s, f, i) => s + (parseFloat(paid.fabrics?.[String(i)])||0), 0);
              const costPaid    = (pp.costs||[]).reduce((s, c, i) => s + (parseFloat(paid.costs?.[String(c.key ?? i)])||0), 0);
              const extPaid     = (pp.external_costs||[]).reduce((s, e, i) => s + (parseFloat(paid.external?.[String(i)])||0), 0);
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
                      {ppRemaining > 0 && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            // Fill all items with their full amount
                            const fabs2 = migrateFabrics(pp);
                            const newFabrics  = {};
                            fabs2.forEach((f, i) => { newFabrics[String(i)] = String((parseFloat(f.qty)||0)*(parseFloat(f.rate)||0)); });
                            const newCosts    = {};
                            (pp.costs||[]).forEach((c, i) => { newCosts[String(c.key??i)] = String((parseFloat(c.cost_per_piece)||0)*(parseFloat(pp.total_quantity)||0)); });
                            const newExternal = {};
                            (pp.external_costs||[]).forEach((ex, i) => { newExternal[String(ex.id??i)] = String(parseFloat(ex.total)||0); });
                            setPpPaid(prev => ({ ...prev, [pp.id]: { fabrics: newFabrics, costs: newCosts, external: newExternal } }));
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium transition-colors"
                        >
                          <CheckCircle2 size={11} /> Pay All
                        </button>
                      )}
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
                           style={{ gridTemplateColumns: '1fr 88px 136px 88px' }}>
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
                            const fabKey   = String(i);
                            const rowTotal = (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0);
                            const rowPaid  = parseFloat(paid.fabrics?.[fabKey]) || 0;
                            const rowDiff  = rowTotal - rowPaid;
                            return (
                              <div key={i} className="grid items-center gap-3"
                                   style={{ gridTemplateColumns: '1fr 88px 136px 88px' }}>
                                <span className="text-sm text-slate-700 truncate">
                                  {f.name || 'Fabric'}
                                  <span className="text-slate-400 text-xs ml-1">({f.qty} {f.unit})</span>
                                </span>
                                <span className="text-sm text-right text-slate-800 font-medium">{fmt(rowTotal)}</span>
                                <div className="flex items-center justify-end gap-1">
                                  {rowDiff > 0 && (
                                    <button type="button"
                                      onClick={() => setPpPaid(prev => ({ ...prev, [pp.id]: { ...(prev[pp.id]||{}), fabrics: { ...(prev[pp.id]?.fabrics||{}), [fabKey]: String(rowTotal) } } }))}
                                      className="text-2xs font-bold px-1.5 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors whitespace-nowrap">Full</button>
                                  )}
                                  <input
                                    type="text" inputMode="decimal"
                                    value={paid.fabrics?.[fabKey] ?? ''}
                                    onChange={ev => setPpPaid(prev => ({ ...prev, [pp.id]: { ...(prev[pp.id]||{}), fabrics: { ...(prev[pp.id]?.fabrics||{}), [fabKey]: ev.target.value } } }))}
                                    placeholder="0"
                                    className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                                  />
                                </div>
                                {rowDiff > 0
                                  ? <span className="text-sm text-right font-semibold text-rose-500">{fmt(rowDiff)}</span>
                                  : rowDiff < 0
                                    ? <span className="text-sm text-right font-semibold text-emerald-600">+{fmt(-rowDiff)} cr.</span>
                                    : <span className="text-sm text-right font-semibold text-emerald-600">✓</span>}
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
                            const ck       = String(c.key ?? i);
                            const rowTotal = (parseFloat(c.cost_per_piece)||0) * qty;
                            const rowPaid  = parseFloat(paid.costs?.[ck]) || 0;
                            const rowDiff  = rowTotal - rowPaid;
                            return (
                              <div key={c.key ?? i} className="grid items-center gap-3"
                                   style={{ gridTemplateColumns: '1fr 88px 136px 88px' }}>
                                <span className="text-sm text-slate-700 truncate">{c.label}</span>
                                <span className="text-sm text-right text-slate-800 font-medium">{fmt(rowTotal)}</span>
                                <div className="flex items-center justify-end gap-1">
                                  {rowDiff > 0 && (
                                    <button type="button"
                                      onClick={() => setPpPaid(prev => ({ ...prev, [pp.id]: { ...(prev[pp.id]||{}), costs: { ...(prev[pp.id]?.costs||{}), [ck]: String(rowTotal) } } }))}
                                      className="text-2xs font-bold px-1.5 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors whitespace-nowrap">Full</button>
                                  )}
                                  <input
                                    type="text" inputMode="decimal"
                                    value={paid.costs?.[ck] ?? ''}
                                    onChange={ev => setPpPaid(prev => ({ ...prev, [pp.id]: { ...(prev[pp.id]||{}), costs: { ...(prev[pp.id]?.costs||{}), [ck]: ev.target.value } } }))}
                                    placeholder="0"
                                    className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                                  />
                                </div>
                                {rowDiff > 0
                                  ? <span className="text-sm text-right font-semibold text-rose-500">{fmt(rowDiff)}</span>
                                  : rowDiff < 0
                                    ? <span className="text-sm text-right font-semibold text-emerald-600">+{fmt(-rowDiff)} cr.</span>
                                    : <span className="text-sm text-right font-semibold text-emerald-600">✓</span>}
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
                            const ek       = String(e.id ?? i);
                            const rowTotal = parseFloat(e.total) || 0;
                            const rowPaid  = parseFloat(paid.external?.[ek]) || 0;
                            const rowDiff  = rowTotal - rowPaid;
                            return (
                              <div key={e.id ?? i} className="grid items-center gap-3"
                                   style={{ gridTemplateColumns: '1fr 88px 136px 88px' }}>
                                <span className="text-sm text-slate-700 truncate">{e.label}</span>
                                <span className="text-sm text-right text-slate-800 font-medium">{fmt(rowTotal)}</span>
                                <div className="flex items-center justify-end gap-1">
                                  {rowDiff > 0 && (
                                    <button type="button"
                                      onClick={() => setPpPaid(prev => ({ ...prev, [pp.id]: { ...(prev[pp.id]||{}), external: { ...(prev[pp.id]?.external||{}), [ek]: String(rowTotal) } } }))}
                                      className="text-2xs font-bold px-1.5 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors whitespace-nowrap">Full</button>
                                  )}
                                  <input
                                    type="text" inputMode="decimal"
                                    value={paid.external?.[ek] ?? ''}
                                    onChange={ev => setPpPaid(prev => ({ ...prev, [pp.id]: { ...(prev[pp.id]||{}), external: { ...(prev[pp.id]?.external||{}), [ek]: ev.target.value } } }))}
                                    placeholder="0"
                                    className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
                                  />
                                </div>
                                {rowDiff > 0
                                  ? <span className="text-sm text-right font-semibold text-rose-500">{fmt(rowDiff)}</span>
                                  : rowDiff < 0
                                    ? <span className="text-sm text-right font-semibold text-emerald-600">+{fmt(-rowDiff)} cr.</span>
                                    : <span className="text-sm text-right font-semibold text-emerald-600">✓</span>}
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
                            <p className="text-lg sm:text-2xl font-black text-white tracking-tight break-all">{fmt(ppTotal / qty)}</p>
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

      {/* ── Cost breakdown card ── */}
      {(view === 'all' || view === 'costs') && (() => {
        const projFabrics = Array.isArray(project.fabrics) ? project.fabrics : [];
        const pfTotal = projFabrics.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0);
        const pfPaid  = projFabrics.reduce((s, f) => s + (parseFloat(f.amount_paid)||0), 0);
        const bdTotal = grandTotal + pfTotal;
        const bdPaid  = grandTotalPaid + pfPaid;
        const rows = [
          pfTotal > 0          && { label: 'Bulk Fabrics',    icon: Package, total: pfTotal,           paid: pfPaid,              chip: 'bg-blue-100 text-blue-600',     bar: 'bg-blue-500' },
          grandProductCost > 0 && { label: 'Product Costs',   icon: Shirt,   total: grandProductCost,  paid: grandProductPaidRaw, chip: 'bg-indigo-100 text-indigo-600', bar: 'bg-indigo-500' },
          totalVendorBilled > 0 && { label: 'Vendors',        icon: Store,   total: totalVendorBilled, paid: totalVendorPaid,     chip: 'bg-violet-100 text-violet-600', bar: 'bg-violet-500' },
          totalWorkerAgreed > 0 && { label: 'Process / Workers', icon: User, total: totalWorkerAgreed, paid: totalWorkerPaid,     chip: 'bg-sky-100 text-sky-600',       bar: 'bg-sky-500' },
          extraCostTotal > 0    && { label: 'Extra Costs',    icon: Receipt, total: extraCostTotal,    paid: extraCostTotal,      chip: 'bg-amber-100 text-amber-600',   bar: 'bg-amber-500' },
        ].filter(Boolean);
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><Banknote size={13} className="text-slate-500" /></div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cost Breakdown</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-slate-900">{fmt(bdTotal)}</span>
                <span className="text-xs ml-2">
                  <span className="text-emerald-600 font-semibold">Paid {fmt(bdPaid)}</span>
                  {bdTotal - bdPaid > 0
                    ? <span className="text-rose-500 font-semibold ml-1.5">· Due {fmt(bdTotal - bdPaid)}</span>
                    : bdTotal > 0 && <span className="text-emerald-500 font-semibold ml-1.5">✓ Settled</span>}
                </span>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No costs yet — add bulk fabrics, vendors, workers or extra costs.</p>
            ) : (
              <div className="space-y-3">
                {rows.map(r => {
                  const Icon = r.icon;
                  const pct  = r.total > 0 ? Math.min(100, (r.paid / r.total) * 100) : 0;
                  const due  = r.total - r.paid;
                  return (
                    <div key={r.label} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${r.chip}`}><Icon size={13} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-600">{r.label}</span>
                          <span className="font-bold text-slate-800">{fmt(r.total)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${r.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="w-24 text-right flex-shrink-0">
                        {due > 0
                          ? <span className="text-2xs text-rose-500 font-semibold">Due {fmt(due)}</span>
                          : <span className="text-2xs text-emerald-500 font-semibold">✓ Paid</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalProjectQty > 0 && bdTotal > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Avg Cost / Piece</span>
                <span className="text-base font-black text-indigo-700">
                  {fmt(bdTotal / totalProjectQty)}
                  <span className="text-2xs font-normal text-slate-400 ml-1.5">÷ {totalProjectQty.toLocaleString()} pcs</span>
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Vendors section ── */}
      {(view === 'all' || view === 'vendors') && <div>
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {vendors.map(pv => {
              const billed = pvBilled(pv);   // computed from tasks if tasks exist
              const paid   = Number(pv.total_paid || 0);
              const bal    = billed - paid;
              const pct    = billed > 0 ? Math.min(100, Math.round((paid/billed)*100)) : 0;
              const typeInfo = VENDOR_TYPES[pv.vendor_type] ?? VENDOR_TYPES.process;
              const TypeIcon = typeInfo.icon;
              const isEditing = editVendor?.id === pv.id;

              // Count distinct products ordered — per_piece tasks OR fall back to invoice_amount
              const productTasks = Array.isArray(pv.tasks) ? pv.tasks.filter(t => t.type === 'per_piece') : [];
              const lumpTasks    = Array.isArray(pv.tasks) ? pv.tasks.filter(t => t.type !== 'per_piece') : [];
              const distinctProducts = productTasks.length > 0
                ? new Set(productTasks.map(t => t.product_id || 'all')).size
                : null;
              const totalPieces = productTasks.reduce((s, t) => s + (parseFloat(t.qty)||0), 0);

              return (
                <div key={pv.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {isEditing ? (
                    <div className="p-4">
                      <VendorForm pv={pv} allVendors={allVendors} projectProducts={products}
                        onSave={saveVendor} onCancel={() => setEditV(null)} />
                    </div>
                  ) : (
                    <>
                      {/* ── Stats header bar ── */}
                      <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
                        <div className="px-3 py-2.5 text-center">
                          <p className="text-2xs text-slate-400 font-medium mb-0.5">Products</p>
                          <p className="text-sm font-bold text-slate-700">
                            {distinctProducts != null ? distinctProducts : (lumpTasks.length > 0 ? lumpTasks.length : (billed > 0 ? '1' : '—'))}
                          </p>
                        </div>
                        <div className="px-3 py-2.5 text-center">
                          <p className="text-2xs text-slate-400 font-medium mb-0.5">Total Pcs</p>
                          <p className="text-sm font-bold text-slate-700">
                            {totalPieces > 0 ? totalPieces.toLocaleString() : '—'}
                          </p>
                        </div>
                        <div className="px-3 py-2.5 text-center">
                          <p className="text-2xs text-slate-400 font-medium mb-0.5">Total Amount</p>
                          <p className="text-sm font-bold text-indigo-700">{billed > 0 ? fmt(billed) : '—'}</p>
                        </div>
                        <div className="px-3 py-2.5 text-center">
                          <p className="text-2xs text-slate-400 font-medium mb-0.5">{bal > 0 ? 'Due' : 'Status'}</p>
                          <p className={`text-sm font-bold ${bal > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {bal > 0 ? fmt(bal) : '✓ Paid'}
                          </p>
                        </div>
                      </div>

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
                                <Package size={9} /> Products / Tasks
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
                                            <img src={imgUrl(p.receipt_url)} alt="receipt"
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
      </div>}

      {/* ── Workers section ── */}
      {(view === 'all' || view === 'workers') && <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User size={16} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Process / Workers</h3>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{workers.length}</span>
            <span className="text-2xs text-slate-400 hidden sm:inline">cutting · stitching · sublimation · embroidery…</span>
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
            <WorkerForm pw={null} project={project} onSave={saveWorker} onCancel={() => setAddingW(false)} />
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
                      <WorkerForm pw={pw} project={project} onSave={saveWorker} onCancel={() => setEditW(null)} />
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
      </div>}

      {/* ── Extra Costs section ── */}
      {(view === 'all' || view === 'costs') && <ExtraCostsSection project={project} onReload={onReload} fmt={fmt} pid={pid} />}

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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          {project.boxes.length} box{project.boxes.length !== 1 ? 'es' : ''} ·{' '}
          {totalBoxed} / {totalQty} pieces packed
          {totalLeft > 0 && <span className="text-amber-600 font-semibold"> · {totalLeft} remaining</span>}
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onPrint}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-amber-200 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 font-semibold whitespace-nowrap">
            <Printer size={12} /> Print All Boxes
          </button>
          <button onClick={() => { setAddingBox(true); setEditBox(null); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap">
            <Plus size={12} /> Add Box
          </button>
        </div>
      </div>

      {addingBox && (
        <BoxEditor
          box={null}
          project={project}
          onSave={async form => {
            await onSave({}, form);
            setAddingBox(false);
          }}
          onCancel={() => setAddingBox(false)}
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
        // Edit in place — the editor replaces the box card so there's no scrolling to the top
        if (editBox?.id === box.id) return (
          <BoxEditor
            key={box.id}
            box={box}
            project={project}
            onSave={async form => {
              await onSave(box, form);
              setEditBox(null);
            }}
            onCancel={() => setEditBox(null)}
          />
        );
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

function ProjectRow({ project, onClick }) {
  const enabledStages = project.stages_total ?? 0;
  const doneStages    = project.stages_done  ?? 0;
  const pct           = enabledStages > 0 ? Math.round((doneStages / enabledStages) * 100) : 0;
  const pkrFmt = n => `₨${Number(n || 0).toLocaleString()}`;
  const totalExp = project.fin_total_expense ?? 0;
  const paid     = project.fin_paid          ?? 0;

  return (
    <div onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer group transition-colors last:border-b-0">

      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_CONFIG[project.status]?.dot ?? 'bg-slate-400'}`} />

      {/* Title + client */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">{project.title}</p>
        <p className="text-xs text-slate-400 truncate">
          {project.client_name ?? 'No client'}
          {project.client_company ? ` · ${project.client_company}` : ''}
        </p>
      </div>

      {/* Progress bar */}
      {enabledStages > 0 && (
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0 w-24">
          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <span className="text-2xs text-slate-400 w-7 text-right">{pct}%</span>
        </div>
      )}

      {/* Financials */}
      <div className="hidden md:flex items-center gap-4 text-xs flex-shrink-0">
        {totalExp > 0 && <span className="text-slate-500">Exp <span className="font-semibold text-slate-700">{pkrFmt(totalExp)}</span></span>}
        {paid > 0    && <span className="text-slate-500">Paid <span className="font-semibold text-emerald-600">{pkrFmt(paid)}</span></span>}
      </div>

      {/* Products + date */}
      <div className="flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
        <span className="hidden sm:inline flex items-center gap-1">
          <Package size={11} className="inline mr-0.5" />{project.product_count}
        </span>
        <span>{fmtDate(project.created_at)}</span>
      </div>

      {/* Status badge */}
      <StatusBadge status={project.status} />
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  return <ProjectRow project={project} onClick={onClick} />;
}

// Row for a completed project — shows the full cost/expense/received/profit
// breakdown instead of just Exp/Paid, since that's the whole point of looking
// back at a finished project.
// completed_at is a full "YYYY-MM-DD HH:MM:SS" timestamp, not a plain date —
// fmtDateShort's "+'T00:00:00'" trick doesn't apply here, so parse it directly.
const fmtCompletedDate = d => {
  if (!d) return '—';
  const dt = new Date(d.includes('T') ? d : d.replace(' ', 'T'));
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function CompletedProjectRow({ project, onClick }) {
  const pkr = n => `₨${Number(n || 0).toLocaleString()}`;
  const cost     = project.fin_total_expense ?? 0;
  const expenses = project.fin_paid          ?? 0;
  const received = project.fin_received      ?? 0;
  const profit   = project.fin_net           ?? 0;

  return (
    <div onClick={onClick}
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer group transition-colors last:border-b-0">

      {/* Title + client + completion date */}
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

      {/* Cost / Expenses / Received / Profit */}
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-1 text-xs flex-shrink-0">
        <span className="text-slate-400">Cost <span className="font-semibold text-slate-700">{pkr(cost)}</span></span>
        <span className="text-slate-400">Expenses <span className="font-semibold text-rose-500">{pkr(expenses)}</span></span>
        <span className="text-slate-400">Received <span className="font-semibold text-emerald-600">{pkr(received)}</span></span>
        <span className="text-slate-400">Profit <span className={`font-bold ${profit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{pkr(profit)}</span></span>
      </div>
    </div>
  );
}

// ─── Shipping Tab ─────────────────────────────────────────────────────────────

const pkrFmt = n => `₨${Number(n || 0).toLocaleString()}`;
const fmtDateShort = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const inputShipCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

const BLANK_SHIP = { carrier: '', tracking_number: '', shipping_date: '', amount: '', notes: '', vendor_id: '' };

function ShippingTab({ project, onReload }) {
  const [records, setRecords]       = useState(project.shipping || []);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(BLANK_SHIP);
  const [saving, setSaving]         = useState(false);
  const [delTarget, setDelTarget]   = useState(null);
  const [shippers, setShippers]     = useState([]);

  useEffect(() => { setRecords(project.shipping || []); }, [project.shipping]);

  useEffect(() => {
    api.get('/vendors').then(r => {
      setShippers((r.data || []).filter(v => v.type === 'freight' || v.type === 'shipping'));
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openNew() {
    setForm({ ...BLANK_SHIP, shipping_date: new Date().toISOString().split('T')[0] });
    setEditTarget(null);
    setShowForm(true);
  }

  function openEdit(r) {
    setForm({
      carrier: r.carrier||'', tracking_number: r.tracking_number||'',
      shipping_date: r.shipping_date||'', amount: r.amount||'',
      notes: r.notes||'', vendor_id: r.vendor_id ? String(r.vendor_id) : '',
    });
    setEditTarget(r);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.vendor_id && shippers.length > 0) {
      alert('Please select a shipping company.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount)||0 };
      if (editTarget) {
        const { data } = await api.put(`/projects/${project.id}/shipping/${editTarget.id}`, payload);
        setRecords(prev => prev.map(r => r.id === editTarget.id ? data : r));
      } else {
        const { data } = await api.post(`/projects/${project.id}/shipping`, payload);
        setRecords(prev => [data, ...prev]);
      }
      setShowForm(false);
      setEditTarget(null);
      onReload();
    } catch (e) { alert(e?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projects/${project.id}/shipping/${id}`);
      setRecords(prev => prev.filter(r => r.id !== id));
      setDelTarget(null);
      onReload();
    } catch (e) { alert('Failed to delete'); }
  }

  const totalCost = records.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const selectedShipper = shippers.find(s => String(s.id) === String(form.vendor_id));

  return (
    <div className="space-y-5">

      {/* ── Summary card ── */}
      <div className="grid grid-cols-1 gap-4 max-w-xs">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Shipping Cost</p>
          <p className="text-2xl font-bold text-slate-800">{pkrFmt(totalCost)}</p>
          <p className="text-xs text-slate-400 mt-1">Track payments via the Vendor module</p>
        </div>
      </div>

      {/* ── Shipper cards + Add button ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Shipping Companies</p>
          {shippers.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              No shipping companies added yet.{' '}
              <a href="/vendors" className="underline font-semibold">Go to Vendors</a> → Add Vendor → type "Freight / Logistics" to add DHL, UPS, TCS etc.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {shippers.map(v => (
                <div key={v.id} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm min-w-[180px]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Truck size={14} className="text-sky-600" />
                    </div>
                    <p className="font-bold text-slate-800 text-sm">{v.name}</p>
                  </div>
                  {v.contact_name && <p className="text-xs text-slate-500 mt-1">👤 {v.contact_name}</p>}
                  {v.phone        && <p className="text-xs text-slate-500">📞 {v.phone}</p>}
                  {v.email        && <p className="text-xs text-slate-400 truncate">✉ {v.email}</p>}
                  <button
                    onClick={() => {
                      setForm({ ...BLANK_SHIP, shipping_date: new Date().toISOString().split('T')[0], vendor_id: String(v.id), carrier: v.name });
                      setEditTarget(null);
                      setShowForm(true);
                    }}
                    className="mt-2 w-full text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus size={11} /> Add Shipment
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {shippers.length === 0 && (
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold shadow-sm transition-colors flex-shrink-0">
            <Plus size={14} /> Add Shipment
          </button>
        )}
      </div>

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">

          {/* Selected shipper header */}
          {selectedShipper ? (
            <div className="bg-sky-50 border-b border-sky-100 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
                  <Truck size={16} className="text-sky-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">{selectedShipper.name}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    {selectedShipper.contact_name && <span>👤 {selectedShipper.contact_name}</span>}
                    {selectedShipper.phone        && <span>📞 {selectedShipper.phone}</span>}
                    {selectedShipper.email        && <span>✉ {selectedShipper.email}</span>}
                  </div>
                </div>
              </div>
              {/* Switch shipper */}
              {shippers.length > 1 && (
                <select
                  value={form.vendor_id}
                  onChange={e => {
                    const v = shippers.find(s => String(s.id) === e.target.value);
                    setForm(f => ({ ...f, vendor_id: e.target.value, carrier: v?.name || f.carrier }));
                  }}
                  className="text-xs border border-sky-200 rounded-lg px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                >
                  {shippers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border-b border-slate-100 px-5 py-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">Select Shipping Company</p>
              <div className="flex flex-wrap gap-2">
                {shippers.map(v => (
                  <button key={v.id} type="button"
                    onClick={() => setForm(f => ({ ...f, vendor_id: String(v.id), carrier: v.name }))}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 bg-white transition-colors flex items-center gap-1.5">
                    <Truck size={11} /> {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-800">{editTarget ? 'Edit Shipment' : 'New Shipment'}</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Carrier / Service</label>
                <input value={form.carrier} onChange={e => set('carrier', e.target.value)}
                  placeholder="e.g. DHL Express, UPS Worldwide" className={inputShipCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tracking Number</label>
                <input value={form.tracking_number} onChange={e => set('tracking_number', e.target.value)}
                  placeholder="Optional" className={inputShipCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Shipping Date</label>
                <input type="date" value={form.shipping_date} onChange={e => set('shipping_date', e.target.value)} className={inputShipCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Total Shipping Cost (PKR)</label>
                <input type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
                  placeholder="0" className={inputShipCls} />
              </div>
            </div>


            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                className={`${inputShipCls} resize-none`} placeholder="Optional notes…" />
            </div>

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 font-semibold transition-colors flex items-center justify-center gap-2">
                {saving ? 'Saving…' : <><Check size={14} />{editTarget ? 'Save Changes' : 'Add Shipment'}</>}
              </button>
              <button onClick={() => { setShowForm(false); setEditTarget(null); }}
                className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Records list ── */}
      {records.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Truck size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">No shipments recorded</p>
          <p className="text-slate-400 text-sm mt-1">Select a shipping company above to add a shipment</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Shipper</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tracking</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount (PKR)</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                          <Truck size={12} className="text-sky-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{r.vendor_name || r.carrier || '—'}</p>
                          {r.vendor_name && r.carrier && r.carrier !== r.vendor_name && (
                            <p className="text-xs text-slate-400">{r.carrier}</p>
                          )}
                          {r.vendor_phone   && <p className="text-xs text-slate-400">📞 {r.vendor_phone}</p>}
                          {r.vendor_contact && <p className="text-xs text-slate-400">👤 {r.vendor_contact}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{r.tracking_number || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{fmtDateShort(r.shipping_date)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-800">{pkrFmt(r.amount)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                        Via Vendor
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} title="Edit"
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Pencil size={13}/></button>
                        {delTarget === r.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(r.id)} className="text-xs bg-rose-600 text-white px-2 py-1 rounded-lg font-medium">Delete</button>
                            <button onClick={() => setDelTarget(null)} className="text-xs border border-slate-200 px-2 py-1 rounded-lg text-slate-500">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDelTarget(r.id)} title="Delete"
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 size={13}/></button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
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
  // the list. Detail is internal state (no URL), so react to any fresh
  // navigation that lands on /projects.
  useEffect(() => {
    setView('list');
    setSelectedId(null);
  }, [location.key]);
  const [search,   setSearch]         = useState('');
  const [statusFilter, setStatus]     = useState('all');
  const [clients,  setClients]        = useState([]);
  const [invoices, setInvoices]       = useState([]);
  const [catalogProducts, setCatalog] = useState([]);
  const [costFields, setCostFields]   = useState([]);
  const [currencies, setCurrencies]   = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('PKR');
  const [showActive,    setShowActive]    = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());
  const [finSummary,    setFinSummary]    = useState(null);

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
      api.get('/financials/summary'),
    ]).then(([c, i, p, cf, cur, s, fin]) => {
      setClients(c.data);
      setInvoices(i.data);
      setCatalog(p.data);
      setCostFields(Array.isArray(cf.data) ? cf.data.filter(x => x.enabled) : []);
      setCurrencies(Array.isArray(cur.data) ? cur.data : []);
      setBaseCurrency((s.data && s.data.base_currency) || 'PKR');
      setFinSummary(fin.data);
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
        <button onClick={() => navigate('/projects/new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm w-full sm:w-auto justify-center sm:justify-start">
          <Plus size={16} /> New Project
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Total Projects', value: stats.total,     icon: Layers,       color: 'text-indigo-600',  bg: 'bg-indigo-50' },
          { label: 'In Production',  value: stats.active,    icon: Flame,        color: 'text-orange-600',  bg: 'bg-orange-50' },
          { label: 'Completed',      value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Planning',       value: stats.planning,  icon: Clock,        color: 'text-slate-600',   bg: 'bg-slate-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`${bg} ${color} p-2.5 rounded-xl`}><Icon size={18} /></div>
            <div><p className="text-xl sm:text-2xl font-bold text-slate-900">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>

      {/* Financial summary — global overview */}
      {false && finSummary && (() => {
        const pkr = n => `₨${Number(n||0).toLocaleString()}`;
        const { invoiceRevenue=0, outstanding=0, totalExpenses=0, netProfit=0, inWallet } = finSummary;
        const wallet = invoiceRevenue - totalExpenses;
        const isProfit = netProfit >= 0;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total Received */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-emerald-100 text-emerald-600 p-2.5 rounded-xl flex-shrink-0">
                <TrendingUp size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-emerald-700 truncate">{pkr(invoiceRevenue)}</p>
                <p className="text-xs text-emerald-600 font-medium">Total Received</p>
                {outstanding > 0 && <p className="text-2xs text-emerald-500 mt-0.5">{pkr(outstanding)} outstanding</p>}
              </div>
            </div>

            {/* Total Expenses */}
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-rose-100 text-rose-600 p-2.5 rounded-xl flex-shrink-0">
                <TrendingDown size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-rose-700 truncate">{pkr(totalExpenses)}</p>
                <p className="text-xs text-rose-600 font-medium">Total Expenses</p>
                <p className="text-2xs text-rose-400 mt-0.5">All costs paid out</p>
              </div>
            </div>

            {/* In Wallet */}
            <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="bg-cyan-100 text-cyan-600 p-2.5 rounded-xl flex-shrink-0">
                <DollarSign size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-cyan-700 truncate">{pkr(wallet)}</p>
                <p className="text-xs text-cyan-600 font-medium">In Wallet</p>
                <p className="text-2xs text-cyan-400 mt-0.5">Received − expenses</p>
              </div>
            </div>

            {/* Net Profit / Loss */}
            <div className={`border rounded-xl p-4 flex items-center gap-3 shadow-sm ${isProfit ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-200'}`}>
              <div className={`p-2.5 rounded-xl flex-shrink-0 ${isProfit ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}>
                {isProfit ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-bold truncate ${isProfit ? 'text-indigo-700' : 'text-rose-700'}`}>
                  {isProfit ? '' : '−'}{pkr(Math.abs(netProfit))}
                </p>
                <p className={`text-xs font-medium ${isProfit ? 'text-indigo-600' : 'text-rose-600'}`}>
                  {isProfit ? 'Net Profit' : 'Net Loss'}
                </p>
                <p className={`text-2xs mt-0.5 ${isProfit ? 'text-indigo-400' : 'text-rose-400'}`}>Revenue − expenses</p>
              </div>
            </div>
          </div>
        );
      })()}

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
                    <span className="font-bold text-slate-800 text-sm uppercase tracking-wider">Active / Running</span>
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
                  const pkr = n => `₨${Number(n || 0).toLocaleString()}`;

                  return (
                    <div className="space-y-4">
                      {monthKeys.map(key => {
                        const monthProjects = groups[key];
                        const label = key === 'unknown'
                          ? 'Completion date unknown'
                          : new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        const totals = monthProjects.reduce((acc, p) => ({
                          cost:     acc.cost     + (p.fin_total_expense || 0),
                          expenses: acc.expenses + (p.fin_paid          || 0),
                          received: acc.received + (p.fin_received      || 0),
                          profit:   acc.profit   + (p.fin_net           || 0),
                        }), { cost: 0, expenses: 0, received: 0, profit: 0 });

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
                              <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-1 text-xs">
                                <span className="text-slate-400">Cost <span className="font-semibold text-slate-700">{pkr(totals.cost)}</span></span>
                                <span className="text-slate-400">Expenses <span className="font-semibold text-rose-500">{pkr(totals.expenses)}</span></span>
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
