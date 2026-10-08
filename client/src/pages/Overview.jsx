import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, Banknote, Clock, Scale } from 'lucide-react';
import api from '../lib/api';
import PeriodPicker from '../components/PeriodPicker';

// Minimal dashboard — four numbers and two short lists, all in PKR.
//   Money In    = payments received + other income        (in the period)
//   Money Out   = project costs + business expenses + salaries (in the period)
//   Net         = Money In − Money Out
//   To Receive  = unpaid invoice balances right now (not filtered by period)

const pkr = v => {
  const n = Math.round(parseFloat(v) || 0);
  return `${n < 0 ? '−' : ''}₨${Math.abs(n).toLocaleString('en-US')}`;
};
const money = (v, cc) => {
  const n = parseFloat(v) || 0;
  if (!cc || cc === 'PKR') return pkr(n);
  return `${cc} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

function StatCard({ label, value, sub, icon: Icon, tone }) {
  const tones = {
    green: 'border-t-emerald-500 text-emerald-700',
    red:   'border-t-rose-500 text-rose-700',
    slate: 'border-t-slate-400 text-slate-900',
    amber: 'border-t-amber-500 text-amber-700',
  };
  return (
    <div className={`bg-white border border-slate-200 border-t-4 rounded-2xl p-5 shadow-sm ${tones[tone].split(' ')[0]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <Icon size={15} className="text-slate-300" />
      </div>
      <p className={`text-2xl font-black tracking-tight mt-2 ${tones[tone].split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [period, setPeriod]     = useState({ from: null, to: null, label: 'All Time' });
  const [fin, setFin]           = useState(null);
  const [projects, setProjects] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const params = period.from ? { from: period.from, to: period.to } : {};
    Promise.all([
      api.get('/financials/summary', { params }),
      api.get('/projects'),
      api.get('/invoices'),
    ]).then(([fs, pr, inv]) => {
      setFin(fs.data || {});
      setProjects(Array.isArray(pr.data) ? pr.data : []);
      setInvoices(Array.isArray(inv.data) ? inv.data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period.from, period.to]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const f        = fin || {};
  const moneyIn  = f.totalRevenue ?? 0;
  const projOut  = f.totalProjectsPaid ?? 0;
  const bizOut   = f.businessExpenses ?? 0;
  const salOut   = f.salariesPaid ?? 0;
  const moneyOut = projOut + bizOut + salOut;
  const net      = moneyIn - moneyOut;

  const unpaid = invoices
    .filter(i => i.status !== 'paid' && (parseFloat(i.total) || 0) > (parseFloat(i.amount_paid) || 0))
    .map(i => ({ ...i, balance: (parseFloat(i.total) || 0) - (parseFloat(i.amount_paid) || 0) }))
    .sort((a, b) => String(a.due_date || a.created_at).localeCompare(String(b.due_date || b.created_at)));

  // Project profit is lifetime (a project's cost isn't "in" one month)
  const recentProjects = [...projects].sort((a, b) => b.id - a.id).slice(0, 8);
  const projCost   = projects.reduce((s, p) => s + (parseFloat(p.fin_total_expense) || 0), 0);
  const projRec    = projects.reduce((s, p) => s + (parseFloat(p.fin_received) || 0), 0);
  const projProfit = projRec - projCost;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">All amounts in PKR · {period.label}</p>
        </div>
        <button onClick={() => navigate('/expenses')}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-semibold shadow-sm transition-colors">
          <Banknote size={14} /> Record Expense
        </button>
      </div>

      <PeriodPicker onChange={range => setPeriod(range)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Money In" value={pkr(moneyIn)} icon={ArrowDownLeft} tone="green"
          sub={f.otherIncome > 0 ? `Invoices ${pkr(f.invoiceRevenue)} · Other ${pkr(f.otherIncome)}` : 'Payments received'} />
        <StatCard label="Money Out" value={pkr(moneyOut)} icon={ArrowUpRight} tone="red"
          sub={`Projects ${pkr(projOut)} · Business ${pkr(bizOut)} · Salaries ${pkr(salOut)}`} />
        <StatCard label={net >= 0 ? 'Net (In − Out)' : 'Net loss (In − Out)'} value={pkr(net)} icon={Scale}
          tone={net >= 0 ? 'green' : 'red'} sub="Money in minus money out" />
        <StatCard label="To Receive" value={pkr(f.outstanding)} icon={Clock} tone="amber"
          sub={`${unpaid.length} unpaid invoice${unpaid.length !== 1 ? 's' : ''} · as of today`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Projects — cost, received, profit */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">Projects</h2>
            <button onClick={() => navigate('/projects')}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {recentProjects.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No projects yet</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-5 py-2 text-2xs font-semibold text-slate-400 uppercase tracking-wider">
                <span>Project</span><span className="text-right">Cost</span><span className="text-right">Received</span><span className="text-right">Profit</span>
              </div>
              <div className="divide-y divide-slate-50">
                {recentProjects.map(p => {
                  const cost = parseFloat(p.fin_total_expense) || 0;
                  const rec  = parseFloat(p.fin_received) || 0;
                  const prof = rec - cost;
                  return (
                    <div key={p.id} onClick={() => navigate(`/projects?open=${p.id}`)}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-5 py-2.5 hover:bg-slate-50/60 cursor-pointer text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{p.title}</p>
                        <p className="text-xs text-slate-400 truncate">{p.client_name || 'No client'}{p.status === 'completed' ? ' · Completed' : ''}</p>
                      </div>
                      <span className="text-right text-slate-600">{pkr(cost)}</span>
                      <span className="text-right text-slate-600">{pkr(rec)}</span>
                      <span className={`text-right font-semibold ${prof >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pkr(prof)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-5 py-2.5 bg-slate-50 text-sm font-bold">
                <span className="text-xs text-slate-500 uppercase tracking-wider self-center">All {projects.length} projects</span>
                <span className="text-right text-slate-700">{pkr(projCost)}</span>
                <span className="text-right text-slate-700">{pkr(projRec)}</span>
                <span className={`text-right ${projProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{pkr(projProfit)}</span>
              </div>
            </>
          )}
        </div>

        {/* Unpaid invoices — who owes money */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">Unpaid Invoices</h2>
            <button onClick={() => navigate('/invoices')}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {unpaid.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">Everything is paid</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {unpaid.slice(0, 8).map(i => (
                <div key={i.id} onClick={() => navigate('/invoices')}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50/60 cursor-pointer">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{i.number}</span>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{i.client_name || 'No client'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold text-slate-800">{money(i.balance, i.currency)}</p>
                    <p className="text-xs text-slate-400">of {money(i.total, i.currency)}</p>
                  </div>
                </div>
              ))}
              {unpaid.length > 8 && (
                <p className="px-5 py-2.5 text-xs text-slate-400 text-center">+ {unpaid.length - 8} more</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
