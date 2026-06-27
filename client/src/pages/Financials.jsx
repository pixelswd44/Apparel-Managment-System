import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import {
  TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, RefreshCw, Wallet, Users,
  Receipt, Store, Clock, Package, Plus, Pencil, Trash2, X,
  Landmark, HandCoins, CheckCircle2, AlertCircle, ChevronDown,
} from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker';

// ── Currency Selector (same pattern as Overview) ───────────────────────────
const CURRENCY_SYMBOLS = {
  USD:'$', EUR:'€', GBP:'£', PKR:'₨', AED:'د.إ', SAR:'ر.س', INR:'₹',
};
const symFor = code => CURRENCY_SYMBOLS[(code||'').toUpperCase()] || `${code} `;

function CurrencySelector({ selected, currencies, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const current = currencies.find(c => c.code === selected);
  const getSymbol = c => c.symbol || symFor(c.code);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-all shadow-sm">
        <span className="text-base leading-none">{current ? getSymbol(current).trim() : selected}</span>
        <span>{selected}</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-y-auto min-w-[180px]" style={{maxHeight:240}}>
          {currencies.map(c => (
            <button key={c.code} onClick={() => { onChange(c.code); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                c.code === selected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
              }`}>
              <span>{c.code}</span>
              <span className="text-slate-400 text-xs">{getSymbol(c).trim()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Raw PKR formatter (fallback only)
const pkrFmt = n => `₨${Number(n || 0).toLocaleString()}`;

// Build a PKR → baseCurrency display formatter (same pattern as Projects.jsx)
function makeFormatter(currencies, baseCurrCode) {
  if (!baseCurrCode || baseCurrCode === 'PKR') return pkrFmt;
  const base = (currencies || []).find(c => c.code === baseCurrCode);
  if (!base || !(parseFloat(base.rate_to_pkr) > 0)) return pkrFmt;
  const sym  = base.symbol || baseCurrCode;
  const rate = parseFloat(base.rate_to_pkr);
  return v => `${sym}${((parseFloat(v) || 0) / rate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Compact formatter: 11,704,779 → "₨11.7M", 496,129 → "₨496K"
function makeCompactFormatter(currencies, baseCurrCode) {
  const getSym = () => {
    if (!baseCurrCode || baseCurrCode === 'PKR') return '₨';
    const base = (currencies || []).find(c => c.code === baseCurrCode);
    return base?.symbol || baseCurrCode;
  };
  const convert = v => {
    const raw = parseFloat(v) || 0;
    if (!baseCurrCode || baseCurrCode === 'PKR') return Math.abs(raw);
    const base = (currencies || []).find(c => c.code === baseCurrCode);
    const rate = parseFloat(base?.rate_to_pkr);
    return rate > 0 ? Math.abs(raw) / rate : Math.abs(raw);
  };
  return v => {
    const n = convert(v);
    const sym = getSym();
    if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${sym}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };
}

// Also build a formatter for original-currency amounts (non-PKR payments)
function makeOrigFormatter(currencies, currCode) {
  const c = (currencies || []).find(x => x.code === currCode);
  const sym = c?.symbol || currCode || '';
  return v => `${sym}${Number(v || 0).toLocaleString()}`;
}
const pct = (a, b) => b === 0 ? 0 : ((a / b) * 100).toFixed(1);
const monthShort = m => {
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1, 1).toLocaleString('default', { month: 'short' });
};
const fmtDate = d => d ? new Date(d.includes('T') ? d : d + 'T00:00:00')
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const TYPE_BADGE = {
  income:   { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Income',   Icon: ArrowUpRight },
  expense:  { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'Expense',  Icon: ArrowDownRight },
  vendor:   { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Vendor',   Icon: Store },
  salary:   { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Salary',   Icon: Users },
  shipping: { bg: 'bg-sky-100',     text: 'text-sky-700',     label: 'Shipping', Icon: Receipt },
};

// ── Mini Bar Chart ─────────────────────────────────────────────────────────
function BarChart({ data, fmt = pkrFmt }) {
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const maxOut = Math.max(...data.map(d => d.totalOut), 1);
  const mx = Math.max(maxRev, maxOut);

  return (
    <div className="flex items-end gap-1.5 h-28 mt-4">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex gap-0.5 items-end" style={{ height: 96 }}>
            <div
              className="flex-1 rounded-t bg-indigo-400 transition-all"
              style={{ height: `${mx > 0 ? (d.revenue / mx) * 100 : 0}%`, minHeight: d.revenue > 0 ? 2 : 0 }}
              title={`Revenue: ${fmt(d.revenue)}`}
            />
            <div
              className="flex-1 rounded-t bg-rose-300 transition-all"
              style={{ height: `${mx > 0 ? (d.totalOut / mx) * 100 : 0}%`, minHeight: d.totalOut > 0 ? 2 : 0 }}
              title={`Expenses: ${fmt(d.totalOut)}`}
            />
          </div>
          <span className="text-[9px] text-slate-400">{monthShort(d.month)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Summary Card ───────────────────────────────────────────────────────────
function SummaryCard({ label, value, full, sub, Icon, accent, negative }) {
  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-5 shadow-sm border ${negative ? 'border-rose-200' : 'border-slate-100'}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 ${accent || 'text-slate-400'}`}>
        <Icon size={13} /> {label}
      </div>
      <p className={`text-2xl sm:text-3xl font-black tracking-tight leading-none ${negative ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
      {full && full !== value && <p className={`text-xs mt-1 font-medium ${negative ? 'text-rose-400' : 'text-slate-400'}`}>{full}</p>}
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Capital Inline Form Page ───────────────────────────────────────────────
function CapitalForm({ type, item, onClose, onSave }) {
  const isInv = type === 'investment';
  const [form, setForm] = useState(item ? { ...item } : {
    investor_name: '', lender_name: '', amount: '', date: new Date().toISOString().split('T')[0],
    equity_pct: '', interest_rate: '', due_date: '', paid_amount: '', notes: '', status: 'active',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const inputCls = 'mt-1 w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1';

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = isInv ? '/financials/investments' : '/financials/loans';
      const res = item
        ? await api.put(`${endpoint}/${item.id}`, form)
        : await api.post(endpoint, form);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="animate-page">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors">
          <X size={16} /> Cancel
        </button>
        <span className="text-slate-300">/</span>
        <h2 className="font-bold text-slate-900 text-lg">
          {item ? 'Edit' : 'New'} {isInv ? 'Investment' : 'Loan'}
        </h2>
      </div>

      <form onSubmit={submit}>
        <div className="max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
          <div>
            <label className={labelCls}>{isInv ? 'Investor Name' : 'Lender Name'} *</label>
            <input required value={isInv ? form.investor_name : form.lender_name}
              onChange={e => set(isInv ? 'investor_name' : 'lender_name', e.target.value)}
              className={inputCls}
              placeholder={isInv ? 'e.g. Ahmed Khan' : 'e.g. Bank Al-Habib'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Amount (PKR) *</label>
              <input required type="number" min="0" step="any" value={form.amount}
                onChange={e => set('amount', e.target.value)} className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input required type="date" value={form.date}
                onChange={e => set('date', e.target.value)} className={inputCls} />
            </div>
          </div>

          {isInv ? (
            <div>
              <label className={labelCls}>Equity % (optional)</label>
              <input type="number" min="0" max="100" step="any" value={form.equity_pct}
                onChange={e => set('equity_pct', e.target.value)} className={inputCls} placeholder="0" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Interest Rate %</label>
                <input type="number" min="0" step="any" value={form.interest_rate}
                  onChange={e => set('interest_rate', e.target.value)} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" value={form.due_date}
                  onChange={e => set('due_date', e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {!isInv && (
            <div>
              <label className={labelCls}>Amount Paid Back (PKR)</label>
              <input type="number" min="0" step="any" value={form.paid_amount}
                onChange={e => set('paid_amount', e.target.value)} className={inputCls} placeholder="0" />
            </div>
          )}

          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
              {isInv
                ? [['active','Active'], ['exited','Exited']].map(([v,l]) => <option key={v} value={v}>{l}</option>)
                : [['active','Active'], ['paid','Paid']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className={inputCls + ' resize-none'} placeholder="Optional notes…" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : item ? 'Save Changes' : `Add ${isInv ? 'Investment' : 'Loan'}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Financials() {
  const [tab, setTab] = useState('pl');
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('PKR');
  const [loading, setLoading] = useState(true);
  const [txType, setTxType] = useState('all');
  const [periodRange, setPeriodRange] = useState({ from: null, to: null, label: 'All Time' });

  const [selectedCurrency, setSelectedCurrency] = useState(
    () => localStorage.getItem('financials_currency') || null
  );

  const [investments, setInvestments] = useState([]);
  const [loans, setLoans] = useState([]);
  const [capitalModal, setCapitalModal] = useState(null); // { type: 'investment'|'loan', item?: {} }
  const [capitalLoading, setCapitalLoading] = useState(false);

  const loadCapital = useCallback(async () => {
    setCapitalLoading(true);
    try {
      const [inv, ln] = await Promise.all([api.get('/financials/investments'), api.get('/financials/loans')]);
      setInvestments(inv.data);
      setLoans(ln.data);
    } finally { setCapitalLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'investments' || tab === 'loans') loadCapital(); }, [tab, loadCapital]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams = periodRange.from ? { from: periodRange.from, to: periodRange.to } : {};
      const [s, m, t, c, cur, settings] = await Promise.all([
        api.get('/financials/summary', { params: dateParams }),
        api.get('/financials/monthly',  { params: dateParams }),
        api.get('/financials/transactions', { params: { limit: 40, ...dateParams } }),
        api.get('/financials/expenses-by-category', { params: dateParams }),
        api.get('/currencies'),
        api.get('/settings'),
      ]);
      setSummary(s.data);
      setMonthly(m.data);
      setTransactions(t.data);
      setByCategory(c.data);
      const currList = Array.isArray(cur.data) ? cur.data : [];
      setCurrencies(currList);
      const base = (settings.data && settings.data.base_currency) || 'PKR';
      setBaseCurrency(base);
      setSelectedCurrency(prev => prev || base);
    } finally { setLoading(false); }
  }, [periodRange.from, periodRange.to]);

  useEffect(() => { load(); }, [load]);

  // Reload whenever the browser tab regains focus or the page becomes visible
  // This ensures Financials always reflects changes made in other modules
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onFocus   = () => load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
      <RefreshCw size={16} className="animate-spin-slow" /> Loading financials…
    </div>
  );

  const activeCurrency = selectedCurrency || baseCurrency;
  const handleCurrencyChange = code => {
    setSelectedCurrency(code);
    localStorage.setItem('financials_currency', code);
  };

  // Active-currency formatters
  const fmt  = makeFormatter(currencies, activeCurrency);        // full: ₨11,704,779
  const fmtC = makeCompactFormatter(currencies, activeCurrency); // compact: ₨11.7M
  const baseSymbol = baseCurrency === 'PKR' ? '₨'
    : (currencies.find(c => c.code === baseCurrency)?.symbol || baseCurrency);

  const {
    invoiceRevenue = 0, outstanding = 0,
    businessExpenses = 0, salariesPaid = 0,
    totalProjectsPaid = 0, totalProjectsExpense = 0,
    totalExpenses = 0, outOfPocket = 0, projectedPL = 0,
    netProfit = 0, revenueByCC = {},
  } = summary || {};

  // Build a readable sub-line like "AED 102,660 · USD 1,200"
  const revenueCCSub = Object.entries(revenueByCC)
    .filter(([, v]) => v > 0)
    .map(([cc, v]) => {
      const sym = currencies.find(c => c.code === cc)?.symbol || cc;
      return `${sym}${Number(v).toLocaleString()}`;
    })
    .join(' · ');

  // Last vs prev month trend
  const last2 = monthly.slice(-2);
  const revenueChange = last2.length === 2 && last2[0].revenue > 0
    ? (((last2[1].revenue - last2[0].revenue) / last2[0].revenue) * 100).toFixed(1)
    : null;

  const filteredTx = txType === 'all' ? transactions : transactions.filter(t => t.type === txType);
  const totalCatExpenses = byCategory.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);

  const pkr = n => `₨${Number(n || 0).toLocaleString()}`;

  const deleteCapital = async (type, id) => {
    if (!confirm('Delete this record?')) return;
    await api.delete(`/financials/${type}/${id}`);
    loadCapital();
  };

  // Render inline form page when adding/editing
  if (capitalModal) {
    return (
      <CapitalForm
        type={capitalModal.type}
        item={capitalModal.item}
        onClose={() => setCapitalModal(null)}
        onSave={() => { loadCapital(); setCapitalModal(null); }}
      />
    );
  }

  return (
    <div className="animate-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financials</h1>
          <p className="text-sm text-slate-500 mt-0.5">P&L, investments &amp; loans</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currencies.length > 0 && (
            <CurrencySelector
              selected={activeCurrency}
              currencies={currencies}
              onChange={handleCurrencyChange}
            />
          )}
          <button onClick={tab === 'pl' ? load : loadCapital} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl text-slate-600 hover:border-indigo-300 font-medium">
            <RefreshCw size={14} />
          </button>
          {(tab === 'investments' || tab === 'loans') && (
            <button onClick={() => setCapitalModal({ type: tab === 'investments' ? 'investment' : 'loan' })}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New {tab === 'investments' ? 'Investment' : 'Loan'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 overflow-x-auto scrollbar-hide">
        {[
          { key: 'pl',          label: 'P&L Overview' },
          { key: 'investments', label: 'Investments' },
          { key: 'loans',       label: 'Loans' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Investments Tab ── */}
      {tab === 'investments' && (() => {
        const total = investments.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
        const active = investments.filter(i => i.status === 'active');
        return (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Landmark size={13} /> Total Raised</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 break-all">{fmt(total)}</p>
                <p className="text-xs text-slate-400 mt-1">{investments.length} investment{investments.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 size={13} /> Active</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">{active.length}</p>
                <p className="text-xs text-slate-400 mt-1">{fmt(active.reduce((s,i) => s + parseFloat(i.amount||0), 0))}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Exited</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">{investments.length - active.length}</p>
                <p className="text-xs text-slate-400 mt-1">investors</p>
              </div>
            </div>
            {capitalLoading ? (
              <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : investments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
                <Landmark size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold">No investments yet</p>
                <p className="text-slate-400 text-sm mt-1">Click "New Investment" to add one</p>
              </div>
            ) : (
              <div className="space-y-3">
                {investments.map(inv => (
                  <div key={inv.id} className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-slate-900">{inv.investor_name}</p>
                        <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${inv.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {inv.status}
                        </span>
                        {parseFloat(inv.equity_pct) > 0 && (
                          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{inv.equity_pct}% equity</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{inv.date}{inv.notes ? ` · ${inv.notes}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-base font-black text-indigo-700 break-all text-right">{fmt(inv.amount)}</p>
                      <button onClick={() => setCapitalModal({ type: 'investment', item: inv })}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteCapital('investments', inv.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Loans Tab ── */}
      {tab === 'loans' && (() => {
        const totalBorrowed = loans.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const totalPaid     = loans.reduce((s, l) => s + parseFloat(l.paid_amount || 0), 0);
        const outstanding   = totalBorrowed - totalPaid;
        const activeLoans   = loans.filter(l => l.status === 'active');
        return (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><HandCoins size={13} /> Total Borrowed</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900 break-all">{fmt(totalBorrowed)}</p>
                <p className="text-xs text-slate-400 mt-1">{loans.length} loan{loans.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white border border-rose-100 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlertCircle size={13} /> Outstanding</p>
                <p className="text-xl sm:text-2xl font-bold text-rose-600 break-all">{fmt(outstanding)}</p>
                <p className="text-xs text-slate-400 mt-1">{activeLoans.length} active</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 size={13} /> Paid Back</p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-600 break-all">{fmt(totalPaid)}</p>
                <p className="text-xs text-slate-400 mt-1">{loans.length - activeLoans.length} fully paid</p>
              </div>
            </div>
            {capitalLoading ? (
              <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : loans.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
                <HandCoins size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold">No loans recorded</p>
                <p className="text-slate-400 text-sm mt-1">Click "New Loan" to add one</p>
              </div>
            ) : (
              <div className="space-y-3">
                {loans.map(ln => {
                  const remaining = parseFloat(ln.amount || 0) - parseFloat(ln.paid_amount || 0);
                  const pct = parseFloat(ln.amount) > 0 ? Math.min(100, (parseFloat(ln.paid_amount || 0) / parseFloat(ln.amount)) * 100) : 0;
                  return (
                    <div key={ln.id} className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-semibold text-slate-900">{ln.lender_name}</p>
                            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${ln.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {ln.status}
                            </span>
                            {parseFloat(ln.interest_rate) > 0 && (
                              <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{ln.interest_rate}% interest</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            Borrowed {ln.date}{ln.due_date ? ` · Due ${ln.due_date}` : ''}{ln.notes ? ` · ${ln.notes}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-base font-black text-rose-600 break-all">{fmt(ln.amount)}</p>
                            <p className="text-xs text-slate-400">Remaining: {fmt(remaining)}</p>
                          </div>
                          <button onClick={() => setCapitalModal({ type: 'loan', item: ln })}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteCapital('loans', ln.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-2xs text-slate-400">Paid: {fmt(ln.paid_amount)}</span>
                        <span className="text-2xs text-slate-400">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── P&L Tab ── */}
      {tab === 'pl' && <>
      {/* Period Picker */}
      <div className="mb-6">
        <PeriodPicker onChange={range => { setPeriodRange(range); }} />
      </div>

      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <SummaryCard
          label="Total Received"
          value={fmtC(invoiceRevenue)}
          full={fmt(invoiceRevenue)}
          sub={revenueCCSub || 'Invoice payments collected'}
          Icon={TrendingUp}
          accent="text-emerald-500"
        />
        <SummaryCard
          label="Outstanding"
          value={fmtC(outstanding)}
          full={fmt(outstanding)}
          sub="Due from clients — not yet received"
          Icon={Clock}
          accent="text-amber-500"
        />
        <SummaryCard
          label={outOfPocket > 0 ? 'Out of Pocket' : 'Cash Surplus'}
          value={fmtC(Math.abs(outOfPocket))}
          full={fmt(Math.abs(outOfPocket))}
          sub={outOfPocket > 0 ? 'Cash paid exceeds cash received' : 'Received covers all paid costs'}
          Icon={outOfPocket > 0 ? TrendingDown : TrendingUp}
          accent={outOfPocket > 0 ? 'text-rose-500' : 'text-emerald-500'}
          negative={outOfPocket > 0}
        />
        <SummaryCard
          label={projectedPL >= 0 ? 'Projected Profit' : 'Projected Loss'}
          value={fmtC(Math.abs(projectedPL))}
          full={fmt(Math.abs(projectedPL))}
          sub={projectedPL >= 0 ? '(Rcvd + Outstanding) − Full Project Costs' : 'Full costs exceed total revenue'}
          Icon={projectedPL >= 0 ? TrendingUp : TrendingDown}
          accent={projectedPL >= 0 ? 'text-indigo-500' : 'text-rose-500'}
          negative={projectedPL < 0}
        />
      </div>

      {/* KPI Cards — Row 2: project costs + wallet */}
      {(() => {
        const inWallet = invoiceRevenue - totalExpenses;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">

            {/* Total Paid (Projects) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-rose-100">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 text-rose-500">
                <Package size={13} /> Total Paid (Projects)
              </div>
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">{fmtC(totalProjectsPaid)}</p>
              <p className="text-xs text-slate-400 mt-1">{fmt(totalProjectsPaid)}</p>
              <p className="text-xs text-slate-400 mt-0.5">All project costs paid out</p>
            </div>

            {/* Business Expenses + Salaries */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-orange-100">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 text-orange-500">
                <Receipt size={13} /> Other Expenses
              </div>
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">{fmtC(businessExpenses + salariesPaid)}</p>
              <p className="text-xs text-slate-400 mt-1">{fmt(businessExpenses + salariesPaid)}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Business {fmtC(businessExpenses)} · Salaries {fmtC(salariesPaid)}
              </p>
            </div>

            {/* In Wallet */}
            <div className={`rounded-2xl p-4 sm:p-5 shadow-sm border-2 ${inWallet >= 0 ? 'bg-cyan-50 border-cyan-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 ${inWallet >= 0 ? 'text-cyan-600' : 'text-rose-500'}`}>
                <Wallet size={13} /> In Wallet
              </div>
              <p className={`text-2xl sm:text-3xl font-black tracking-tight mb-1 ${inWallet >= 0 ? 'text-cyan-700' : 'text-rose-600'}`}>
                {inWallet >= 0 ? '' : '−'}{fmtC(Math.abs(inWallet))}
              </p>
              <p className={`text-xs mb-2 ${inWallet >= 0 ? 'text-cyan-500' : 'text-rose-400'}`}>{inWallet >= 0 ? '' : '−'}{fmt(Math.abs(inWallet))}</p>
              <div className="space-y-1 border-t border-cyan-200 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">+ Received</span>
                  <span className="text-emerald-600 font-medium">{fmtC(invoiceRevenue)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">− Projects paid</span>
                  <span className="text-rose-500">{fmtC(totalProjectsPaid)}</span>
                </div>
                {businessExpenses > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">− Business exp.</span>
                    <span className="text-rose-500">{fmtC(businessExpenses)}</span>
                  </div>
                )}
                {salariesPaid > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">− Salaries</span>
                    <span className="text-rose-500">{fmtC(salariesPaid)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}


      {/* Charts + P&L row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Monthly chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-slate-800">
              Revenue vs Expenses — {periodRange.from ? periodRange.label : 'Last 12 Months'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-indigo-400 inline-block" /> Revenue</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-rose-300 inline-block" /> Expenses</span>
          </div>
          <BarChart data={monthly} fmt={fmt} />

          {/* Monthly table strip */}
          <div className="mt-3 border-t border-slate-100 pt-3 overflow-x-auto">
            <table className="w-full text-xs min-w-[280px]">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left pb-1.5 font-medium">Month</th>
                  <th className="text-right pb-1.5 font-medium">Revenue</th>
                  <th className="text-right pb-1.5 font-medium">Expenses</th>
                  <th className="text-right pb-1.5 font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.slice(-6).reverse().map((m, i) => (
                  <tr key={i} className="text-slate-600">
                    <td className="py-1.5 whitespace-nowrap">{monthShort(m.month)} {m.month.slice(0, 4)}</td>
                    <td className="py-1.5 text-right text-emerald-600 whitespace-nowrap">{fmtC(m.revenue)}</td>
                    <td className="py-1.5 text-right text-rose-500 whitespace-nowrap">{fmtC(m.totalOut)}</td>
                    <td className={`py-1.5 text-right font-bold whitespace-nowrap ${m.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                      {m.net < 0 ? '−' : ''}{fmtC(Math.abs(m.net))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* P&L Breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <p className="text-sm font-semibold text-slate-800 mb-4">P&L Breakdown</p>

          {/* Income */}
          <div className="mb-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-emerald-500 mb-2">Income</p>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
              <span className="text-xs text-slate-600">Invoice Payments Received</span>
              <span className="text-xs font-semibold text-emerald-600">+{fmt(invoiceRevenue)}</span>
            </div>
            {outstanding > 0 && (
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <div>
                  <span className="text-xs text-slate-600">Outstanding (Receivable)</span>
                  <p className="text-2xs text-slate-400">Due from clients — counted in profit</p>
                </div>
                <span className="text-xs font-semibold text-amber-500">+{fmt(outstanding)}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">Total Revenue</span>
              <span className="text-xs font-bold text-emerald-600">+{fmt(invoiceRevenue + outstanding)}</span>
            </div>
          </div>

          {/* Expenses */}
          <div className="mb-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-rose-500 mb-2">Expenses</p>
            {[
              { label: 'Projects Paid',     val: totalProjectsPaid, sub: 'all project costs paid out' },
              { label: 'Business Expenses', val: businessExpenses,  sub: 'rent, utilities, etc.' },
              { label: 'Salaries Paid',     val: salariesPaid,      sub: 'from Payroll' },
            ].filter(r => r.val > 0).map(({ label, val, sub }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <div>
                  <span className="text-xs text-slate-600">{label}</span>
                  <p className="text-2xs text-slate-400">{sub}</p>
                </div>
                <span className="text-xs font-semibold text-rose-500">−{fmt(val)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 mt-1">
              <span className="text-xs font-bold text-slate-700">Total Expenses</span>
              <span className="text-xs font-bold text-rose-600">−{fmt(totalExpenses)}</span>
            </div>
          </div>

          {/* Out of Pocket */}
          <div className={`rounded-xl px-4 py-3 mb-2 ${outOfPocket > 0 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-700">{outOfPocket > 0 ? 'Out of Pocket' : 'Cash Surplus'}</span>
                <p className="text-xs text-slate-400 mt-0.5">Received − all paid costs</p>
              </div>
              <span className={`text-lg font-bold ${outOfPocket > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {outOfPocket > 0 ? '−' : '+'}{fmt(Math.abs(outOfPocket))}
              </span>
            </div>
          </div>

          {/* Projected P&L */}
          <div className={`mt-auto rounded-xl px-4 py-3 ${projectedPL >= 0 ? 'bg-indigo-50 border border-indigo-100' : 'bg-rose-50 border border-rose-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-700">{projectedPL >= 0 ? 'Projected Profit' : 'Projected Loss'}</span>
                <p className="text-xs text-slate-400 mt-0.5">(Rcvd + Outstanding) − full project costs</p>
              </div>
              <span className={`text-lg font-bold ${projectedPL >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                {projectedPL >= 0 ? '+' : '−'}{fmt(Math.abs(projectedPL))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expense by category + Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category Breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-semibold text-slate-800 mb-4">Expenses by Category</p>
          {byCategory.length === 0
            ? <p className="text-sm text-slate-400 text-center py-8">No expense data</p>
            : <div className="space-y-3">
                {byCategory.map((c, i) => {
                  const w = totalCatExpenses > 0 ? (c.total / totalCatExpenses) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color || '#94a3b8' }} />
                          <span className="text-xs text-slate-600">{c.category}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{fmt(c.total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: c.color || '#6366f1' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Recent Transactions</p>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto scrollbar-hide">
              {['all','income','expense','vendor','salary'].map(t => (
                <button key={t} onClick={() => setTxType(t)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors whitespace-nowrap flex-shrink-0
                    ${txType === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto overflow-x-auto max-h-96">
            {filteredTx.length === 0
              ? <p className="text-sm text-slate-400 text-center py-8">No transactions</p>
              : <table className="w-full ios-table">
                  <tbody className="divide-y divide-slate-50">
                    {filteredTx.map((tx, i) => {
                      const badge = TYPE_BADGE[tx.type] || TYPE_BADGE.expense;
                      const isIn = tx.type === 'income';
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${badge.bg}`}>
                                <badge.Icon size={13} className={badge.text} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800 leading-tight">{tx.reference || '—'}</p>
                                <p className="text-xs text-slate-400">{tx.party}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-sm font-bold ${isIn ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {isIn ? '+' : '−'}{fmt(tx.amount_pkr ?? tx.amount)}
                            </span>
                            {isIn && tx.currency && tx.currency !== 'PKR' && (
                              <p className="text-2xs text-slate-400 mt-0.5">
                                {tx.currency} {Number(tx.amount_orig ?? tx.amount).toLocaleString()}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>
      </div>
      </>}

    </div>
  );
}
