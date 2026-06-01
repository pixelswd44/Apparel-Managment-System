import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Check, X, Image, Box,
  AlertCircle, Calculator, Trash2, Loader2, AlertTriangle,
  ChevronDown, Plus, Pencil,
} from 'lucide-react';
import api, { apiFetch } from '../lib/api';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = v => (parseFloat(v) || 0).toFixed(2);
const margin = (cost, sell) => {
  const c = parseFloat(cost) || 0, s = parseFloat(sell) || 0;
  if (!c || !s) return null;
  return (((s - c) / s) * 100).toFixed(1);
};

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
              <img src={img.url} alt={img.originalName} className="w-full h-full object-cover" />
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

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden"
          style={{ maxHeight: 300, overflowY: 'auto' }}>

          <button type="button" onClick={clear}
            className="w-full text-left px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-50 transition-colors border-b border-slate-100">
            — No Category —
          </button>

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

// ─── Main Product Form Page ───────────────────────────────────────────────────

export default function ProductForm() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEdit    = Boolean(id);

  const [form, setForm]         = useState(EMPTY_PRODUCT);
  const [categories, setCategories] = useState([]);
  const [images, setImages]     = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const [productPrices, setProductPrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [deletingPrice, setDeletingPrice] = useState(null);
  const [currencies, setCurrencies]       = useState([]);

  // Inline price editor state
  const [priceForm, setPriceForm] = useState({ currency: '', unit_cost: '', selling_price: '', margin: '' });
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError]   = useState('');
  const [editingPriceCurrency, setEditingPriceCurrency] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [catRes, currRes] = await Promise.all([
          apiFetch('/api/categories'),
          apiFetch('/api/currencies'),
        ]);
        const cats  = await catRes.json().catch(() => []);
        const currs = await currRes.json().catch(() => []);
        if (!cancelled) {
          setCategories(Array.isArray(cats) ? cats : []);
          const list = Array.isArray(currs) ? currs : [];
          setCurrencies(list);
          // Default the price form currency to the system default
          const def = list.find(c => c.is_default === 1) || list[0];
          if (def) setPriceForm(p => ({ ...p, currency: def.code }));
        }

        if (isEdit) {
          const pRes = await apiFetch(`/api/products/${id}`);
          if (!pRes.ok) throw new Error('Failed to load product');
          const product = await pRes.json();
          if (cancelled) return;
          setForm({ ...EMPTY_PRODUCT, ...product });
          try { setImages(JSON.parse(product.images ?? '[]')); } catch { setImages([]); }
        }
      } catch (e) {
        if (!cancelled) setError('Failed to load product data.');
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [id, isEdit]);

  // ── Load prices for edit mode ──────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return;
    setPricesLoading(true);
    apiFetch(`/api/products/${id}/prices`)
      .then(r => r.json())
      .then(data => setProductPrices(Array.isArray(data) ? data : []))
      .catch(() => setProductPrices([]))
      .finally(() => setPricesLoading(false));
  }, [id, isEdit]);

  const handleDeletePrice = async (currency) => {
    try {
      await apiFetch(`/api/products/${id}/prices/${currency}`, { method: 'DELETE' });
      setProductPrices(prev => prev.filter(p => p.currency !== currency));
    } catch {}
    setDeletingPrice(null);
  };

  // ── Price form helpers ───────────────────────────────────────────────────────
  // When cost or margin changes → recalc selling price
  // When cost or selling changes → recalc margin
  const handleCostChange = v => {
    setPriceForm(p => {
      const cost   = parseFloat(v) || 0;
      const sell   = parseFloat(p.selling_price) || 0;
      const margin = sell > 0 ? (((sell - cost) / sell) * 100).toFixed(2) : p.margin;
      return { ...p, unit_cost: v, margin: sell > 0 ? margin : p.margin };
    });
  };

  const handleSellingChange = v => {
    setPriceForm(p => {
      const cost = parseFloat(p.unit_cost) || 0;
      const sell = parseFloat(v) || 0;
      const margin = sell > 0 ? (((sell - cost) / sell) * 100).toFixed(2) : '';
      return { ...p, selling_price: v, margin };
    });
  };

  const handleMarginChange = v => {
    setPriceForm(p => {
      const cost = parseFloat(p.unit_cost) || 0;
      const m    = parseFloat(v);
      if (cost > 0 && !isNaN(m) && m < 100) {
        const sell = cost / (1 - m / 100);
        return { ...p, margin: v, selling_price: sell.toFixed(2) };
      }
      return { ...p, margin: v };
    });
  };

  const startEditPrice = (price) => {
    setEditingPriceCurrency(price.currency);
    setPriceForm({
      currency: price.currency,
      unit_cost: String(price.unit_cost ?? ''),
      selling_price: String(price.selling_price ?? ''),
      margin: margin(price.unit_cost, price.selling_price) ?? '',
    });
    setPriceError('');
  };

  const cancelEditPrice = () => {
    setEditingPriceCurrency(null);
    const def = currencies.find(c => c.is_default === 1) || currencies[0];
    setPriceForm({ currency: def?.code || '', unit_cost: '', selling_price: '', margin: '' });
    setPriceError('');
  };

  const handleSavePrice = async () => {
    setPriceError('');
    if (!priceForm.currency) { setPriceError('Pick a currency.'); return; }
    const cost = parseFloat(priceForm.unit_cost) || 0;
    const sell = parseFloat(priceForm.selling_price) || 0;
    if (sell <= 0) { setPriceError('Enter a selling price greater than 0.'); return; }
    if (!isEdit) { setPriceError('Save the product first to add prices.'); return; }

    setPriceSaving(true);
    try {
      const { data } = await api.post(`/products/${id}/prices`, {
        currency:      priceForm.currency,
        unit_cost:     cost,
        selling_price: sell,
      });
      setProductPrices(prev => {
        const without = prev.filter(p => p.currency !== priceForm.currency);
        return [...without, data].sort((a, b) => a.currency.localeCompare(b.currency));
      });
      cancelEditPrice();
    } catch (err) {
      setPriceError(err?.response?.data?.error || 'Failed to save price.');
    } finally {
      setPriceSaving(false);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form, images: JSON.stringify(images) };
      if (isEdit) {
        await api.put(`/products/${id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      navigate('/products');
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => navigate('/products');

  // ── Page loading ───────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">{isEdit ? 'Loading product…' : 'Preparing form…'}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Sticky top bar ── */}
      <div className="-mx-8 -mt-8 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between gap-4">

        {/* Left: back + title */}
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={handleCancel}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0 font-medium">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Box size={15} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-base truncate">
                {isEdit ? 'Edit Product' : 'New Product'}
              </h1>
              {isEdit && form.name && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">{form.name}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {error && (
            <p className="text-xs text-rose-600 max-w-[200px] truncate">{error}</p>
          )}
          <button onClick={handleCancel}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors font-medium">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
            {saving
              ? <><Loader2 size={13} className="animate-spin" />Saving…</>
              : <><Save size={13} />{isEdit ? 'Update Product' : 'Save Product'}</>
            }
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Form body — two equal columns ── */}
      <div className="mt-6 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* ── LEFT COLUMN — Product Details ── */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center">
                <Box size={13} className="text-indigo-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">Product Details</h2>
            </div>

            <Field label="Product Name" required>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                className={inputCls} placeholder="e.g. Classic Polo Shirt" autoFocus />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Article Number">
                <input value={form.article_number} onChange={e => set('article_number', e.target.value)}
                  className={inputCls} placeholder="e.g. ART-2024-001" />
              </Field>
              <Field label="SKU">
                <input value={form.sku} onChange={e => set('sku', e.target.value)}
                  className={inputCls} placeholder="e.g. PLO-001-S-RED" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <CategorySelect
                  value={form.category_id}
                  categories={categories}
                  onChange={v => set('category_id', v)}
                  onCategoriesChange={setCategories}
                />
              </Field>
              <Field label="Unit">
                <select value={form.unit} onChange={e => set('unit', e.target.value)} className={selectCls}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Status">
              <div className="flex gap-2">
                {['active', 'inactive'].map(s => (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 capitalize ${
                      form.status === s
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}>
                    {form.status === s && <Check size={11} className="inline mr-1" />}{s}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Product Type">
              <div className="flex gap-2">
                {[['physical', '📦 Physical Product'], ['service', '⚙️ Service']].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => set('product_type', val)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 ${
                      form.product_type === val
                        ? val === 'service'
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}>
                    {form.product_type === val && <Check size={11} className="inline mr-1" />}{label}
                  </button>
                ))}
              </div>
              {form.product_type === 'service' && (
                <p className="text-xs text-violet-600 mt-1.5 opacity-70">
                  Stock tracking and price calculator are hidden for services.
                </p>
              )}
            </Field>

            <Field label="Description">
              <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                className={`${inputCls} resize-none`} placeholder="Product description…" />
            </Field>

            <Field label="Notes">
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
                className={`${inputCls} resize-none`} placeholder="Internal notes…" />
            </Field>
          </div>

          {/* ── RIGHT COLUMN — Media, Stock & Pricing (unified card) ── */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">

            {/* — Images section — */}
            <div>
              <div className="flex items-center gap-2 pb-2 mb-4 border-b border-slate-100">
                <div className="w-7 h-7 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center">
                  <Image size={13} className="text-emerald-600" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Product Images</h2>
                <span className="text-xs text-slate-400 ml-auto">Up to 5</span>
              </div>
              <ImageUploader images={images} onChange={setImages} />
            </div>

            {/* — Stock section — hidden for services */}
            {form.product_type !== 'service' && (
              <div>
                <div className="flex items-center gap-2 pb-2 mb-4 border-b border-slate-100">
                  <div className="w-7 h-7 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center">
                    <AlertCircle size={13} className="text-amber-600" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">Stock & Inventory</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Stock Quantity">
                    <input type="number" min="0" value={form.stock_quantity} onChange={e => set('stock_quantity', e.target.value)}
                      className={inputCls} placeholder="0" />
                  </Field>
                  <Field label="Reorder Level">
                    <input type="number" min="0" value={form.reorder_level} onChange={e => set('reorder_level', e.target.value)}
                      className={inputCls} placeholder="Alert when below…" />
                  </Field>
                </div>

                {parseFloat(form.stock_quantity) <= parseFloat(form.reorder_level) && parseFloat(form.reorder_level) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-4 py-3 rounded-xl mt-3">
                    <AlertCircle size={14} /> Stock is at or below the reorder level.
                  </div>
                )}
              </div>
            )}

            {/* — Pricing section — */}
            <div>
              <div className="flex items-center gap-2 pb-2 mb-4 border-b border-slate-100">
                <div className="w-7 h-7 bg-violet-50 border border-violet-100 rounded-lg flex items-center justify-center">
                  <Calculator size={13} className="text-violet-600" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Pricing</h2>
                <span className="ml-auto text-xs text-slate-400">Cost & selling price per currency</span>
              </div>

              {!isEdit ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-6 text-center">
                  <Calculator size={20} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Save product first</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Pricing controls become available once the product is saved.
                  </p>
                </div>
              ) : (
                <>
                  {/* Saved prices list */}
                  {pricesLoading ? (
                    <div className="flex items-center justify-center py-4 mb-3">
                      <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                  ) : productPrices.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-3 py-2 text-2xs font-semibold text-slate-400 uppercase tracking-wider">Currency</th>
                            <th className="text-right px-3 py-2 text-2xs font-semibold text-slate-400 uppercase tracking-wider">Cost</th>
                            <th className="text-right px-3 py-2 text-2xs font-semibold text-slate-400 uppercase tracking-wider">Selling</th>
                            <th className="text-right px-3 py-2 text-2xs font-semibold text-slate-400 uppercase tracking-wider">Margin</th>
                            <th className="px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {productPrices.map(pr => {
                            const pm = margin(pr.unit_cost, pr.selling_price);
                            const isEditingThis = editingPriceCurrency === pr.currency;
                            return (
                              <tr key={pr.currency} className={`transition-colors ${isEditingThis ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                                <td className="px-3 py-2.5">
                                  <span className="font-bold text-indigo-600 text-xs tracking-wider">{pr.currency}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right text-xs text-slate-600 font-mono">{fmtPrice(pr.unit_cost)}</td>
                                <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-900 font-mono">{fmtPrice(pr.selling_price)}</td>
                                <td className="px-3 py-2.5 text-right">
                                  {pm !== null && (
                                    <span className={`text-xs font-semibold ${parseFloat(pm) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{pm}%</span>
                                  )}
                                </td>
                                <td className="px-2 py-2.5 text-right">
                                  {deletingPrice === pr.currency ? (
                                    <div className="flex items-center gap-1 justify-end">
                                      <button type="button" onClick={() => handleDeletePrice(pr.currency)}
                                        className="text-xs text-rose-600 font-semibold hover:underline">Yes</button>
                                      <button type="button" onClick={() => setDeletingPrice(null)}
                                        className="text-xs text-slate-400 hover:underline">No</button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 justify-end">
                                      <button type="button" onClick={() => startEditPrice(pr)}
                                        className="p-1 text-slate-300 hover:text-indigo-600 rounded transition-colors" title="Edit">
                                        <Pencil size={11} />
                                      </button>
                                      <button type="button" onClick={() => setDeletingPrice(pr.currency)}
                                        className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors" title="Delete">
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add/Edit price form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {editingPriceCurrency ? `Edit ${editingPriceCurrency} Price` : 'Add Price'}
                      </p>
                      {editingPriceCurrency && (
                        <button type="button" onClick={cancelEditPrice}
                          className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                          Cancel
                        </button>
                      )}
                    </div>

                    {priceError && (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{priceError}</p>
                    )}

                    {/* Currency */}
                    <div>
                      <label className="block text-2xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Currency</label>
                      <select
                        value={priceForm.currency}
                        onChange={e => setPriceForm(p => ({ ...p, currency: e.target.value }))}
                        disabled={!!editingPriceCurrency}
                        className={`${selectCls} disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
                      >
                        {currencies.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.code}{c.name ? ` — ${c.name}` : ''}{c.is_default === 1 ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cost / Margin / Selling */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-2xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Cost</label>
                        <input type="number" min="0" step="any"
                          value={priceForm.unit_cost}
                          onChange={e => handleCostChange(e.target.value)}
                          placeholder="0.00"
                          className={`${inputCls} text-sm font-mono`} />
                      </div>
                      <div>
                        <label className="block text-2xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Margin %</label>
                        <input type="number" min="0" max="99.99" step="any"
                          value={priceForm.margin}
                          onChange={e => handleMarginChange(e.target.value)}
                          placeholder="0"
                          className={`${inputCls} text-sm font-mono`} />
                      </div>
                      <div>
                        <label className="block text-2xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Selling</label>
                        <input type="number" min="0" step="any"
                          value={priceForm.selling_price}
                          onChange={e => handleSellingChange(e.target.value)}
                          placeholder="0.00"
                          className={`${inputCls} text-sm font-mono font-bold text-indigo-700`} />
                      </div>
                    </div>

                    {/* Live preview */}
                    {parseFloat(priceForm.unit_cost) > 0 && parseFloat(priceForm.selling_price) > 0 && (
                      <div className="flex items-center justify-between bg-white border border-indigo-100 rounded-lg px-3 py-2 text-xs">
                        <span className="text-slate-500">
                          Profit per unit: <span className="font-bold text-indigo-700">
                            {fmtPrice(parseFloat(priceForm.selling_price) - parseFloat(priceForm.unit_cost))} {priceForm.currency}
                          </span>
                        </span>
                        <span className="text-slate-500">
                          Margin: <span className="font-bold text-emerald-600">{priceForm.margin || '0'}%</span>
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={handleSavePrice} disabled={priceSaving}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium disabled:opacity-60">
                        {priceSaving
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Plus size={13} />}
                        {priceSaving ? 'Saving…' : editingPriceCurrency ? 'Update Price' : 'Add Price'}
                      </button>
                    </div>

                    <p className="text-2xs text-slate-400 leading-relaxed">
                      Tip: Enter <strong>Cost</strong> + <strong>Margin %</strong> and Selling price calculates automatically (or vice versa).
                    </p>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex justify-between items-center gap-3 py-6 mt-2">
          <button onClick={handleCancel}
            className="flex items-center gap-2 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium">
            <ArrowLeft size={14} /> Back to Products
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
            {saving
              ? <><Loader2 size={13} className="animate-spin" />Saving…</>
              : <><Check size={14} />{isEdit ? 'Update Product' : 'Save Product'}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
