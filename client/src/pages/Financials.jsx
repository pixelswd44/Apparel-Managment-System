import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  TrendingUp, TrendingDown, DollarSign, AlertCircle,
  ArrowUpRight, ArrowDownRight, RefreshCw, Wallet, Users,
  Receipt, Store, BarChart2, Clock,
} from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker';

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
  income:  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Income',   Icon: ArrowUpRight },
  expense: { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'Expense',  Icon: ArrowDownRight },
  vendor:  { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Vendor',   Icon: Store },
  salary:  { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Salary',   Icon: Users },
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
function SummaryCard({ label, value, sub, Icon, accent, negative }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border ${negative ? 'border-rose-200' : 'border-slate-100'}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 ${accent || 'text-slate-400'}`}>
        <Icon size={13} /> {label}
      </div>
      <p className={`text-2xl font-bold ${negative ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Financials() {
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState('PKR');
  const [loading, setLoading] = useState(true);
  const [txType, setTxType] = useState('all');
  const [periodRange, setPeriodRange] = useState({ from: null, to: null, label: 'All Time' });

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
      setCurrencies(Array.isArray(cur.data) ? cur.data : []);
      setBaseCurrency((settings.data && settings.data.base_currency) || 'PKR');
    } finally { setLoading(false); }
  }, [periodRange.from, periodRange.to]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
      <RefreshCw size={16} className="animate-spin-slow" /> Loading financials…
    </div>
  );

  // Base-currency formatter (PKR amounts → base currency display)
  const fmt = makeFormatter(currencies, baseCurrency);
  const baseSymbol = baseCurrency === 'PKR' ? '₨'
    : (currencies.find(c => c.code === baseCurrency)?.symbol || baseCurrency);

  const {
    invoiceRevenue = 0, outstanding = 0,
    businessExpenses = 0, salariesPaid = 0, vendorPayments = 0,
    totalExpenses = 0, netProfit = 0, revenueByCC = {},
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

  return (
    <div className="animate-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financials</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {periodRange.from ? `P&L · ${periodRange.label}` : 'P&L overview and cash flow'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl text-slate-600 hover:border-indigo-300 font-medium">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Period Picker */}
      <div className="mb-6">
        <PeriodPicker onChange={range => { setPeriodRange(range); }} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Total Revenue"
          value={fmt(invoiceRevenue)}
          sub={revenueCCSub || 'Invoice payments collected'}
          Icon={TrendingUp}
          accent="text-emerald-500"
        />
        <SummaryCard
          label="Total Expenses"
          value={fmt(totalExpenses)}
          sub="Business + salaries + vendors"
          Icon={TrendingDown}
          accent="text-rose-400"
        />
        <SummaryCard
          label={netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
          value={fmt(Math.abs(netProfit))}
          sub={netProfit >= 0 ? `Margin: ${pct(netProfit, invoiceRevenue)}%` : 'Spending exceeds revenue'}
          Icon={netProfit >= 0 ? TrendingUp : TrendingDown}
          accent={netProfit >= 0 ? 'text-indigo-500' : 'text-rose-500'}
          negative={netProfit < 0}
        />
        <SummaryCard
          label="Outstanding"
          value={fmt(outstanding)}
          sub="Unpaid invoice balances"
          Icon={Clock}
          accent="text-amber-500"
        />
      </div>

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
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left pb-1 font-medium">Month</th>
                    <th className="text-right pb-1 font-medium">Revenue</th>
                    <th className="text-right pb-1 font-medium">Expenses</th>
                    <th className="text-right pb-1 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {monthly.slice(-6).reverse().map((m, i) => (
                    <tr key={i} className="text-slate-600">
                      <td className="py-1">{monthShort(m.month)} {m.month.slice(0, 4)}</td>
                      <td className="py-1 text-right text-emerald-600">{fmt(m.revenue)}</td>
                      <td className="py-1 text-right text-rose-500">{fmt(m.totalOut)}</td>
                      <td className={`py-1 text-right font-semibold ${m.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{fmt(Math.abs(m.net))}{m.net < 0 ? ' L' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* P&L Breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <p className="text-sm font-semibold text-slate-800 mb-4">P&L Breakdown</p>

          {/* Income */}
          <div className="mb-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-emerald-500 mb-2">Income</p>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
              <span className="text-xs text-slate-600">Invoice Payments</span>
              <span className="text-xs font-semibold text-emerald-600">+{fmt(invoiceRevenue)}</span>
            </div>
          </div>

          {/* Expenses */}
          <div className="mb-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-rose-500 mb-2">Expenses</p>
            {[
              { label: 'Business Expenses',    val: businessExpenses },
              { label: 'Salaries Paid',        val: salariesPaid },
              { label: 'Vendor Payments',      val: vendorPayments },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <span className="text-xs text-slate-600">{label}</span>
                <span className="text-xs font-semibold text-rose-500">−{fmt(val)}</span>
              </div>
            ))}
          </div>

          {/* Net */}
          <div className={`mt-auto rounded-xl px-4 py-3 ${netProfit >= 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
              <span className={`text-lg font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {netProfit >= 0 ? '+' : '−'}{fmt(Math.abs(netProfit))}
              </span>
            </div>
            {invoiceRevenue > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">Margin: {pct(netProfit, invoiceRevenue)}%</p>
            )}
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
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Recent Transactions</p>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {['all','income','expense','vendor','salary'].map(t => (
                <button key={t} onClick={() => setTxType(t)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-colors
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
    </div>
  );
}
