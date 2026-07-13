import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import {
  Plus, Pencil, Trash2, X, Save, Archive, Package, AlertTriangle,
  ChevronDown, ChevronUp, TrendingDown, TrendingUp, ArrowDownCircle,
  ArrowUpCircle, Search, RefreshCw, ArrowLeft,
} from 'lucide-react';
import Drawer from '../components/Drawer';

// ── constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'fabric',     label: 'Fabric',       color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  { key: 'accessory',  label: 'Accessory',    color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  { key: 'thread',     label: 'Thread',       color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  { key: 'label',      label: 'Label/Tag',    color: 'bg-rose-100 text-rose-700',    dot: 'bg-rose-500' },
  { key: 'packaging',  label: 'Packaging',    color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  { key: 'other',      label: 'Other',        color: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400' },
];

const UNITS = ['Yards', 'Meters', 'KG', 'Grams', 'Rolls', 'Pcs', 'Pairs', 'Dozens', 'Sets', 'Boxes'];

const pkr = v => `₨${(parseFloat(v)||0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function getCat(key) { return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1]; }

const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;
function Label({ text, required }) {
  return <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{text}{required && <span className="text-rose-400 ml-0.5">*</span>}</label>;
}
function Field({ label, required, children }) {
  return <div><Label text={label} required={required} />{children}</div>;
}

// ── Item Form ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', category: 'fabric', unit: 'Yards', qty_total: '', qty_used: '', rate: '', notes: '' };

function ItemForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState(item
    ? { name: item.name, category: item.category, unit: item.unit, qty_total: String(item.qty_total||''), qty_used: String(item.qty_used||''), rate: String(item.rate||''), notes: item.notes||'' }
    : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const available = (parseFloat(form.qty_total)||0) - (parseFloat(form.qty_used)||0);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 space-y-4">
      <p className="font-semibold text-slate-900">{item ? 'Edit Item' : 'Add Inventory Item'}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-1 sm:col-span-2">
          <Field label="Name" required>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Cordura 600D, YKK Zip, Velcro…"
              className={inputCls} />
          </Field>
        </div>

        <Field label="Category">
          <select value={form.category} onChange={e => set('category', e.target.value)} className={selectCls}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>

        <Field label="Unit">
          <select value={form.unit} onChange={e => set('unit', e.target.value)} className={selectCls}>
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </Field>

        <Field label={`Total Purchased (${form.unit})`}>
          <input type="number" min="0" step="0.01" value={form.qty_total}
            onChange={e => set('qty_total', e.target.value)}
            placeholder="0" className={inputCls} />
        </Field>

        <Field label={`Already Used (${form.unit})`}>
          <input type="number" min="0" step="0.01" value={form.qty_used}
            onChange={e => set('qty_used', e.target.value)}
            placeholder="0" className={inputCls} />
        </Field>

        <Field label={`Cost / ${form.unit} (₨)`}>
          <input type="number" min="0" step="0.01" value={form.rate}
            onChange={e => set('rate', e.target.value)}
            placeholder="0" className={inputCls} />
        </Field>

        <div className="flex items-end pb-1">
          <div className={`rounded-xl px-4 py-2.5 border w-full text-center ${
            available > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}>
            <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Available</p>
            <p className={`text-base font-bold ${available > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {available.toLocaleString()} {form.unit}
            </p>
          </div>
        </div>

        <div className="col-span-1 sm:col-span-2">
          <Field label="Notes">
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Supplier, batch, color…" className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving || !form.name.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          <Save size={14} /> {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Stock-In Modal ────────────────────────────────────────────────────────────

function StockInModal({ item, onSave, onClose }) {
  const [qty,       setQty]      = useState('');
  const [unitPrice, setPrice]    = useState(item.rate > 0 ? String(item.rate) : '');
  const [ref,       setRef]      = useState('');
  const [saving,    setSaving]   = useState(false);

  async function handleSave() {
    if (!qty || parseFloat(qty) <= 0) return;
    setSaving(true);
    try {
      await onSave({
        qty:        parseFloat(qty),
        unit_price: parseFloat(unitPrice) || 0,
        reference:  ref,
      });
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title="Add Stock" subtitle={item.name} width="max-w-sm">
      <div className="p-6 space-y-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 text-sm text-emerald-700">
          Current stock: <strong>{item.qty_available} {item.unit}</strong>
          {item.rate > 0 && <span className="ml-2 text-emerald-600">· Last rate: ₨{Number(item.rate).toLocaleString()}</span>}
        </div>
        <div className="space-y-3">
          <Field label={`Quantity to Add (${item.unit})`} required>
            <input type="number" min="0.01" step="0.01" value={qty}
              onChange={e => setQty(e.target.value)} placeholder="0"
              className={inputCls} autoFocus />
          </Field>
          <Field label="Unit Price (₨ per unit)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">₨</span>
              <input type="number" min="0" step="0.01" value={unitPrice}
                onChange={e => setPrice(e.target.value)} placeholder="0"
                className={`${inputCls} pl-7`} />
            </div>
            <p className="text-2xs text-slate-400 mt-1">Updates the current rate and logs price history</p>
          </Field>
          <Field label="Reference / Supplier">
            <input value={ref} onChange={e => setRef(e.target.value)}
              placeholder="Purchase order, supplier name…" className={inputCls} />
          </Field>
        </div>

        {/* Live total */}
        {parseFloat(qty) > 0 && parseFloat(unitPrice) > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-emerald-700 font-medium">Total Purchase Value</span>
            <span className="text-sm font-bold text-emerald-700">
              ₨{(parseFloat(qty) * parseFloat(unitPrice)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving || !qty || parseFloat(qty) <= 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            <ArrowDownCircle size={14} /> {saving ? 'Adding…' : 'Add Stock'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </Drawer>
  );
}

// ── Item Detail (right panel) ─────────────────────────────────────────────────

function ItemDetail({ item, onEdit, onStockIn, onDelete, onClose }) {
  const cat   = getCat(item.category);
  const pct   = item.qty_total > 0 ? Math.min(100, Math.round((item.qty_available / item.qty_total) * 100)) : 0;
  const isLow = item.qty_available < item.qty_total * 0.2 && item.qty_total > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h2 className="font-semibold text-slate-900 text-base">{item.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{cat.label} · per {item.unit}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onStockIn(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold transition-colors">
            <ArrowDownCircle size={12} /> Stock In
          </button>
          <button onClick={() => onEdit(item)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(item.id)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Stock level */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock Level</span>
          {isLow && (
            <span className="text-2xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <AlertTriangle size={9} /> Low Stock
            </span>
          )}
        </div>
        <div className="bg-slate-100 rounded-full h-3 overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all ${isLow ? 'bg-rose-400' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>{pct}% available</span>
          <span className={`font-semibold ${isLow ? 'text-rose-600' : 'text-emerald-700'}`}>
            {item.qty_available.toLocaleString()} / {item.qty_total.toLocaleString()} {item.unit}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 border-b border-slate-100">
        {[
          { label: 'Purchased',  value: item.qty_total,     cls: 'text-slate-900' },
          { label: 'Used',       value: item.qty_used,      cls: 'text-rose-600'  },
          { label: 'Available',  value: item.qty_available, cls: isLow ? 'text-rose-600' : 'text-emerald-700' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="px-4 py-4 text-center border-r border-slate-100 last:border-0">
            <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
            <p className={`text-lg sm:text-2xl font-bold ${cls}`}>{value.toLocaleString()}</p>
            <p className="text-2xs text-slate-400">{item.unit}</p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium break-all">{pkr(value * item.rate)}</p>
          </div>
        ))}
      </div>

      {/* Rate + value */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          {[
            { label: `Rate / ${item.unit}`,   value: pkr(item.rate),                        cls: 'text-slate-900' },
            { label: 'Total Value',            value: pkr(item.qty_total * item.rate),        cls: 'text-slate-900' },
            { label: 'Available Value',        value: pkr(item.qty_available * item.rate),    cls: 'text-indigo-600' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="text-center">
              <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
              <p className={`text-base font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {item.notes && (
        <div className="px-6 py-4">
          <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-2">Notes</p>
          <p className="text-sm text-slate-700">{item.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Inventory Page ───────────────────────────────────────────────────────

export default function Inventory() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [catFilter, setCat]       = useState('all');
  const [adding, setAdding]       = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [stockIn, setStockIn]     = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [delTarget, setDelTarget] = useState(null); // item id pending delete

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch('/api/inventory');
      setItems(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleSave(form) {
    if (editItem) {
      await apiFetch(`/api/inventory/${editItem.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setEditItem(null);
    } else {
      await apiFetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setAdding(false);
    }
    load();
  }

  async function confirmDelete() {
    await apiFetch(`/api/inventory/${delTarget}`, { method: 'DELETE' });
    setDelTarget(null);
    load();
  }

  async function handleStockIn(item, data) {
    await apiFetch(`/api/inventory/${item.id}/stock-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setStockIn(null);
    load();
  }

  // Stats
  const totalItems     = items.length;
  const totalValue     = items.reduce((s, i) => s + (i.qty_total * i.rate), 0);
  const availableValue = items.reduce((s, i) => s + (i.qty_available * i.rate), 0);
  const lowStock       = items.filter(i => i.qty_available < i.qty_total * 0.2 && i.qty_total > 0);

  const filtered = items.filter(i => {
    const matchCat = catFilter === 'all' || i.category === catFilter;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.notes||'').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalItems} items · {pkr(availableValue)} available
            {lowStock.length > 0 && <span className="text-rose-500 font-medium"> · {lowStock.length} low stock</span>}
          </p>
        </div>
        <button onClick={() => { setAdding(true); setEditItem(null); setSelectedItem(null); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
          <Plus size={16} /> Add Item
        </button>
      </div>

      {/* ── Two-panel split ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

        {/* LEFT: item list */}
        <div className={`w-full lg:w-72 flex-1 min-h-0 lg:flex-none flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white ${selectedItem ? 'hidden lg:flex' : ''}`}>

          {/* Search */}
          <div className="px-3 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
                placeholder="Search items…" />
            </div>
          </div>

          {/* Category filter */}
          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1">
            <button onClick={() => setCat('all')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${catFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              All ({totalItems})
            </button>
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${catFilter === c.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {c.label}
              </button>
            ))}
          </div>

          {/* Delete confirmation banner */}
          {delTarget && (
            <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs flex-shrink-0">
              <AlertTriangle size={13} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">Delete item?</span>
              <button onClick={() => setDelTarget(null)}
                className="px-2.5 py-1 border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100">Cancel</button>
              <button onClick={confirmDelete}
                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-semibold">Delete</button>
            </div>
          )}

          {/* Items list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center px-4">
                <Archive size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">{items.length === 0 ? 'No items yet' : 'No matches'}</p>
              </div>
            ) : filtered.map(item => {
              const cat   = getCat(item.category);
              const pct   = item.qty_total > 0 ? Math.min(100, Math.round((item.qty_available / item.qty_total) * 100)) : 0;
              const isLow = item.qty_available < item.qty_total * 0.2 && item.qty_total > 0;
              const isSelected = !adding && !editItem && selectedItem?.id === item.id;
              return (
                <button key={item.id}
                  onClick={() => { setSelectedItem(item); setAdding(false); setEditItem(null); }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
                      : 'hover:bg-slate-50/80 border-l-[3px] border-l-transparent'
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 text-sm truncate">{item.name}</span>
                    <span className={`text-2xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${cat.color}`}>{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1 overflow-hidden">
                      <div className={`h-full rounded-full ${isLow ? 'bg-rose-400' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-2xs font-semibold flex-shrink-0 ${isLow ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {item.qty_available.toLocaleString()}/{item.qty_total.toLocaleString()} {item.unit}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: item detail / add form / empty state */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {(adding || editItem) ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <ItemForm
                item={editItem ?? null}
                onSave={handleSave}
                onCancel={() => { setAdding(false); setEditItem(null); }}
              />
            </div>
          ) : selectedItem ? (
            <ItemDetail
              item={selectedItem}
              onEdit={item => { setEditItem(item); setAdding(false); }}
              onStockIn={setStockIn}
              onDelete={id => { setDelTarget(id); }}
              onClose={() => setSelectedItem(null)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <Package size={28} className="text-indigo-300" />
              </div>
              <p className="font-semibold text-slate-600">Select an item</p>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">
                Click any inventory item to see stock levels, usage breakdown, and values
              </p>
              {lowStock.length > 0 && (
                <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-rose-700">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span className="font-medium">{lowStock.length} item{lowStock.length > 1 ? 's' : ''} low: {lowStock.map(i => i.name).join(', ')}</span>
                </div>
              )}
              <button onClick={() => { setAdding(true); setEditItem(null); setSelectedItem(null); }}
                className="mt-5 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={14} /> Add Item
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stock-In Drawer */}
      {stockIn && (
        <StockInModal
          item={stockIn}
          onSave={data => handleStockIn(stockIn, data)}
          onClose={() => setStockIn(null)}
        />
      )}
    </div>
  );
}
