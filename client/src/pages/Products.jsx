import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Pencil, Trash2, X, Package, Tag,
  ChevronRight, AlertTriangle, Check, Upload, Image, ArrowLeft,
  XCircle, DollarSign, Layers, TrendingUp, AlertCircle,
  ChevronDown, Box, Calculator, Save, Copy, Globe,
} from 'lucide-react';
import api, { apiFetch, imgUrl } from '../lib/api';
import Drawer from '../components/Drawer';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ['pcs', 'kg', 'g', 'meters', 'yards', 'rolls', 'sets', 'pairs', 'dozen', 'box'];

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b',
];

const EMPTY_PRODUCT = {
  name: '', article_number: '', sku: '', category_id: '', description: '', unit: 'pcs',
  unit_cost: '', selling_price: '', stock_quantity: '', reorder_level: '',
  status: 'active', images: '[]', notes: '', product_type: 'physical',
};

const EMPTY_CATEGORY = { name: '', description: '', color: '#6366f1' };

const FABRIC_UNITS   = ['KG', 'Yards', 'Meters', 'Grams', 'Rolls'];
const PROFIT_PRESETS = [15, 20, 25, 30, 40, 50, 60, 80, 100];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtPrice = v => (parseFloat(v) || 0).toFixed(2);
const fmtSize = b => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const fmtCur  = (amount, currency = 'USD') => {
  const n = parseFloat(amount) || 0;
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const margin = (cost, sell) => {
  const c = parseFloat(cost) || 0, s = parseFloat(sell) || 0;
  if (!c || !s) return null;
  return (((s - c) / s) * 100).toFixed(1);
};

function StatusBadge({ status }) {
  const map = { active: 'bg-emerald-100 text-emerald-700', inactive: 'bg-slate-100 text-slate-500' };
  return <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${map[status] ?? map.inactive}`}>{status}</span>;
}

function CategoryBadge({ name, color }) {
  if (!name) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}18`, color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

function StockBadge({ qty, reorder }) {
  const q = parseFloat(qty) || 0, r = parseFloat(reorder) || 0;
  if (r > 0 && q <= r) return (
    <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
      <AlertCircle size={11} />{q}
    </span>
  );
  return <span className="text-slate-700 text-sm">{q}</span>;
}

// ─── Shared form primitives ───────────────────────────────────────────────────

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;

function Label({ text, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {text}{required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
  );
}
function Field({ label, required, children }) {
  return <div><Label text={label} required={required} />{children}</div>;
}

// ─── Image Uploader ───────────────────────────────────────────────────────────

function ImageUploader({ images, onChange }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (e) => {
    const files = [...e.target.files];
    if (images.length + files.length > 5) return alert('Maximum 5 images allowed.');
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/uploads', fd);
        return data;
      }));
      onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const remove = async (img) => {
    await api.delete(`/uploads/${img.filename}`).catch(() => {});
    onChange(images.filter(i => i.filename !== img.filename));
  };

  return (
    <div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {images.map(img => (
            <div key={img.filename} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img src={imgUrl(img.url)} alt={img.originalName} className="w-full h-full object-cover" />
              <button type="button" onClick={() => remove(img)}
                className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
              <p className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[9px] px-1.5 py-1 truncate">{img.originalName}</p>
            </div>
          ))}
        </div>
      )}
      {images.length < 5 && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 flex flex-col items-center justify-center gap-2 text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-200">
            <Image size={20} />
            <span>{uploading ? 'Uploading…' : `Add images (${images.length}/5)`}</span>
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
        </>
      )}
    </div>
  );
}

// ─── Category Modal ───────────────────────────────────────────────────────────

function CategoryModal({ category, onClose, onSave }) {
  const [form, setForm] = useState(category ?? EMPTY_CATEGORY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err) { setError(err?.response?.data?.error ?? 'Failed to save.'); }
    finally { setSaving(false); }
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={category ? 'Edit Category' : 'New Category'}
      width="max-w-sm"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium">
            {saving ? 'Saving…' : category ? 'Update' : 'Create'}
          </button>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-4">
        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
        <Field label="Category Name" required>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className={inputCls} placeholder="e.g. T-Shirts" autoFocus />
        </Field>
        <Field label="Description">
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
            className={`${inputCls} resize-none`} placeholder="Optional description…" />
        </Field>
        <Field label="Color">
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => set('color', c)}
                className={`w-7 h-7 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
            <input type="color" value={form.color} onChange={e => set('color', e.target.value)}
              className="w-7 h-7 rounded-full cursor-pointer border-0 p-0 bg-transparent" title="Custom color" />
          </div>
        </Field>
      </div>
    </Drawer>
  );
}

// ─── Category Select (inline add / edit / delete) ────────────────────────────

function CategorySelect({ value, categories, onChange, onCategoriesChange }) {
  const [open, setOpen]         = useState(false);
  const [adding, setAdding]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [newCat, setNewCat]     = useState({ name: '', color: '#6366f1' });
  const [editForm, setEditForm] = useState({});
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setAdding(false); setEditingId(null); setDeletingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = categories.find(c => String(c.id) === String(value));

  const close = () => { setOpen(false); setAdding(false); setEditingId(null); setDeletingId(null); };
  const pick  = cat => { onChange(String(cat.id)); close(); };
  const clear = () => { onChange(''); close(); };

  const doAdd = async () => {
    if (!newCat.name.trim()) return;
    const { data } = await api.post('/categories', newCat);
    onCategoriesChange(prev => [...prev, { ...data, product_count: 0 }]);
    onChange(String(data.id));
    setAdding(false);
    setNewCat({ name: '', color: '#6366f1' });
    setOpen(false);
  };

  const doEdit = async id => {
    await api.put(`/categories/${id}`, editForm);
    onCategoriesChange(prev => prev.map(c => c.id === id ? { ...c, ...editForm } : c));
    setEditingId(null);
  };

  const doDelete = async id => {
    await api.delete(`/categories/${id}`);
    onCategoriesChange(prev => prev.filter(c => c.id !== id));
    if (String(value) === String(id)) onChange('');
    setDeletingId(null);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`${inputCls} flex items-center gap-2 text-left`}>
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="flex-1 text-sm">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-slate-400 text-sm">— No Category —</span>
        )}
        <ChevronDown size={14} className={`text-slate-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden"
          style={{ maxHeight: 300, overflowY: 'auto' }}>

          {/* Clear */}
          <button type="button" onClick={clear}
            className="w-full text-left px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-50 transition-colors border-b border-slate-100">
            — No Category —
          </button>

          {/* Category rows */}
          {categories.map(cat => (
            <div key={cat.id} className="border-b border-slate-50 last:border-0">
              {editingId === cat.id ? (
                <div className="px-3 py-2.5 bg-indigo-50 space-y-2">
                  <input autoFocus value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && doEdit(cat.id)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-white" />
                  <div className="flex gap-1.5 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditForm(f => ({ ...f, color: c }))}
                        className={`w-5 h-5 rounded-full transition-all ${editForm.color === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => doEdit(cat.id)}
                      className="flex-1 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Save</button>
                    <button type="button" onClick={() => setEditingId(null)}
                      className="flex-1 py-1 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : deletingId === cat.id ? (
                <div className="px-3 py-2.5 bg-rose-50 flex items-center gap-2">
                  <span className="text-xs text-rose-700 flex-1">Delete &ldquo;{cat.name}&rdquo;?</span>
                  <button type="button" onClick={() => doDelete(cat.id)}
                    className="px-2.5 py-1 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors">Yes</button>
                  <button type="button" onClick={() => setDeletingId(null)}
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-white transition-colors">No</button>
                </div>
              ) : (
                <div className={`flex items-center gap-1 pl-3 pr-2 py-2.5 group transition-colors ${String(value) === String(cat.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                  <button type="button" onClick={() => pick(cat)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm text-slate-700 flex-1 truncate">{cat.name}</span>
                    {String(value) === String(cat.id) && <Check size={12} className="text-indigo-600 flex-shrink-0" />}
                  </button>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setEditingId(cat.id); setEditForm({ name: cat.name, color: cat.color }); setDeletingId(null); }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">
                      <Pencil size={11} />
                    </button>
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setDeletingId(cat.id); setEditingId(null); }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add new */}
          {adding ? (
            <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 space-y-2">
              <input autoFocus value={newCat.name}
                onChange={e => setNewCat(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && doAdd()}
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-white"
                placeholder="Category name…" />
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewCat(f => ({ ...f, color: c }))}
                    className={`w-5 h-5 rounded-full transition-all ${newCat.color === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={doAdd}
                  className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors">Add</button>
                <button type="button" onClick={() => { setAdding(false); setNewCat({ name: '', color: '#6366f1' }); }}
                  className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-white transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setAdding(true); setEditingId(null); setDeletingId(null); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-slate-100 font-medium">
              <Plus size={13} /> Add Category
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Product Drawer (with tabs: Overview, Orders, Images, Calculate Price) ────

const DRAWER_TABS = ['Overview', 'Orders', 'Images'];
const today = () => new Date().toISOString().split('T')[0];

const ORDER_STATUS_COLORS = {
  unpaid:    'bg-rose-100 text-rose-700',
  partial:   'bg-amber-100 text-amber-700',
  paid:      'bg-emerald-100 text-emerald-700',
  overdue:   'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  draft:     'bg-slate-100 text-slate-600',
  sent:      'bg-blue-100 text-blue-700',
  accepted:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-rose-100 text-rose-600',
  expired:   'bg-amber-100 text-amber-700',
};

function ProductDrawer({ product, onClose, onEdit, onDelete, onDuplicate, onApply, embedded = false }) {
  const [tab, setTab] = useState('Overview');

  // Overview data
  const [calcTemplate, setCalcTemplate] = useState(null);
  const [calcLabels, setCalcLabels]     = useState([]);
  const [orders, setOrders]             = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // ── Calculator tab state ──────────────────────────────────────────────────
  const [calcCurrencies, setCalcCurrencies]       = useState([]);
  const [showOtherCurrencies, setShowOtherCurrencies] = useState(false);
  const [costFields, setCostFields]               = useState([]);
  const [costs, setCosts]                   = useState({});
  const [profitMargin, setProfitMargin]     = useState('');
  const [fabricUnit, setFabricUnit]         = useState('KG');
  const [fabricPrice, setFabricPrice]       = useState('');
  const [piecesPerUnit, setPiecesPerUnit]   = useState('');
  const [savedCalcs, setSavedCalcs]         = useState([]);
  const [selectedId, setSelectedId]         = useState('');
  const [newCalcName, setNewCalcName]       = useState('');
  const [savingCalc, setSavingCalc]         = useState(false);
  const [saveSuccess, setSaveSuccess]       = useState(false);
  const [saveError, setSaveError]           = useState('');
  const [delCalcId, setDelCalcId]           = useState(null);
  const [applying, setApplying]             = useState(false);

  // Load order history
  useEffect(() => {
    if (!product?.id) return;
    setOrders(null);
    setOrdersLoading(true);
    api.get(`/products/${product.id}/order-history`)
      .then(r => setOrders(r.data))
      .catch(() => setOrders(null))
      .finally(() => setOrdersLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Load templates, cost fields, currencies
  useEffect(() => {
    if (!product?.id) return;
    // Reset calculator inputs on product change
    setCosts({}); setProfitMargin(''); setFabricPrice(''); setPiecesPerUnit('');
    setFabricUnit('KG'); setSelectedId(''); setNewCalcName('');

    Promise.all([
      apiFetch(`/api/calculator-templates?product_id=${product.id}`).then(r => r.json()),
      apiFetch('/api/cost-breakdown-items').then(r => r.json()),
      apiFetch('/api/currencies').then(r => r.json()),
    ]).then(([templates, labels, currs]) => {
      const tmpl = Array.isArray(templates) && templates.length > 0 ? templates[0] : null;
      setCalcTemplate(tmpl);
      setSavedCalcs(Array.isArray(templates) ? templates : []);

      const enabledLabels = Array.isArray(labels) ? labels.filter(l => l.enabled) : [];
      setCalcLabels(enabledLabels);
      setCostFields(enabledLabels);
      setCosts(Object.fromEntries(enabledLabels.map(f => [f.key, ''])));

      const currList = Array.isArray(currs) ? currs : [];
      setCalcCurrencies(currList);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  const images = (() => { try { return JSON.parse(product.images ?? '[]'); } catch { return []; } })();
  const isLowStock = parseFloat(product.reorder_level) > 0 && parseFloat(product.stock_quantity) <= parseFloat(product.reorder_level);

  // ── Calculator helpers ────────────────────────────────────────────────────
  const parse = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const fabricCostPerPiece = (() => {
    const p = parse(fabricPrice), u = parse(piecesPerUnit);
    return p > 0 && u > 0 ? p / u : 0;
  })();

  const otherCosts   = costFields.reduce((s, f) => s + parse(costs[f.key]), 0);
  const unitCostCalc = fabricCostPerPiece + otherCosts;
  const profitPct    = parse(profitMargin);
  const profitAmt    = unitCostCalc * (profitPct / 100);
  const sellingPriceCalc = unitCostCalc + profitAmt;

  const defaultCur = calcCurrencies.find(c => c.is_default === 1) || calcCurrencies[0] || null;
  const currSym    = defaultCur?.symbol || '';
  const fmtCalc    = v => `${currSym}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const emptyCalcCosts = fields => Object.fromEntries(fields.map(f => [f.key, '']));

  const buildBody = name => {
    const defCur = calcCurrencies.find(c => c.is_default === 1) || calcCurrencies[0];
    return {
      name, product_id: product.id, total_pieces: 0,
      profit_margin: profitMargin,
      costs: JSON.stringify({
        ...costs,
        __fabric_price: fabricPrice,
        __pieces_per_unit: piecesPerUnit,
        __fabric_unit: fabricUnit,
      }),
      size_breakdown: '{}', notes: '', currency: defCur?.code || '',
    };
  };

  function loadCalc(id) {
    setSaveError(''); setSaveSuccess(false);
    if (!id) {
      setSelectedId(''); setCosts(emptyCalcCosts(costFields));
      setProfitMargin(''); setFabricPrice(''); setPiecesPerUnit(''); setFabricUnit('KG');
      setNewCalcName(''); return;
    }
    const calc = savedCalcs.find(c => c.id === parseInt(id));
    if (!calc) return;
    setSelectedId(String(calc.id));
    setProfitMargin(calc.profit_margin > 0 ? String(calc.profit_margin) : '');
    try {
      const saved = JSON.parse(calc.costs || '{}');
      setCosts(Object.fromEntries(costFields.map(f => [f.key, String(saved[f.key] ?? '')])));
      setFabricPrice(String(saved.__fabric_price ?? ''));
      setPiecesPerUnit(String(saved.__pieces_per_unit ?? ''));
      setFabricUnit(saved.__fabric_unit ?? 'KG');
    } catch { setCosts(emptyCalcCosts(costFields)); }
  }

  async function handleSaveCalc() {
    const nameToUse = selectedId
      ? (savedCalcs.find(c => c.id === parseInt(selectedId))?.name ?? '')
      : newCalcName.trim();
    if (!nameToUse) return;
    setSavingCalc(true); setSaveError(''); setSaveSuccess(false);
    try {
      let saved;
      if (selectedId) {
        const r = await apiFetch(`/api/calculator-templates/${selectedId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(nameToUse)),
        });
        if (!r.ok) throw new Error('Failed');
        saved = await r.json();
        setSavedCalcs(prev => prev.map(c => c.id === saved.id ? saved : c));
      } else {
        const r = await apiFetch('/api/calculator-templates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(nameToUse)),
        });
        if (!r.ok) throw new Error('Failed');
        saved = await r.json();
        setSavedCalcs(prev => [saved, ...prev]);
        setSelectedId(String(saved.id)); setNewCalcName('');
      }
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2500);
    } catch { setSaveError('Save failed'); } finally { setSavingCalc(false); }
  }

  async function handleDeleteCalc(id) {
    await apiFetch(`/api/calculator-templates/${id}`, { method: 'DELETE' });
    setSavedCalcs(prev => prev.filter(c => c.id !== id));
    if (selectedId === String(id)) {
      setSelectedId(''); setCosts(emptyCalcCosts(costFields)); setProfitMargin('');
      setFabricPrice(''); setPiecesPerUnit('');
    }
    setDelCalcId(null);
  }

  async function handleApplyCalc() {
    setApplying(true);
    try {
      const defCur = calcCurrencies.find(c => c.is_default === 1) || calcCurrencies[0];
      if (!defCur) { setApplying(false); return; }

      // Save default-currency price
      await apiFetch(`/api/products/${product.id}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: defCur.code,
          unit_cost: parseFloat(unitCostCalc.toFixed(4)),
          selling_price: parseFloat(sellingPriceCalc.toFixed(4)),
        }),
      });

      // Convert and save prices for all other currencies
      const defRate = parseFloat(defCur.rate_to_pkr) || 1;
      const otherCurs = calcCurrencies.filter(c => c.code !== defCur.code);
      await Promise.all(otherCurs.map(c => {
        const tgtRate = parseFloat(c.rate_to_pkr) || 1;
        const convCost = (unitCostCalc    * defRate) / tgtRate;
        const convSell = (sellingPriceCalc * defRate) / tgtRate;
        return apiFetch(`/api/products/${product.id}/prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency:     c.code,
            unit_cost:     parseFloat(convCost.toFixed(4)),
            selling_price: parseFloat(convSell.toFixed(4)),
          }),
        });
      }));

      // Save/update calculator template
      const nameToUse = selectedId
        ? (savedCalcs.find(c => c.id === parseInt(selectedId))?.name ?? product.name)
        : (newCalcName.trim() || product.name);
      const body = buildBody(nameToUse);
      if (selectedId) {
        await apiFetch(`/api/calculator-templates/${selectedId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else if (newCalcName.trim()) {
        const r = await apiFetch('/api/calculator-templates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (r.ok) { const saved = await r.json(); setSavedCalcs(prev => [saved, ...prev]); setSelectedId(String(saved.id)); setNewCalcName(''); }
      }

      await onApply(product);
    } catch { /* non-blocking */ }
    setApplying(false);
    setTab('Overview');
  }

  // Tabs visible: hide "Calculate Price" for services
  const visibleTabs = DRAWER_TABS.filter(t => t !== 'Calculate Price' || product.product_type !== 'service');

  return (
    <>
      {!embedded && <div className="fixed inset-0 bg-black/30 z-40 animate-overlay" onClick={onClose} />}
      <div className={embedded
        ? 'flex flex-col h-full'
        : 'fixed right-0 top-0 h-screen w-full max-w-3xl bg-white shadow-2xl z-50 flex flex-col animate-drawer'
      }>

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 flex-shrink-0">
          {/* Left: identity */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {embedded && (
              <button onClick={onClose} className="lg:hidden p-1 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Box size={14} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 text-sm leading-tight truncate">{product.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {product.article_number && (
                  <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{product.article_number}</span>
                )}
                {product.sku && <span className="text-slate-400 text-xs font-mono truncate">SKU: {product.sku}</span>}
              </div>
            </div>
            <StatusBadge status={product.status} />
            {product.product_type === 'service' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 whitespace-nowrap flex-shrink-0">⚙️ Service</span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onDuplicate?.(product)} title="Duplicate"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <Copy size={14} />
            </button>
            <button onClick={() => onDelete(product)} title="Delete"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
            {!embedded && (
              <>
                <div className="w-px h-4 bg-slate-200 mx-0.5" />
                <button onClick={onClose} title="Close"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 flex-shrink-0 gap-1">
          {visibleTabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-150 ${
                tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}>
              {t === 'Calculate Price' && <Calculator size={12} />}
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Overview ── */}
          {tab === 'Overview' && (
            <div className="grid grid-cols-1 sm:grid-cols-5 sm:divide-x divide-slate-100 min-h-full">
              <div className="sm:col-span-3 px-4 sm:px-6 py-5 space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Details</h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                    {[
                      { label: 'Article No.', value: product.article_number },
                      { label: 'SKU',         value: product.sku },
                      { label: 'Category',    value: product.category_name ? <CategoryBadge name={product.category_name} color={product.category_color} /> : null },
                      { label: 'Unit',        value: product.unit },
                      { label: 'Times Ordered', value: orders ? `${orders.stats.invoice_count} invoice${orders.stats.invoice_count !== 1 ? 's' : ''}, ${orders.stats.quotation_count} quote${orders.stats.quotation_count !== 1 ? 's' : ''}` : null },
                      { label: 'Units Invoiced', value: orders?.stats.total_qty_invoiced > 0 ? `${orders.stats.total_qty_invoiced.toLocaleString()} ${product.unit}` : null },
                      { label: 'Total Sold',  value: parseFloat(product.total_sold) > 0 ? `${parseFloat(product.total_sold).toLocaleString()} ${product.unit}` : null },
                      { label: 'Status',      value: <StatusBadge status={product.status} /> },
                      { label: 'Added',       value: fmt(product.created_at) },
                    ].filter(r => r.value).map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                        <div className="text-sm text-slate-800 font-medium">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {product.description && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{product.description}</p>
                  </div>
                )}
                {product.notes && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</h3>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{product.notes}</div>
                  </div>
                )}
              </div>
              <div className="sm:col-span-2 px-4 sm:px-6 py-5 space-y-5 bg-slate-50/50 border-t sm:border-t-0 border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pricing</p>
                  {(() => {
                    let prices = [];
                    try { prices = JSON.parse(product.prices_json || '[]'); } catch {}
                    if (prices.length === 0) {
                      return (
                        <p className="text-xs text-slate-400 italic">
                          No prices set.{' '}
                          <button type="button" onClick={() => onEdit?.(product)}
                            className="text-indigo-500 hover:underline font-medium">
                            Edit product to add prices
                          </button>
                        </p>
                      );
                    }
                    // Sort: default currency first
                    const defCurOverview = calcCurrencies.find(c => c.is_default === 1);
                    const sortedPrices = defCurOverview
                      ? [...prices.filter(pr => pr.currency === defCurOverview.code), ...prices.filter(pr => pr.currency !== defCurOverview.code)]
                      : prices;
                    return (
                      <div className="space-y-2">
                        {sortedPrices.map(pr => {
                          const pm = margin(pr.unit_cost, pr.selling_price);
                          const cRow = calcCurrencies.find(c => c.code === pr.currency);
                          const sym = cRow?.symbol || '';
                          const isDefault = pr.currency === defCurOverview?.code;
                          return (
                            <div key={pr.currency} className={`bg-white border rounded-xl overflow-hidden ${isDefault ? 'border-indigo-200' : 'border-slate-200'}`}>
                              <div className={`flex items-center justify-between px-3 py-1.5 border-b border-slate-100 ${isDefault ? 'bg-indigo-50' : 'bg-slate-50/60'}`}>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-bold tracking-wider ${isDefault ? 'text-indigo-600' : 'text-slate-500'}`}>{pr.currency}</span>
                                  {isDefault && <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">Default</span>}
                                </div>
                                {pm !== null && (
                                  <span className={`text-xs font-semibold ${parseFloat(pm) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{pm}% margin</span>
                                )}
                              </div>
                              <div className="px-3 py-2 space-y-1">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-400">Unit Cost</span>
                                  <span className="text-xs font-semibold text-slate-600 font-mono">{sym}{fmtPrice(pr.unit_cost)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-400">Selling Price</span>
                                  <span className="text-sm font-bold text-slate-900 font-mono">{sym}{fmtPrice(pr.selling_price)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                {product.product_type !== 'service' && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Stock</p>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                      <span className="text-xs text-slate-500">Quantity</span>
                      <span className={`text-sm font-bold ${isLowStock ? 'text-amber-600' : 'text-slate-800'}`}>
                        {parseFloat(product.stock_quantity) || 0} {product.unit}
                        {isLowStock && <AlertCircle size={12} className="inline ml-1" />}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-xs text-slate-500">Reorder Level</span>
                      <span className="text-sm font-semibold text-slate-800">{parseFloat(product.reorder_level) || 0} {product.unit}</span>
                    </div>
                  </div>
                  {isLowStock && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertCircle size={12} /> Low stock — reorder needed
                    </div>
                  )}
                </div>
                )}

              </div>
            </div>
          )}

          {/* ── Orders ── */}
          {tab === 'Orders' && (
            <div className="px-6 py-5 space-y-5">
              {ordersLoading ? (
                <div className="py-12 text-center">
                  <div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Scanning invoices & quotations…</p>
                </div>
              ) : !orders || (orders.invoices.length === 0 && orders.quotations.length === 0) ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={20} className="text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium">No orders found</p>
                  <p className="text-slate-400 text-sm mt-1">
                    This product hasn't appeared in any invoice or quotation yet.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Invoices',       value: orders.stats.invoice_count,                                  color: 'text-indigo-700',  bg: 'bg-indigo-50' },
                      { label: 'Quotations',      value: orders.stats.quotation_count,                                color: 'text-violet-700',  bg: 'bg-violet-50' },
                      { label: 'Units Invoiced',  value: `${orders.stats.total_qty_invoiced.toLocaleString()} ${product.unit}`,  color: 'text-emerald-700', bg: 'bg-emerald-50' },
                      { label: 'Units Quoted',    value: `${orders.stats.total_qty_quoted.toLocaleString()} ${product.unit}`,    color: 'text-amber-700',   bg: 'bg-amber-50' },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} className={`${bg} rounded-xl p-3.5 text-center`}>
                        <p className="text-xs text-slate-500 mb-1">{label}</p>
                        <p className={`text-base font-bold ${color} leading-tight`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Revenue from invoices */}
                  {Object.keys(orders.stats.invoice_by_currency || {}).length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm text-emerald-700 font-medium pt-0.5">Total Revenue (Invoiced)</span>
                        <div className="text-right">
                          {Object.entries(orders.stats.invoice_by_currency).map(([cur, amt]) => (
                            <div key={cur} className="font-bold text-emerald-800 text-base leading-tight">
                              {fmtCur(amt, cur)}
                            </div>
                          ))}
                          {orders.stats.mixed_invoice && (
                            <div className="text-xs text-emerald-600 mt-1 font-medium">
                              ≈ {fmtCur(orders.stats.invoice_usd_equiv, 'USD')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Invoices table */}
                  {orders.invoices.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full inline-block" />
                        Invoices ({orders.invoices.length})
                      </p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Invoice #</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Client</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Date</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Status</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400">Qty</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orders.invoices.map(o => (
                              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-indigo-600 font-semibold text-xs">{o.number}</td>
                                <td className="px-4 py-2.5 text-slate-700 text-xs truncate max-w-[100px]">{o.client_name || '—'}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(o.created_at)}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ORDER_STATUS_COLORS[o.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {o.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-slate-800 text-xs">
                                  {o.quantity.toLocaleString()} {product.unit}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-emerald-700 text-xs">
                                  {fmtCur(o.revenue, o.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t border-slate-200">
                            <tr>
                              <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-slate-500">Total</td>
                              <td className="px-4 py-2 text-right text-xs font-bold text-slate-800">
                                {orders.stats.total_qty_invoiced.toLocaleString()} {product.unit}
                              </td>
                              <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700">
                                {Object.entries(orders.stats.invoice_by_currency || {}).map(([cur, amt]) => (
                                  <div key={cur}>{fmtCur(amt, cur)}</div>
                                ))}
                                {orders.stats.mixed_invoice && (
                                  <div className="text-slate-400 font-normal text-xs">≈ {fmtCur(orders.stats.invoice_usd_equiv, 'USD')}</div>
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Quotations table */}
                  {orders.quotations.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-violet-500 rounded-full inline-block" />
                        Quotations ({orders.quotations.length})
                      </p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Quote #</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Client</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Date</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Status</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400">Qty</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orders.quotations.map(o => (
                              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-violet-600 font-semibold text-xs">{o.number}</td>
                                <td className="px-4 py-2.5 text-slate-700 text-xs truncate max-w-[100px]">{o.client_name || '—'}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(o.created_at)}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ORDER_STATUS_COLORS[o.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {o.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-slate-800 text-xs">
                                  {o.quantity.toLocaleString()} {product.unit}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-violet-700 text-xs">
                                  {fmtCur(o.revenue, o.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t border-slate-200">
                            <tr>
                              <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-slate-500">Total</td>
                              <td className="px-4 py-2 text-right text-xs font-bold text-slate-800">
                                {orders.stats.total_qty_quoted.toLocaleString()} {product.unit}
                              </td>
                              <td className="px-4 py-2 text-right text-xs font-bold text-violet-700">
                                {Object.entries(orders.stats.quotation_by_currency || {}).map(([cur, amt]) => (
                                  <div key={cur}>{fmtCur(amt, cur)}</div>
                                ))}
                                {orders.stats.mixed_quotation && (
                                  <div className="text-slate-400 font-normal text-xs">≈ {fmtCur(orders.stats.quotation_usd_equiv, 'USD')}</div>
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Images ── */}
          {tab === 'Images' && (
            <div className="px-6 py-5">
              {images.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Image size={20} className="text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium">No images</p>
                  <p className="text-slate-400 text-sm mt-1">Edit this product to upload images.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {images.map(img => (
                    <a key={img.filename} href={img.url} target="_blank" rel="noreferrer"
                      className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 hover:opacity-90 transition-opacity block">
                      <img src={imgUrl(img.url)} alt={img.originalName} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState('products');
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [catModal, setCatModal]     = useState(null);
  const [drawer, setDrawer]         = useState(null);
  const [delTarget, setDelTarget]   = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: c }, { data: cur }] = await Promise.all([
        api.get('/products'), api.get('/categories'), api.get('/currencies'),
      ]);
      setProducts(p); setCategories(c);
      setCurrencies(Array.isArray(cur) ? cur : []);
    } catch { setProducts([]); setCategories([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const handleSaveCategory = async (form) => {
    if (catModal?.id) await api.put(`/categories/${catModal.id}`, form);
    else await api.post('/categories', form);
    await loadAll();
  };

  const handleCalcApply = async (product) => {
    await loadAll();
    // Refresh drawer with updated product (now includes new price in prices_json)
    try {
      const { data } = await api.get(`/products/${product.id}`);
      setDrawer(prev => prev?.id === product.id ? data : prev);
    } catch {}
  };

  const handleDelete = async () => {
    const { type, item } = delTarget;
    try {
      if (type === 'product') {
        await api.delete(`/products/${item.id}`);
        if (drawer?.id === item.id) setDrawer(null);
      } else {
        await api.delete(`/categories/${item.id}`);
      }
      setDelTarget(null);
      await loadAll();
    } catch (err) {
      // Backend returns 409 with a friendly message when product is in use
      const msg = err?.response?.data?.error
        || 'Could not delete. The item may be in use elsewhere.';
      setDelTarget(prev => prev ? { ...prev, error: msg } : null);
    }
  };

  const handleDuplicateProduct = async (product) => {
    try {
      const { data } = await api.post(`/products/${product.id}/duplicate`);
      await loadAll();
      setDrawer(data);
    } catch (e) {
      alert(e?.response?.data?.error ?? 'Failed to duplicate product.');
    }
  };

  const stats = {
    total:    products.length,
    active:   products.filter(p => p.status === 'active').length,
    cats:     categories.length,
    lowStock: products.filter(p => parseFloat(p.reorder_level) > 0 && parseFloat(p.stock_quantity) <= parseFloat(p.reorder_level)).length,
  };

  const filtered = products.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (catFilter && String(p.category_id) !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [p.name, p.sku, p.category_name, p.description].some(f => f?.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="flex flex-col animate-page" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Header row ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold text-slate-900">Products</h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-indigo-600 font-semibold">{stats.total}</span> total ·
              <span className="text-emerald-600 font-semibold">{stats.active}</span> active
              {stats.lowStock > 0 && (
                <><span>·</span><span className="text-amber-600 font-semibold flex items-center gap-1"><AlertCircle size={11} />{stats.lowStock} low stock</span></>
              )}
            </div>
          </div>
        </div>
        {/* View tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[['products', Package, 'Products'], ['categories', Tag, 'Categories']].map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg font-medium transition-all duration-150 ${
                view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon size={13} />{label}
              {v === 'categories' && <span className="text-xs opacity-60">({stats.cats})</span>}
            </button>
          ))}
        </div>

        {/* Action button */}
        {view === 'categories' ? (
          <button onClick={() => setCatModal('new')}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0">
            <Plus size={15} /> New Category
          </button>
        ) : (
          <button onClick={() => navigate('/products/new')}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0">
            <Plus size={15} /> New Product
          </button>
        )}
      </div>

      {/* Inline delete confirmation */}
      {delTarget && (
        <div className={`flex items-center gap-3 px-4 py-3 mb-1 border rounded-xl text-sm flex-shrink-0 ${
          delTarget.error
            ? 'bg-amber-50 border-amber-200'
            : 'bg-rose-50 border-rose-200'
        }`}>
          <AlertTriangle size={15} className={`flex-shrink-0 ${delTarget.error ? 'text-amber-600' : 'text-rose-500'}`} />
          <span className={`flex-1 font-medium ${delTarget.error ? 'text-amber-800' : 'text-rose-700'}`}>
            {delTarget.error
              ? delTarget.error
              : <>Delete <strong>{delTarget.item.name}</strong>? This cannot be undone.</>}
          </span>
          <button onClick={() => setDelTarget(null)}
            className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
              delTarget.error
                ? 'border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'border-rose-200 text-rose-600 hover:bg-rose-100'
            }`}>
            {delTarget.error ? 'Close' : 'Cancel'}
          </button>
          {!delTarget.error && (
            <button onClick={handleDelete}
              className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium">
              Delete
            </button>
          )}
        </div>
      )}

      {/* ── Products two-panel view ── */}
      {view === 'products' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

          {/* LEFT PANEL — product list */}
          <div className={`w-full lg:w-80 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 ${drawer ? 'hidden lg:flex' : ''}`}>

            {/* Search + filters */}
            <div className="p-3 border-b border-slate-100 space-y-2 flex-shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white" />
              </div>
              <div className="flex gap-1">
                {[['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']].map(([v, label]) => (
                  <button key={v} onClick={() => setStatus(v)}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all duration-150 ${
                      statusFilter === v ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    }`}>{label}</button>
                ))}
              </div>
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 bg-white cursor-pointer text-slate-600">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Scrollable product list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-16 text-center">
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-slate-400 text-xs">Loading…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center px-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Package size={18} className="text-slate-300" />
                  </div>
                  <p className="text-slate-500 text-xs font-medium">
                    {search || catFilter || statusFilter !== 'all' ? 'No matches' : 'No products yet'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {search || catFilter || statusFilter !== 'all' ? 'Try different filters' : 'Click "New Product" to start'}
                  </p>
                </div>
              ) : (
                <div>
                  {filtered.map(p => {
                    const isSelected = drawer?.id === p.id;
                    const isLow = parseFloat(p.reorder_level) > 0 && parseFloat(p.stock_quantity) <= parseFloat(p.reorder_level);
                    return (
                      <div key={p.id}
                        onClick={() => setDrawer(p)}
                        className={`group relative flex items-start gap-2.5 px-3.5 py-3 cursor-pointer border-l-[3px] transition-all duration-100 border-b border-slate-50 ${
                          isSelected
                            ? 'border-l-indigo-600 bg-indigo-50/70'
                            : 'border-l-transparent hover:bg-slate-50/80 hover:border-l-slate-200'
                        }`}>
                        {/* Icon */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isSelected ? 'bg-indigo-100' : 'bg-slate-100'
                        }`}>
                          {p.product_type === 'service'
                            ? <span className="text-2xs">⚙️</span>
                            : <Box size={12} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                          }
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate leading-tight ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                            {p.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {p.article_number && (
                              <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded leading-none">{p.article_number}</span>
                            )}
                            {p.category_name && (
                              <span className="text-xs text-slate-400 truncate">{p.category_name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
                              p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>{p.status}</span>
                            {isLow && (
                              <span className="text-xs text-amber-600 flex items-center gap-0.5 font-medium">
                                <AlertCircle size={10} />low
                              </span>
                            )}
                            {(() => {
                              let prices = [];
                              try { prices = JSON.parse(p.prices_json || '[]'); } catch {}
                              if (prices.length > 0) {
                                // Sort: default currency first
                                const defCur = currencies.find(c => c.is_default === 1);
                                const sorted = defCur
                                  ? [...prices.filter(pr => pr.currency === defCur.code), ...prices.filter(pr => pr.currency !== defCur.code)]
                                  : prices;
                                const defPrice = sorted[0];
                                const others   = sorted.slice(1);
                                const defSym   = currencies.find(c => c.code === defPrice?.currency)?.symbol || '';
                                return (
                                  <div className="ml-auto text-right flex-shrink-0">
                                    <p className="text-xs font-bold text-slate-800 font-mono">{defSym}{fmtPrice(defPrice?.selling_price)}</p>
                                    {others.length > 0 && (
                                      <p className="text-2xs text-slate-400 font-mono leading-snug">
                                        {others.slice(0, 2).map((pr, i) => {
                                          const sym = currencies.find(c => c.code === pr.currency)?.symbol || pr.currency;
                                          return (i > 0 ? ' · ' : '') + sym + fmtPrice(pr.selling_price);
                                        }).join('')}
                                        {others.length > 2 ? ` +${others.length - 2}` : ''}
                                      </p>
                                    )}
                                  </div>
                                );
                              }
                              if (parseFloat(p.selling_price) > 0) {
                                return <span className="text-xs text-slate-500 ml-auto font-mono">{fmtPrice(p.selling_price)}</span>;
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        {/* Hover actions */}
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center">
                          <button onClick={e => { e.stopPropagation(); navigate(`/products/${p.id}/edit`); }} title="Edit"
                            className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-100 rounded transition-colors">
                            <Pencil size={11} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDelTarget({ type: 'product', item: p }); }} title="Delete"
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-100 rounded transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Count footer */}
                  <div className="px-3.5 py-2 border-t border-slate-100">
                    <p className="text-2xs text-slate-400">{filtered.length} of {products.length} product{products.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL — product detail */}
          <div className="flex-1 min-w-0 flex flex-col">
            {drawer ? (
              <ProductDrawer
                product={drawer}
                embedded={true}
                onClose={() => setDrawer(null)}
                onEdit={p => navigate(`/products/${p.id}/edit`)}
                onDelete={p => setDelTarget({ type: 'product', item: p })}
                onDuplicate={handleDuplicateProduct}
                onApply={handleCalcApply}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                  <Package size={28} className="text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">Select a product</p>
                <p className="text-slate-400 text-sm mt-1 max-w-xs">
                  Click any product on the left to view its details, pricing, and order history.
                </p>
                <button onClick={() => navigate('/products/new')}
                  className="mt-5 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm">
                  <Plus size={14} /> New Product
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Categories View ── */}
      {view === 'categories' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin-slow mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Loading categories…</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Tag size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-600 font-medium">No categories yet</p>
              <p className="text-slate-400 text-sm mt-1">Click "New Category" to create your first one</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(cat => (
                <div key={cat.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm card-hover group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${cat.color}18` }}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{cat.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {cat.product_count} product{cat.product_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setCatModal(cat)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDelTarget({ type: 'category', item: cat })}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {cat.description && (
                    <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">{cat.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {catModal !== null && (
        <CategoryModal
          category={catModal === 'new' ? null : catModal}
          onClose={() => setCatModal(null)}
          onSave={handleSaveCategory}
        />
      )}
    </div>
  );
}
