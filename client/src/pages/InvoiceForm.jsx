import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Receipt, Package, MapPin, Landmark,
  MessageSquare, FileCheck, Tag, Plus, X, Check,
  ChevronDown, AlertTriangle, User, Loader2, Building2,
} from 'lucide-react';
import api from '../lib/api';
import { useDirty } from '../lib/dirtyContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'];
const STATUS_LABELS = {
  unpaid:    'Unpaid',
  partial:   'Partially Paid',
  paid:      'Paid',
  overdue:   'Overdue',
  cancelled: 'Cancelled',
};
const EMPTY_ITEM = { name: '', description: '', quantity: 1, unit_price: '', total: 0 };

// ── Shared style tokens ───────────────────────────────────────────────────────

const inputCls  = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';
const selectCls = `${inputCls} cursor-pointer`;
const smInput   = 'w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white transition-all placeholder:text-slate-400';

// ── Helpers ───────────────────────────────────────────────────────────────────

const today   = () => new Date().toISOString().split('T')[0];
const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };
const calcItem = it => ({ ...it, total: (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) });
const getSym   = (code, currencies) => currencies.find(c => c.code === code)?.symbol || '$';

const fmtMoney = (v, sym = '$') =>
  `${sym}${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Shared form primitives ────────────────────────────────────────────────────

function Label({ text, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {text}{required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
  );
}
function Field({ label, required, children, className = '' }) {
  return <div className={className}><Label text={label} required={required} />{children}</div>;
}

function SectionCard({ id, icon: Icon, title, iconColor = 'text-indigo-600', iconBg = 'bg-indigo-50', children }) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/60">
        <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon size={15} className={iconColor} />
        </div>
        <h2 className="font-bold text-slate-800 text-sm tracking-tight">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Client inline autocomplete ────────────────────────────────────────────────

function ClientSelect({ value, onChange, clients }) {
  const [query,   setQuery]   = useState('');
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef();

  const dn       = c => c.display_name || c.company || c.name || '';
  const selected = clients.find(c => c.id === value);

  useEffect(() => {
    if (!open) return;
    const fn = e => {
      if (!ref.current?.contains(e.target)) { setOpen(false); setFocused(false); }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const filtered = query.trim()
    ? clients.filter(c =>
        dn(c).toLowerCase().includes(query.toLowerCase()) ||
        (c.email  || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.phone  || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.customer_number || '').toLowerCase().includes(query.toLowerCase()))
    : clients;

  function handleChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value.trim() && value) onChange(null);
  }

  function handleFocus() {
    setFocused(true);
    setOpen(true);
    setQuery('');
  }

  function handleSelect(c) {
    onChange(c?.id ?? null);
    setQuery('');
    setOpen(false);
    setFocused(false);
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  }

  const inputValue = selected && !focused ? dn(selected) : query;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Type to search clients…"
          className={`${inputCls} pl-9 pr-8`}
        />
        {selected
          ? <button type="button" onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors">
              <X size={14} />
            </button>
          : <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        }
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
            <button type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(null)}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-50 italic border-b border-slate-100">
              — No client —
            </button>
            {filtered.slice(0, 20).map(c => (
              <button key={c.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(c)}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors ${value === c.id ? 'bg-indigo-50' : ''}`}>
                <div className={`font-semibold ${value === c.id ? 'text-indigo-700' : 'text-slate-800'}`}>{dn(c)}</div>
                {(c.email || c.phone) && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {[c.email, c.phone].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400 italic">No clients found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline product name autocomplete ─────────────────────────────────────────

// ── Smart price lookup ────────────────────────────────────────────────────────
function getSmartPrice(p, docCurrency, currencies) {
  try {
    const prices = JSON.parse(p.prices_json || '[]');
    if (prices.length === 0) return parseFloat(p.selling_price) || 0;
    const exact = prices.find(pr => pr.currency === docCurrency);
    if (exact) return parseFloat(exact.selling_price) || 0;
    const defCur   = currencies.find(c => c.is_default === 1);
    const defPrice = defCur ? prices.find(pr => pr.currency === defCur.code) : prices[0];
    if (defPrice) {
      const srcCur = defCur || currencies.find(c => c.code === defPrice.currency);
      const tgtCur = currencies.find(c => c.code === docCurrency);
      if (srcCur && tgtCur) {
        const pkr = parseFloat(defPrice.selling_price) * (parseFloat(srcCur.rate_to_pkr) || 1);
        return pkr / (parseFloat(tgtCur.rate_to_pkr) || 1);
      }
      return parseFloat(defPrice.selling_price) || 0;
    }
  } catch {}
  return parseFloat(p.selling_price) || 0;
}

function ProductNameInput({ value, products, onChange, onAddRow, currencies, docCurrency }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const fn = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const trimmed = (value || '').trim();
  const matches = trimmed
    ? products.filter(p =>
        p.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        (p.article_number || '').toLowerCase().includes(trimmed.toLowerCase()))
    : [];
  const showDropdown = open && trimmed.length > 0 && matches.length > 0;

  return (
    <div ref={ref} className="relative">
      <input
        value={value || ''}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if ((value || '').trim()) setOpen(true); }}
        placeholder="Product name…"
        className={`${smInput} font-semibold text-slate-800`}
      />
      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
            {matches.slice(0, 8).map(p => (
              <button key={p.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onAddRow(p); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors">
                <div className="font-semibold text-slate-800 text-sm">
                  {p.name}
                  {p.article_number && <span className="text-slate-400 font-normal text-xs"> · {p.article_number}</span>}
                </div>
                {p.description && <div className="text-xs text-slate-400 truncate mt-0.5">{p.description}</div>}
                {(() => {
                  const smartPrice = getSmartPrice(p, docCurrency, currencies);
                  const sym = currencies.find(c => c.code === docCurrency)?.symbol || docCurrency || '$';
                  return <div className="text-xs text-indigo-600 font-semibold mt-0.5">{sym}{smartPrice.toFixed(2)}</div>;
                })()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Line Items ────────────────────────────────────────────────────────────────

function LineItems({ items, onChange, products, sym, currencies, docCurrency }) {
  function update(idx, field, val) {
    onChange(items.map((it, i) => i === idx ? calcItem({ ...it, [field]: val }) : it));
  }
  function addRow()    { onChange([...items, { ...EMPTY_ITEM }]); }
  function remove(idx) { onChange(items.filter((_, i) => i !== idx)); }

  function pickProduct(idx, p) {
    const price = getSmartPrice(p, docCurrency, currencies);
    onChange(items.map((it, i) => i === idx ? calcItem({
      ...it,
      name:        p.name + (p.article_number ? ` · ${p.article_number}` : ''),
      description: p.description || '',
      unit_price:  parseFloat(price.toFixed(4)),
    }) : it));
  }

  return (
    <>
      {items.length > 0 && (
        <div className="grid grid-cols-[1fr_80px_140px_80px_36px] gap-3 px-1 mb-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Product & Description</p>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Qty</p>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Unit Price</p>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total</p>
          <div />
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="group border border-slate-200 rounded-xl bg-slate-50/40 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all">
            <div className="grid grid-cols-[1fr_80px_140px_80px_36px] gap-3 p-4 items-start">

              {/* Left: name autocomplete + description */}
              <div className="space-y-2">
                <ProductNameInput
                  value={item.name || ''}
                  products={products}
                  onChange={v => update(idx, 'name', v)}
                  onAddRow={p => pickProduct(idx, p)}
                  currencies={currencies}
                  docCurrency={docCurrency}
                />
                <textarea
                  value={item.description || ''}
                  onChange={e => update(idx, 'description', e.target.value)}
                  placeholder="Description — sizes, colours, specs, materials…"
                  rows={2}
                  className={`${smInput} resize-none text-slate-500 text-xs leading-relaxed`}
                />
              </div>

              {/* Qty */}
              <input type="number" min="0" step="any"
                value={item.quantity}
                onChange={e => update(idx, 'quantity', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white text-center transition-all"
              />

              {/* Unit Price */}
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">{sym}</span>
                <input type="number" min="0" step="any"
                  value={item.unit_price}
                  onChange={e => update(idx, 'unit_price', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg pl-6 pr-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white text-right transition-all"
                />
              </div>

              {/* Total */}
              <div className="flex items-center justify-end pt-1">
                <span className="font-bold text-slate-800 text-sm tabular-nums">
                  {sym}{(parseFloat(item.total) || 0).toFixed(2)}
                </span>
              </div>

              {/* Remove */}
              <div className="flex items-start justify-center pt-1">
                <button type="button" onClick={() => remove(idx)}
                  className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addRow}
        className="w-full mt-2 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/40 transition-all duration-150 font-medium">
        <Plus size={15} /> Add Line Item
      </button>
    </>
  );
}

// ── Totals panel ──────────────────────────────────────────────────────────────

function TotalsPanel({ items, taxRate, discount, shippingCost, sym }) {
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const disc     = parseFloat(discount)     || 0;
  const ship     = parseFloat(shippingCost) || 0;
  const taxable  = subtotal - disc;
  const taxAmt   = taxable * ((parseFloat(taxRate) || 0) / 100);
  const total    = taxable + taxAmt + ship;

  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-5 min-w-[260px] space-y-2.5">
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Subtotal</span>
        <span className="font-semibold text-slate-700">{fmtMoney(subtotal, sym)}</span>
      </div>
      {disc > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Discount</span>
          <span className="font-semibold text-rose-600">− {fmtMoney(disc, sym)}</span>
        </div>
      )}
      {parseFloat(taxRate) > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Tax ({taxRate}%)</span>
          <span className="font-semibold text-slate-700">+ {fmtMoney(taxAmt, sym)}</span>
        </div>
      )}
      {ship > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Shipping</span>
          <span className="font-semibold text-slate-700">+ {fmtMoney(ship, sym)}</span>
        </div>
      )}
      <div className="border-t border-indigo-200 pt-2.5 flex justify-between items-center">
        <span className="font-bold text-slate-800">Total</span>
        <span className="font-bold text-indigo-700 text-2xl tabular-nums">{fmtMoney(total, sym)}</span>
      </div>
    </div>
  );
}

// ── Main Form Page ────────────────────────────────────────────────────────────

export default function InvoiceForm() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEdit   = Boolean(id);
  const { setDirty } = useDirty();
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  // Data
  const [clients,      setClients]      = useState([]);
  const [products,     setProducts]     = useState([]);
  const [currencies,   setCurrencies]   = useState([]);
  const [companies,    setCompanies]    = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');

  // UI
  const [pageLoading, setPageLoading] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [saved,       setSaved]       = useState(false);

  // Form
  const [form, setForm] = useState({
    number:           '',
    subject:          '',
    client_id:        null,
    status:           'unpaid',
    tax_rate:         '',
    discount:         '',
    shipping_cost:    '',
    notes:            '',
    due_date:         addDays(today(), 30),
    currency:         'USD',
    company_id:       null,
    is_sampling:      false,
    shipping_name:    '',
    shipping_phone:   '',
    shipping_address: '',
    shipping_city:    '',
    shipping_country: '',
    bank_details:     '',
    customer_notes:   '',
    terms_conditions: '',
  });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [initialised, setInitialised] = useState(false);
  const clientEffectFiredRef = useRef(false);

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [cRes, pRes, curRes, setRes, coRes] = await Promise.all([
          api.get('/clients'),
          api.get('/products'),
          api.get('/currencies'),
          api.get('/settings'),
          api.get('/companies'),
        ]);
        setClients(cRes.data);
        setProducts(pRes.data);
        setCurrencies(curRes.data);
        setCompanies(coRes.data);

        const defaultCurr  = Array.isArray(curRes.data) ? curRes.data.find(c => c.is_default === 1) : null;
        const baseCurrCode = defaultCurr?.code || setRes.data.base_currency || 'USD';
        setBaseCurrency(baseCurrCode);

        const defCo    = Array.isArray(coRes.data) ? coRes.data.find(c => c.is_default) : null;
        const bankDef  = defCo?.bank_details || setRes.data.default_bank_details || '';
        const termsDef = setRes.data.default_terms || '';

        if (isEdit) {
          const { data: inv } = await api.get(`/invoices/${id}`);
          setForm({
            number:           inv.number           || '',
            subject:          inv.subject          || '',
            client_id:        inv.client_id        || null,
            status:           inv.status           || 'unpaid',
            tax_rate:         inv.tax_rate         || '',
            discount:         inv.discount         || '',
            shipping_cost:    inv.shipping_cost    || '',
            notes:            inv.notes            || '',
            due_date:         inv.due_date         || addDays(today(), 30),
            currency:         inv.currency         || baseCurrCode,
            company_id:       inv.company_id       || defCo?.id || null,
            is_sampling:      !!inv.is_sampling,
            shipping_name:    inv.shipping_name    || '',
            shipping_phone:   inv.shipping_phone   || '',
            shipping_address: inv.shipping_address || '',
            shipping_city:    inv.shipping_city    || '',
            shipping_country: inv.shipping_country || '',
            bank_details:     inv.bank_details     ?? bankDef,
            customer_notes:   inv.customer_notes   || '',
            terms_conditions: inv.terms_conditions ?? termsDef,
          });
          try {
            const parsed = JSON.parse(inv.items || '[]');
            setItems(parsed.length ? parsed.map(i => ({
              name:        i.name        ?? (i.description || ''),
              description: i.name        ? (i.description || '') : '',
              quantity:    i.quantity    ?? 1,
              unit_price:  i.unit_price  ?? 0,
              total:       i.total       ?? 0,
            })) : [{ ...EMPTY_ITEM }]);
          } catch { setItems([{ ...EMPTY_ITEM }]); }
        } else {
          // Pre-fill from "New Transaction" button on Clients page
          const preClient = location.state?.client ?? null;
          const clientCurrency = preClient?.currency;
          const currencyMatch  = clientCurrency && curRes.data.some(c => c.code === clientCurrency);

          setForm(f => ({
            ...f,
            currency:         currencyMatch ? clientCurrency : baseCurrCode,
            company_id:       defCo?.id ?? null,
            bank_details:     bankDef,
            terms_conditions: termsDef,
            client_id:        preClient?.id ?? null,
            ...(preClient ? {
              shipping_name:    preClient.shipping_receiver_name  || preClient.display_name || preClient.name || '',
              shipping_phone:   preClient.shipping_receiver_phone || preClient.phone || '',
              shipping_address: preClient.shipping_address || preClient.address || '',
              shipping_city:    preClient.shipping_city    || preClient.city    || '',
              shipping_country: preClient.shipping_country || preClient.country || '',
            } : {}),
          }));
        }
      } catch (e) {
        setError('Failed to load data. Please refresh.');
      } finally {
        setPageLoading(false);
        setInitialised(true);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Mark dirty when form/items change (only after initial load)
  useEffect(() => {
    if (!initialised) return;
    setDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, items]);

  // Clear dirty on unmount
  useEffect(() => {
    return () => setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn on browser refresh / close
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Auto-fill currency + shipping from client (user-initiated changes only) ──

  useEffect(() => {
    if (!clientEffectFiredRef.current) {
      clientEffectFiredRef.current = true;
      return;
    }
    if (!form.client_id) return;
    const client = clients.find(c => c.id === form.client_id);
    if (!client) return;

    setForm(f => {
      const clientCurrency = client.currency || '';
      const currencyExists = currencies.some(c => c.code === clientCurrency);
      const newCurrency    = clientCurrency && currencyExists ? clientCurrency : f.currency;

      return {
        ...f,
        currency:         newCurrency,
        shipping_name:    client.shipping_receiver_name  || client.display_name || client.name || '',
        shipping_phone:   client.shipping_receiver_phone || client.phone || '',
        shipping_address: client.shipping_address || client.address || '',
        shipping_city:    client.shipping_city    || client.city    || '',
        shipping_country: client.shipping_country || client.country || '',
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.client_id]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const sym        = getSym(form.currency, currencies);
  const selectedCo = companies.find(c => c.id === form.company_id) ?? null;

  const buildPayload = () => ({
    ...form,
    is_sampling: form.is_sampling ? 1 : 0,
    items,
  });

  // ── Submit ──────────────────────────────────────────────────────────────────

  function safeBack() {
    setDirty(false);
    navigate('/invoices');
  }

  async function handleSubmit() {
    if (items.every(i => !(i.name || '').trim() && !(i.description || '').trim())) {
      setError('Add at least one line item before saving.'); return;
    }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await api.put(`/invoices/${id}`, buildPayload());
      } else {
        await api.post('/invoices', buildPayload());
      }
      setDirty(false);
      navigate('/invoices');
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  // ── Page loading ────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">{isEdit ? 'Loading invoice…' : 'Preparing form…'}</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Unsaved changes modal ── */}
      {leaveConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-modal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Unsaved Changes</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your work will be lost</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              You have unsaved changes. If you go back now, everything you've added will be lost.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setLeaveConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                Stay & Save
              </button>
              <button onClick={safeBack}
                className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors font-medium">
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky top bar ── */}
      <div className="-mx-8 -mt-8 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between gap-4">

        {/* Left: back + title */}
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={safeBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0 font-medium">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Receipt size={15} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-base truncate">
                {isEdit ? 'Edit Invoice' : 'New Invoice'}
              </h1>
              {isEdit && form.number && (
                <p className="text-xs font-mono text-indigo-600 mt-0.5">{form.number}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {error && (
            <p className="text-xs text-rose-600 max-w-[200px] truncate">{error}</p>
          )}
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
            {saving
              ? <><Loader2 size={13} className="animate-spin" />Saving…</>
              : <><Check size={14} />{isEdit ? 'Update Invoice' : 'Create Invoice'}</>
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

      {/* ── Form sections ── */}
      <div className="mt-6 space-y-5">

        {/* ── 0. Company Selector ── */}
        {companies.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Issuing Company</p>
            <div className="flex gap-2 flex-wrap">
              {companies.map(co => {
                const sel = form.company_id === co.id;
                return (
                  <button key={co.id} type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      company_id:   co.id,
                      bank_details: co.bank_details != null ? co.bank_details : f.bank_details,
                    }))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      sel ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}>
                    <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                      {co.logo
                        ? <img src={co.logo} alt={co.name} className="w-full h-full object-contain p-1" />
                        : <span className="text-xs font-bold text-slate-400">{co.name.slice(0,2).toUpperCase()}</span>}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold leading-tight ${sel ? 'text-indigo-700' : 'text-slate-800'}`}>{co.name}</p>
                      {(co.city || co.country) && (
                        <p className="text-xs text-slate-400 mt-0.5">{[co.city, co.country].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                    {sel && <Check size={14} className="text-indigo-600 ml-1 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* ── Selected company preview ── */}
            {selectedCo && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-5">

                {/* Logo */}
                <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                  {selectedCo.logo
                    ? <img src={selectedCo.logo} alt={selectedCo.name} className="w-full h-full object-contain p-1.5" />
                    : <span className="text-lg font-bold text-slate-300">{selectedCo.name.slice(0,2).toUpperCase()}</span>}
                </div>

                {/* Name + address + contact */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm leading-tight">{selectedCo.name}</p>
                  {selectedCo.address && (
                    <p className="text-xs text-slate-500 mt-1 leading-snug">{selectedCo.address}</p>
                  )}
                  {(selectedCo.city || selectedCo.country) && (
                    <p className="text-xs text-slate-500">{[selectedCo.city, selectedCo.country].filter(Boolean).join(', ')}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {selectedCo.phone      && <p className="text-xs text-slate-500">{selectedCo.phone}</p>}
                    {selectedCo.email      && <p className="text-xs text-slate-500">{selectedCo.email}</p>}
                    {selectedCo.website    && <p className="text-xs text-slate-400">{selectedCo.website}</p>}
                    {selectedCo.tax_number && <p className="text-xs text-slate-400">Tax: {selectedCo.tax_number}</p>}
                  </div>
                </div>

                {/* Bank details */}
                {selectedCo.bank_details && (
                  <div className="border-l border-slate-100 pl-5 min-w-[180px] max-w-xs flex-shrink-0">
                    <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Bank Details</p>
                    <p className="text-xs font-mono text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedCo.bank_details}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 1. Invoice Details ── */}
        <SectionCard id="sec-details" icon={Receipt} title="Invoice Details">
          <div className="space-y-4">

            {/* Subject */}
            <Field label="Subject">
              <div className="relative">
                <Tag size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={form.subject} onChange={e => set('subject', e.target.value)}
                  className={`${inputCls} pl-9 font-medium`}
                  placeholder="e.g. BJJ GI Black 450 GSM — Order October 2026" />
              </div>
            </Field>

            {/* Client | Currency | Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Client">
                <ClientSelect value={form.client_id} onChange={v => set('client_id', v)} clients={clients} />
              </Field>
              <Field label={`Invoice Currency${form.currency === baseCurrency ? ' (Default)' : ''}`}>
                <select value={form.currency} onChange={e => set('currency', e.target.value)} className={`${selectCls} font-medium`}>
                  {[
                    ...currencies.filter(c => c.code === baseCurrency),
                    ...currencies.filter(c => c.code !== baseCurrency),
                  ].map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code}{c.symbol ? ` (${c.symbol})` : ''} — {c.name}{c.code === baseCurrency ? ' ★ Default' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due Date">
                <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={inputCls} />
              </Field>
            </div>

            {/* Number | Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Field label="Invoice Number">
                  <input value={form.number} onChange={e => set('number', e.target.value)}
                    className={`${inputCls} font-mono`}
                    placeholder={isEdit ? '' : 'Leave blank to auto-generate (e.g. INV-2026-0001)'} />
                </Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. Line Items ── */}
        <SectionCard id="sec-items" icon={Package} title="Line Items" iconColor="text-violet-600" iconBg="bg-violet-50">

          {/* Sampling toggle */}
          <div className={`flex items-center justify-between mb-5 pb-4 border-b ${form.is_sampling ? 'border-violet-200 bg-violet-50/60 -mx-6 px-6 pt-3 -mt-3 rounded-t-xl' : 'border-slate-100'}`}>
            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => {
                  const factor = form.is_sampling ? 0.5 : 2;
                  setItems(prev => prev.map(it => {
                    const newPrice = (parseFloat(it.unit_price) || 0) * factor;
                    return { ...it, unit_price: parseFloat(newPrice.toFixed(4)), total: (parseFloat(it.quantity) || 0) * newPrice };
                  }));
                  set('is_sampling', !form.is_sampling);
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 ${form.is_sampling ? 'bg-violet-600' : 'bg-slate-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${form.is_sampling ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <div>
                <span className="text-sm font-semibold text-slate-700">Sampling Mode</span>
                {form.is_sampling && (
                  <span className="ml-2 inline-flex items-center text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">2× prices active</span>
                )}
              </div>
            </div>
            {form.is_sampling && (
              <p className="text-xs text-violet-500 font-medium">All unit prices are doubled for sampling</p>
            )}
          </div>

          <LineItems
            items={items}
            onChange={setItems}
            products={products}
            sym={sym}
            currencies={currencies}
            docCurrency={form.currency}
          />
        </SectionCard>

        {/* ── 3. Pricing ── */}
        <SectionCard id="sec-pricing" icon={FileCheck} title="Pricing Summary" iconColor="text-emerald-600" iconBg="bg-emerald-50">
          <div className="flex gap-8 items-start justify-between flex-wrap">
            <div className="grid grid-cols-3 gap-4 flex-1 min-w-[280px] max-w-md">
              <Field label={`Discount (${sym})`}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">{sym}</span>
                  <input type="number" min="0" step="any" value={form.discount}
                    onChange={e => set('discount', e.target.value)}
                    className={`${inputCls} pl-6`} placeholder="0.00" />
                </div>
              </Field>
              <Field label="Tax Rate (%)">
                <div className="relative">
                  <input type="number" min="0" max="100" step="any" value={form.tax_rate}
                    onChange={e => set('tax_rate', e.target.value)}
                    className={`${inputCls} pr-7`} placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                </div>
              </Field>
              <Field label={`Shipping (${sym})`}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">{sym}</span>
                  <input type="number" min="0" step="any" value={form.shipping_cost}
                    onChange={e => set('shipping_cost', e.target.value)}
                    className={`${inputCls} pl-6`} placeholder="0.00" />
                </div>
              </Field>
            </div>
            <TotalsPanel items={items} taxRate={form.tax_rate} discount={form.discount} shippingCost={form.shipping_cost} sym={sym} />
          </div>
        </SectionCard>

        {/* ── 4. Shipping Address ── */}
        <SectionCard id="sec-shipping" icon={MapPin} title="Shipping Address" iconColor="text-amber-600" iconBg="bg-amber-50">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Receiver Name">
                <input value={form.shipping_name} onChange={e => set('shipping_name', e.target.value)}
                  className={inputCls} placeholder="Full name or company…" />
              </Field>
              <Field label="Phone">
                <input value={form.shipping_phone} onChange={e => set('shipping_phone', e.target.value)}
                  className={inputCls} placeholder="+1 234 567 8900" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Street Address">
                <textarea rows={2} value={form.shipping_address} onChange={e => set('shipping_address', e.target.value)}
                  className={`${inputCls} resize-none`} placeholder="Building, Street, Area…" />
              </Field>
              <Field label="City">
                <input value={form.shipping_city} onChange={e => set('shipping_city', e.target.value)}
                  className={inputCls} placeholder="City…" />
              </Field>
            </div>
            <Field label="Country">
              <input value={form.shipping_country} onChange={e => set('shipping_country', e.target.value)}
                className={inputCls} placeholder="e.g. United Arab Emirates" />
            </Field>
          </div>
        </SectionCard>

        {/* ── 5. Bank Details ── */}
        <SectionCard id="sec-bank" icon={Landmark} title="Bank Details" iconColor="text-blue-600" iconBg="bg-blue-50">
          <textarea rows={7} value={form.bank_details} onChange={e => set('bank_details', e.target.value)}
            className={`${inputCls} resize-none font-mono text-xs leading-6`}
            placeholder={'Bank Name: \nAccount Title: \nAccount Number: \nIBAN: \nSwift Code: \nBranch: '} />
        </SectionCard>

        {/* ── 6. Customer Notes ── */}
        <SectionCard id="sec-notes" icon={MessageSquare} title="Customer Notes" iconColor="text-teal-600" iconBg="bg-teal-50">
          <textarea rows={4} value={form.customer_notes} onChange={e => set('customer_notes', e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder="Any message, instructions or special requirements for the customer…" />
        </SectionCard>

        {/* ── 7. Terms & Conditions ── */}
        <SectionCard id="sec-terms" icon={FileCheck} title="Terms & Conditions" iconColor="text-rose-600" iconBg="bg-rose-50">
          <textarea rows={8} value={form.terms_conditions} onChange={e => set('terms_conditions', e.target.value)}
            className={`${inputCls} resize-none leading-relaxed`}
            placeholder={"Payment Terms: 50% advance required to start production.\nDelivery will take 5-7 working days after production.\nThis invoice is due within 30 days."} />
        </SectionCard>

        {/* ── Internal Notes ── */}
        <SectionCard id="sec-internal" icon={FileCheck} title="Internal Notes" iconColor="text-slate-500" iconBg="bg-slate-100">
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder="Private notes — not shown on the invoice…" />
        </SectionCard>

        {/* ── Bottom actions ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 py-4 border-t border-slate-200">
          <button onClick={safeBack}
            className="flex items-center gap-2 px-4 py-2.5 text-sm border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium">
            <ArrowLeft size={14} /> Back to Invoices
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-all font-semibold shadow-sm shadow-indigo-200">
            {saving
              ? 'Saving…'
              : <><Check size={14} />{isEdit ? 'Update Invoice' : 'Create Invoice'}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
