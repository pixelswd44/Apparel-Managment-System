import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  Receipt, Plus, Search, X, Edit2, Trash2, RefreshCw,
  Tag, Calendar, Repeat, Wallet, ChevronDown, Check,
  Home, Zap, Droplets, Truck, Coffee, Package, MoreHorizontal,
  BarChart2, AlertTriangle,
} from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker';
import Drawer from '../components/Drawer';

// ── Helpers ────────────────────────────────────────────────────────────────
const pkr = n => `₨${Number(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().split('T')[0];
const curMonth = () => new Date().toISOString().slice(0, 7);
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const PAYMENT_METHODS = ['cash', 'bank transfer', 'cheque', 'online', 'card'];
const RECURRING_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

// Quick-pick presets — label shown on chip, category is matched to existing categories
const EXPENSE_PRESETS = [
  { label: 'Petty Cash',       icon: '💵', category: 'Petty Cash' },
  { label: 'Electricity Bill', icon: '⚡', category: 'Electricity' },
  { label: 'Rent',             icon: '🏢', category: 'Rent' },
  { label: 'Gas / Water',      icon: '🔥', category: 'Gas / Utilities' },
  { label: 'Internet / Phone', icon: '📡', category: 'Miscellaneous' },
  { label: 'Fuel / Transport', icon: '⛽', category: 'Transport' },
  { label: 'Staff Meals',      icon: '🍱', category: 'Staff Meals' },
  { label: 'Office Supplies',  icon: '📦', category: 'Miscellaneous' },
  { label: 'Maintenance',      icon: '🔧', category: 'Maintenance' },
  { label: 'Labour / Wages',   icon: '👷', category: 'Miscellaneous' },
  { label: 'Printing',         icon: '🖨️', category: 'Miscellaneous' },
  { label: 'Cleaning',         icon: '🧹', category: 'Miscellaneous' },
];

const DEFAULT_CATEGORIES = [
  { name: 'Rent', color: '#6366f1' },
  { name: 'Electricity', color: '#f59e0b' },
  { name: 'Gas / Utilities', color: '#10b981' },
  { name: 'Transport', color: '#3b82f6' },
  { name: 'Petty Cash', color: '#8b5cf6' },
  { name: 'Staff Meals', color: '#f97316' },
  { name: 'Maintenance', color: '#14b8a6' },
  { name: 'Miscellaneous', color: '#94a3b8' },
];

// ── CategoryModal ──────────────────────────────────────────────────────────
function CategoryModal({ category, onClose, onSave }) {
  const COLORS = ['#6366f1','#f59e0b','#10b981','#3b82f6','#8b5cf6','#f97316','#14b8a6','#ef4444','#ec4899','#94a3b8'];
  const [form, setForm] = useState(category || { name: '', color: '#6366f1' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = category
        ? await api.put(`/expenses/categories/${category.id}`, form)
        : await api.post('/expenses/categories', form);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={category ? 'Edit Category' : 'New Category'} width="max-w-sm">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" disabled={saving || !form.name}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── ExpenseModal ───────────────────────────────────────────────────────────
function ExpenseModal({ expense, categories, onClose, onSave }) {
  const blank = {
    title: '', expense_category_id: '', amount: '', paid_by: '',
    expense_date: today(), payment_method: 'cash', notes: '',
    recurring: false, recurring_period: 'monthly',
  };
  const [form, setForm] = useState(expense
    ? { ...blank, ...expense, expense_category_id: expense.expense_category_id || '', recurring: !!expense.recurring }
    : blank);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function applyPreset(preset) {
    const matchedCat = categories.find(c =>
      c.name.toLowerCase() === preset.category?.toLowerCase()
    );
    setForm(f => ({
      ...f,
      title: preset.label,
      ...(matchedCat ? { expense_category_id: String(matchedCat.id) } : {}),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        expense_category_id: form.expense_category_id || null,
        recurring: form.recurring ? 1 : 0,
      };
      const res = expense
        ? await api.put(`/expenses/${expense.id}`, payload)
        : await api.post('/expenses', payload);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={expense ? 'Edit Expense' : 'New Expense'} width="max-w-md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* ── Quick-pick presets ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">Quick Pick</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_PRESETS.map(p => {
                const active = form.title === p.label;
                return (
                  <button key={p.label} type="button" onClick={() => applyPreset(p)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border font-medium transition-all
                      ${active
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50'
                      }`}>
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Title * <span className="font-normal text-slate-400 ml-1">or type your own</span>
            </label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required
              placeholder="e.g. October Rent, Electricity Bill"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (PKR) *</label>
              <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
              <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
              <select value={form.expense_category_id} onChange={e => set('expense_category_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="">Uncategorized</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Method</label>
              <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                {PAYMENT_METHODS.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Paid By</label>
            <input type="text" value={form.paid_by} onChange={e => set('paid_by', e.target.value)}
              placeholder="Person or account"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          {/* Recurring toggle */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={14} className="text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Recurring Expense</span>
              </div>
              <button type="button" onClick={() => set('recurring', !form.recurring)}
                className={`w-10 h-6 rounded-full transition-colors relative ${form.recurring ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.recurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {form.recurring && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Frequency</label>
                <div className="flex gap-2 flex-wrap">
                  {RECURRING_PERIODS.map(p => (
                    <button key={p} type="button" onClick={() => set('recurring_period', p)}
                      className={`px-3 py-1 text-xs rounded-lg font-medium capitalize transition-colors ${form.recurring_period === p ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving || !form.title}
              className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
              {saving ? 'Saving…' : expense ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
    </Drawer>
  );
}

// ── DetailReport ──────────────────────────────────────────────────────────
function DetailReport({ expenses, summary, month }) {
  const total = summary.thisMonth || 0;
  const count = expenses.length;
  const avg   = count > 0 ? total / count : 0;

  // Category rows — backend returns 'name' field; enrich with per-category count
  const catRows = (summary.byCategory || []).map(c => ({
    ...c,
    label: c.name || 'Uncategorized',
    count: expenses.filter(e => (e.category_name || null) === (c.name || null)).length,
    pct:   total > 0 ? (c.total / total) * 100 : 0,
  }));

  // Payment method breakdown computed from the expenses list
  const methodMap = {};
  expenses.forEach(e => {
    const m = e.payment_method || 'cash';
    methodMap[m] = (methodMap[m] || 0) + parseFloat(e.amount || 0);
  });
  const methodRows = Object.entries(methodMap)
    .sort(([, a], [, b]) => b - a)
    .map(([method, amt]) => ({ method, amt, pct: total > 0 ? (amt / total) * 100 : 0 }));

  // Top 5 by amount
  const top5 = [...expenses]
    .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
    .slice(0, 5);

  const monthLabel = month
    ? new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 overflow-hidden">

      {/* Report header bar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-slate-800 text-white">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-indigo-400" />
          <span className="font-semibold text-sm tracking-wide">Expense Report</span>
          {monthLabel && <span className="text-xs text-slate-400 font-normal ml-1">— {monthLabel}</span>}
        </div>
        <span className="text-xs text-slate-400">{count} {count === 1 ? 'entry' : 'entries'} this period</span>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Key metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Spent',          value: pkr(total),                         sub: monthLabel,            accent: false },
            { label: 'Transactions',         value: String(count),                      sub: 'entries recorded',    accent: false },
            { label: 'Average per Entry',    value: count > 0 ? pkr(avg) : '—',         sub: 'per transaction',     accent: false },
            { label: 'Recurring Monthly',    value: pkr(summary.recurringMonthly || 0), sub: 'fixed monthly cost',  accent: true  },
          ].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">{m.label}</p>
              <p className={`text-xl font-bold ${m.accent ? 'text-indigo-600' : 'text-slate-900'}`}>{m.value}</p>
              <p className="text-2xs text-slate-400 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Category breakdown ── */}
        {catRows.length > 0 && (
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-3">By Category</p>
            <div className="space-y-2.5">
              {catRows.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color || '#94a3b8' }} />
                  <span className="text-sm font-medium text-slate-700 w-40 truncate">{c.label}</span>
                  <span className="text-2xs text-slate-400 w-20 flex-shrink-0">
                    {c.count} {c.count === 1 ? 'entry' : 'entries'}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${c.pct}%`, background: c.color || '#94a3b8' }} />
                  </div>
                  <span className="text-2xs text-slate-400 w-10 text-right flex-shrink-0">
                    {c.pct.toFixed(0)}%
                  </span>
                  <span className="text-sm font-bold text-slate-800 w-28 text-right flex-shrink-0">
                    {pkr(c.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bottom row: payment methods + largest expenses ── */}
        {(methodRows.length > 0 || top5.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4 border-t border-slate-100">

            {/* Payment method split */}
            {methodRows.length > 0 && (
              <div>
                <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-3">By Payment Method</p>
                <div className="space-y-3">
                  {methodRows.map(m => (
                    <div key={m.method}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700 capitalize">{m.method}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-slate-400">{m.pct.toFixed(0)}%</span>
                          <span className="text-xs font-bold text-slate-800">{pkr(m.amt)}</span>
                        </div>
                      </div>
                      <div className="bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${m.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top 5 largest expenses */}
            {top5.length > 0 && (
              <div>
                <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-3">Largest Expenses</p>
                <div className="space-y-2.5">
                  {top5.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <span className="text-2xs font-bold text-slate-300 w-4 flex-shrink-0 text-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{e.title}</p>
                        {e.category_name
                          ? <p className="text-2xs font-medium mt-0.5" style={{ color: e.category_color || '#94a3b8' }}>
                              {e.category_name}
                            </p>
                          : <p className="text-2xs text-slate-400 mt-0.5">{fmtDate(e.expense_date)}</p>
                        }
                      </div>
                      <span className="text-sm font-bold text-slate-800 flex-shrink-0">{pkr(e.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {count === 0 && (
          <p className="text-center text-sm text-slate-400 py-2">No expenses recorded for this period.</p>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState({ thisMonth: 0, recurringMonthly: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(curMonth());
  const [catFilter, setCatFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [showCats, setShowCats] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [delTarget, setDelTarget] = useState(null);       // expense id pending delete
  const [delCatTarget, setDelCatTarget] = useState(null); // category id pending delete
  // Period filter: { from, to, label } — null from/to means "all time" / use month
  const [periodRange, setPeriodRange] = useState({ from: null, to: null, label: 'All Time' });

  const load = useCallback(async () => {
    setLoading(true);
    // Build date params: quarter range takes priority over month picker
    const dateParams = periodRange.from
      ? { from: periodRange.from, to: periodRange.to }
      : { month };
    const [expRes, catRes, sumRes] = await Promise.all([
      api.get('/expenses', { params: { ...dateParams, category_id: catFilter || undefined } }),
      api.get('/expenses/categories'),
      api.get('/expenses/summary', { params: dateParams }),
    ]);
    setExpenses(expRes.data);
    setCategories(catRes.data);
    setSummary(sumRes.data);
    setLoading(false);
  }, [month, catFilter, periodRange.from, periodRange.to]);

  useEffect(() => { load(); }, [load]);

  async function seedCategories() {
    setSeeding(true);
    for (const c of DEFAULT_CATEGORIES) {
      await api.post('/expenses/categories', c).catch(() => {});
    }
    await load();
    setSeeding(false);
  }

  async function confirmDeleteExpense() {
    await api.delete(`/expenses/${delTarget}`);
    setExpenses(p => p.filter(e => e.id !== delTarget));
    setDelTarget(null);
    load();
  }

  async function confirmDeleteCategory() {
    const id = delCatTarget;
    await api.delete(`/expenses/categories/${id}`);
    setDelCatTarget(null);
    load();
    if (catFilter === String(id)) setCatFilter('');
  }

  const filtered = expenses.filter(e =>
    !search || e.title.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTotal = filtered.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pkr(summary.thisMonth || 0)} this period
            {(summary.recurringMonthly || 0) > 0 && ` · ${pkr(summary.recurringMonthly)}/mo recurring`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCats(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-xl font-medium transition-colors ${
              showCats ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
            }`}>
            <Tag size={14} /> Categories
          </button>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold text-sm shadow-sm transition-colors">
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* ── Categories panel (collapsible) ── */}
      {showCats && (
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-200 mb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Manage Categories</p>
            <div className="flex gap-2">
              {categories.length === 0 && (
                <button onClick={seedCategories} disabled={seeding}
                  className="text-xs text-indigo-600 hover:underline font-medium disabled:opacity-50">
                  {seeding ? 'Loading…' : 'Seed defaults'}
                </button>
              )}
              <button onClick={() => setCatModal('new')}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold">
                <Plus size={11} /> New
              </button>
            </div>
          </div>
          {delCatTarget && (
            <div className="flex items-center gap-3 px-4 py-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">Delete this category? Expenses will become uncategorized.</span>
              <button onClick={() => setDelCatTarget(null)}
                className="px-3 py-1.5 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={confirmDeleteCategory}
                className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                <span className="text-sm text-slate-700">{c.name}</span>
                <button onClick={() => setCatModal(c)} className="text-slate-300 hover:text-slate-500 transition-colors"><Edit2 size={11} /></button>
                <button onClick={() => setDelCatTarget(c.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><X size={11} /></button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-slate-400">No categories yet. <button onClick={seedCategories} className="text-indigo-600 hover:underline">Load defaults</button></p>
            )}
          </div>
        </div>
      )}

      {/* ── Two-panel split ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

        {/* ── LEFT: filters + list ── */}
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">

          {/* Search */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
          </div>

          {/* Period picker + month input */}
          <div className="px-4 py-3 border-b border-slate-100 space-y-2">
            <PeriodPicker onChange={range => setPeriodRange(range)} />
            {!periodRange.from && (
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            )}
          </div>

          {/* Category filter pills */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCatFilter('')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${!catFilter ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}>
                All
              </button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCatFilter(catFilter === String(c.id) ? '' : String(c.id))}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${catFilter === String(c.id) ? 'text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                  style={catFilter === String(c.id) ? { background: c.color } : {}}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Inline delete confirmation */}
          {delTarget && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-200 text-xs flex-shrink-0">
              <AlertTriangle size={13} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">Delete this expense?</span>
              <button onClick={() => setDelTarget(null)}
                className="px-2 py-1 border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={confirmDeleteExpense}
                className="px-2 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>
            </div>
          )}

          {/* Expense list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Receipt size={28} className="mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-400">No expenses found</p>
                <button onClick={() => setModal('new')}
                  className="mt-3 text-xs text-indigo-600 hover:underline font-medium">
                  Record first expense
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map(exp => (
                  <div key={exp.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    {/* Category colour dot */}
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
                      style={{ background: exp.category_color || '#94a3b8' }} />

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-800 truncate">{exp.title}</p>
                        {exp.recurring && (
                          <span className="flex items-center gap-0.5 text-2xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                            <Repeat size={9} /> {exp.recurring_period}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {fmtDate(exp.expense_date)}
                        {exp.payment_method && ` · ${exp.payment_method}`}
                        {exp.paid_by && ` · ${exp.paid_by}`}
                      </p>
                    </div>

                    {/* Amount */}
                    <span className="text-sm font-bold text-slate-800 flex-shrink-0">{pkr(exp.amount)}</span>

                    {/* Hover actions */}
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => setModal(exp)}
                        className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => setDelTarget(exp.id)}
                        className="p-1 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-500 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total footer */}
          {!loading && filtered.length > 0 && (
            <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}</span>
                <span className="text-sm font-bold text-slate-800">{pkr(filteredTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: analytics report ── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Loading analytics…</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <BarChart2 size={40} className="mb-4 text-slate-200" />
              <p className="text-base font-semibold text-slate-400">No data for this period</p>
              <p className="text-sm text-slate-400 mt-1">Add expenses to see analytics here</p>
              <button onClick={() => setModal('new')}
                className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold text-sm transition-colors">
                <Plus size={15} /> Add First Expense
              </button>
            </div>
          ) : (
            <DetailReport expenses={expenses} summary={summary} month={month} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal && (
        <ExpenseModal
          expense={modal === 'new' ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}
      {catModal && (
        <CategoryModal
          category={catModal === 'new' ? null : catModal}
          onClose={() => setCatModal(null)}
          onSave={() => { setCatModal(null); load(); }}
        />
      )}
    </div>
  );
}
