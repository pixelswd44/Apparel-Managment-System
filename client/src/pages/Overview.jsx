import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Banknote, FileText, Flame, Layers, Receipt, SlidersHorizontal } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/authContext';
import PeriodPicker from '../components/PeriodPicker';
import WarmPL from '../components/WarmPL';
import { pkr, displayCurrency } from '../lib/currency';

// Dashboard — warm "Crextio"-style theme. All amounts in PKR.
//   Money In    = payments received + other income        (in the period)
//   Money Out   = project costs + business expenses + salaries (in the period)
//   Net         = Money In − Money Out (drives margin)
//   Cash        = Ledger closing balance (opening + overrides + advances)
//   To Receive  = unpaid invoice balances right now (not filtered by period)

const money = (v, cc) => {
  const n = parseFloat(v) || 0;
  if (!cc || cc === 'PKR') return pkr(n);
  return `${cc} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};
const card = 'rounded-xl bg-white/85 border border-white shadow-[0_10px_40px_-18px_rgba(120,90,20,.25)]';
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Labelled pill like the top row of the reference: label above, pill with the value inside.
function Pill({ label, value, pct, tone, grow }) {
  const tones = {
    dark:   'bg-[#262626] text-white',
    yellow: 'bg-[#f9c846] text-[#262626]',
    white:  'bg-white text-[#262626] border border-[#efe6d0]',
    stripe: 'text-[#262626] border border-[#efe6d0]',
  };
  return (
    <div className={`min-w-0 ${tone === 'stripe' ? 'min-w-full order-last sm:min-w-0 sm:order-none' : 'min-w-[calc(33.333%-7px)] sm:min-w-0'}`} style={{ flex: `${grow} 1 0` }}>
      <p className="text-[11px] text-[#6f6a5d] mb-1.5 truncate">{label}</p>
      <div className={`h-8 rounded-full flex items-center px-3 text-[11px] font-semibold relative overflow-hidden ${tones[tone]}`}
        style={tone === 'stripe' ? { background: 'repeating-linear-gradient(135deg,#fff 0 4px,#f4ead0 4px 8px)' } : undefined}>
        {tone === 'stripe' && (
          <span className="absolute inset-y-0 left-0 rounded-full bg-[#f9c846]/70 transition-all duration-700" style={{ width: `${clamp(pct)}%` }} />
        )}
        <span className="relative">{value}</span>
      </div>
    </div>
  );
}

function Big({ value, label, icon: Icon, tint, onClick }) {
  return (
    <div onClick={onClick}
      className={`${card} px-4 py-3 sm:px-5 sm:py-4 flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-4 cursor-pointer hover:shadow-lg transition-shadow`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl grid place-items-center flex-shrink-0 ${tint}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <p className="text-2xl sm:text-3xl font-light text-[#232323] leading-none tabular-nums">{value}</p>
        <p className="text-[11px] sm:text-xs text-[#8a8372] mt-1 leading-tight sm:truncate">{label}</p>
      </div>
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod]     = useState({ from: null, to: null, label: 'All Time' });
  const [fin, setFin]           = useState(null);
  const [projects, setProjects] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger]     = useState([]);
  const [ledgerSummary, setLedgerSummary] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const params = period.from ? { from: period.from, to: period.to } : {};
    Promise.all([
      api.get('/financials/summary', { params }),
      api.get('/projects'),
      api.get('/invoices'),
      api.get('/financials/ledger', { params }),
    ]).then(([fs, pr, inv, lg]) => {
      setLedger(Array.isArray(lg.data?.ledger) ? lg.data.ledger : []);
      setLedgerSummary(lg.data?.summary || null);
      setFin(fs.data || {});
      setProjects(Array.isArray(pr.data) ? pr.data : []);
      setInvoices(Array.isArray(inv.data) ? inv.data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period.from, period.to]);

  const f        = fin || {};
  const moneyIn  = f.totalRevenue ?? 0;
  const projOut  = f.totalProjectsPaid ?? 0;
  const bizOut   = f.businessExpenses ?? 0;
  const salOut   = f.salariesPaid ?? 0;
  const moneyOut = projOut + bizOut + salOut;
  const net      = moneyIn - moneyOut;

  // Cash balance — the Ledger's closing balance for the same period, so the hero
  // always matches the Ledger page. It carries in opening balances (and manual
  // monthly overrides) and counts employee advances, which the P&L figures above
  // leave out. "Opening" is whatever the balance holds beyond this period's in − out.
  const sections   = Object.values(ledgerSummary?.bySection || {});
  const cashIn     = sections.reduce((s, x) => s + (x.credit || 0), 0);
  const cashOut    = sections.reduce((s, x) => s + (x.debit  || 0), 0);
  const cash       = ledgerSummary ? (ledgerSummary.netBalance || 0) : net;
  const cashOpen   = ledgerSummary ? cash - (cashIn - cashOut) : 0;
  const today   = new Date().toISOString().split('T')[0];

  const unpaid = invoices
    .filter(i => i.status !== 'paid' && (parseFloat(i.total) || 0) > (parseFloat(i.amount_paid) || 0))
    .map(i => ({ ...i, balance: (parseFloat(i.total) || 0) - (parseFloat(i.amount_paid) || 0) }))
    .sort((a, b) => String(a.due_date || a.created_at).localeCompare(String(b.due_date || b.created_at)));
  const overdue = unpaid.filter(i => i.due_date && i.due_date < today).length;

  // Project profit is lifetime (a project's cost isn't "in" one month)
  const recentProjects = [...projects].sort((a, b) => b.id - a.id).slice(0, 6);
  const activeProjects = projects.filter(p => p.status !== 'completed').length;
  const projCost   = projects.reduce((s, p) => s + (parseFloat(p.fin_total_expense) || 0), 0);
  const projRec    = projects.reduce((s, p) => s + (parseFloat(p.fin_received) || 0), 0);
  const projProfit = projRec - projCost;

  const outstanding = parseFloat(f.outstanding) || 0;
  const marginPct    = moneyIn > 0 ? (net / moneyIn) * 100 : 0;
  const collectedPct = moneyIn + outstanding > 0 ? (moneyIn / (moneyIn + outstanding)) * 100 : 0;
  const spendPct     = moneyIn > 0 ? (moneyOut / moneyIn) * 100 : 0;
  const overduePct   = unpaid.length ? (overdue / unpaid.length) * 100 : 0;

  const first = (user?.name || '').split(' ')[0] || 'there';
  const split = [
    { label: 'Projects', value: projOut, bg: 'bg-[#f9c846]', fg: 'text-[#262626]' },
    { label: 'Business', value: bizOut, bg: 'bg-[#262626]', fg: 'text-white' },
    { label: 'Salaries', value: salOut, bg: 'bg-[#a5abb8]', fg: 'text-white' },
  ];

  return (
    <div className="warm-dash -m-4 md:-m-6 lg:-m-8 p-4 md:p-6 lg:p-9 min-h-screen"
      style={{ background: 'linear-gradient(135deg,#f8edcf 0%,#fcf5e4 38%,#fffdf8 100%)', fontFamily: "'Outfit', 'Inter', system-ui, sans-serif" }}>

      {/* Greeting */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-4xl sm:text-5xl font-light text-[#232323] tracking-tight">Welcome back, {first}</h1>
          <p className="text-sm text-[#8a8372] mt-2">All amounts in {displayCurrency().code} · {period.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium border transition-colors ${showFilters ? 'bg-[#fbf0cc] border-[#f1dc9a] text-[#262626]' : 'bg-white border-[#efe6d0] text-[#262626] hover:bg-[#fbf0cc]'}`}>
            <SlidersHorizontal size={14} /> <span className="hidden sm:inline">Filters</span>
            {period.from && <span className="w-2 h-2 rounded-full bg-[#f9c846]" />}
          </button>
          <button onClick={() => navigate('/expenses/new')}
            className="flex items-center gap-2 px-5 py-3 bg-[#262626] text-white rounded-full text-sm font-medium shadow-lg shadow-black/10 hover:bg-black transition-colors">
            <Banknote size={15} /> <span className="hidden sm:inline">Record</span> Expense
          </button>
        </div>
      </div>

      {/* Period filters — hidden, not unmounted, so the picker keeps its state */}
      <div className={showFilters ? 'mt-4' : 'hidden'}><PeriodPicker onChange={range => setPeriod(range)} /></div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-[#efe6d0] border-t-[#262626] rounded-full animate-spin" />
        </div>
      ) : (<>
        {/* Pills — full width */}
        <div className="flex flex-wrap sm:flex-nowrap gap-2.5 mt-6 sm:mt-7 w-full">
          <Pill label="Margin" value={`${marginPct.toFixed(0)}%`} tone="dark" grow={2} />
          <Pill label="Collected" value={`${collectedPct.toFixed(0)}%`} tone="yellow" grow={2} />
          <Pill label="Spent of income" value={`${spendPct.toFixed(0)}%`} tone="stripe" pct={spendPct} grow={5} />
          <Pill label="Overdue" value={`${overduePct.toFixed(0)}%`} tone="white" grow={2} />
        </div>

        {/* Small info cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mt-4">
          <Big value={activeProjects} label="Active projects" icon={Flame} tint="bg-[#fff1e3] text-orange-500" onClick={() => navigate('/projects')} />
          <Big value={unpaid.length} label="Unpaid invoices" icon={Receipt} tint="bg-[#fbf0cc] text-[#8a6d12]" onClick={() => navigate('/invoices')} />
          <Big value={projects.length} label="Projects" icon={Layers} tint="bg-[#eef0f4] text-slate-500" onClick={() => navigate('/projects')} />
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mt-6">

          {/* Net hero — dark card */}
          <div className="relative overflow-hidden rounded-xl p-6 text-white min-h-[260px] flex flex-col justify-between md:order-1 xl:order-none"
            style={{ background: 'radial-gradient(500px 260px at 90% 0%, rgba(249,200,70,.35), transparent 60%), linear-gradient(160deg,#2c2c2c,#171717)' }}>
            <div>
              <p className="text-sm text-white/60">Cash balance · as in Ledger</p>
              <p className={`text-4xl sm:text-5xl font-light mt-2 tabular-nums ${cash < 0 ? 'text-rose-300' : ''}`}>{pkr(cash)}</p>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {Math.round(cashOpen) !== 0 && (
                  <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs">● Opening {pkr(cashOpen)}</span>
                )}
                <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs">▲ In {pkr(ledgerSummary ? cashIn : moneyIn)}</span>
                <span className="px-3 py-1.5 rounded-full bg-white/10 text-xs">▼ Out {pkr(ledgerSummary ? cashOut : moneyOut)}</span>
              </div>
              <div className="flex items-center justify-between rounded-full bg-[#f9c846] text-[#262626] pl-4 pr-1.5 py-1.5">
                <span className="text-sm font-medium">To receive</span>
                <span className="bg-[#262626] text-white text-sm font-medium px-4 py-1.5 rounded-full">{pkr(outstanding)}</span>
              </div>
            </div>
          </div>

          {/* P&L chart */}
          <div className="md:col-span-2 md:order-3 xl:order-none"><WarmPL rows={ledger} from={period.from} to={period.to} periodLabel={period.label} /></div>

          {/* Where the money went */}
          <div className={`${card} p-6 flex flex-col md:order-2 xl:order-none`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl text-[#232323]">Money out</h2>
              <span className="text-2xl font-light text-[#232323]">{pkr(moneyOut)}</span>
            </div>
            {moneyOut > 0 ? (
              <>
                <div className="flex gap-1.5 mt-5">
                  {split.filter(s => s.value > 0).map(s => (
                    <div key={s.label} style={{ flex: s.value }} className="min-w-0">
                      <p className="text-[11px] text-[#8a8372] mb-1">{Math.round((s.value / moneyOut) * 100)}%</p>
                      <div className={`h-12 rounded-2xl px-3 flex items-center text-xs font-medium ${s.bg} ${s.fg} overflow-hidden`}>
                        <span className="truncate">{s.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-2.5 text-sm">
                  {split.map(s => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[#6f6a5d]"><span className={`w-2.5 h-2.5 rounded-full ${s.bg}`} />{s.label}</span>
                      <span className="font-medium text-[#232323] tabular-nums">{pkr(s.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="flex-1 grid place-items-center text-sm text-[#a39b86] py-8">No spending in this period</p>
            )}
          </div>

          {/* Projects */}
          <div className={`${card} p-5 sm:p-6 md:col-span-2 xl:col-span-3 md:order-4 xl:order-none`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl text-[#232323]">Projects</h2>
              <button onClick={() => navigate('/projects')}
                className="w-9 h-9 rounded-full border border-[#efe6d0] bg-white grid place-items-center text-[#262626] hover:bg-[#262626] hover:text-white transition-colors">
                <ArrowRight size={15} />
              </button>
            </div>
            {recentProjects.length === 0 ? (
              <p className="py-8 text-sm text-[#a39b86] text-center">No projects yet</p>
            ) : (
              <>
                {/* Tablet / desktop: table */}
                <div className="hidden sm:block">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 pb-2 text-[11px] uppercase tracking-wider text-[#a39b86]">
                    <span>Project</span><span className="text-right">Cost</span><span className="text-right">Received</span><span className="text-right">Profit</span>
                  </div>
                  <div className="space-y-1.5">
                    {recentProjects.map(p => {
                      const cost = parseFloat(p.fin_total_expense) || 0;
                      const rec  = parseFloat(p.fin_received) || 0;
                      const prof = rec - cost;
                      return (
                        <div key={p.id} onClick={() => navigate(`/projects?open=${p.id}`)}
                          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-3 py-2.5 rounded-2xl hover:bg-[#fbf3de] cursor-pointer text-sm transition-colors">
                          <div className="min-w-0">
                            <p className="font-medium text-[#232323] truncate">{p.title}</p>
                            <p className="text-xs text-[#a39b86] truncate">{p.client_name || 'No client'}{p.status === 'completed' ? ' · Completed' : ''}</p>
                          </div>
                          <span className="text-right text-[#6f6a5d]">{pkr(cost)}</span>
                          <span className="text-right text-[#6f6a5d]">{pkr(rec)}</span>
                          <span className={`text-right font-semibold ${prof >= 0 ? 'text-[#232323]' : 'text-rose-600'}`}>{pkr(prof)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 pt-3 mt-2 border-t border-[#f1e8d2] text-sm font-semibold">
                    <span className="text-xs text-[#8a8372] font-normal self-center">All {projects.length} projects</span>
                    <span className="text-right text-[#232323]">{pkr(projCost)}</span>
                    <span className="text-right text-[#232323]">{pkr(projRec)}</span>
                    <span className={`text-right ${projProfit >= 0 ? 'text-[#232323]' : 'text-rose-600'}`}>{pkr(projProfit)}</span>
                  </div>
                </div>

                {/* Phone: one card per project */}
                <div className="sm:hidden space-y-2">
                  {recentProjects.map(p => {
                    const cost = parseFloat(p.fin_total_expense) || 0;
                    const rec  = parseFloat(p.fin_received) || 0;
                    const prof = rec - cost;
                    return (
                      <div key={p.id} onClick={() => navigate(`/projects?open=${p.id}`)} className="rounded-2xl bg-[#fbf6e8] px-3.5 py-3 cursor-pointer">
                        <p className="text-sm font-medium text-[#232323] truncate">{p.title}</p>
                        <p className="text-xs text-[#a39b86] truncate">{p.client_name || 'No client'}{p.status === 'completed' ? ' · Completed' : ''}</p>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                          <div><p className="text-[#a39b86]">Cost</p><p className="text-[#4b4638] font-medium truncate">{pkr(cost)}</p></div>
                          <div><p className="text-[#a39b86]">Received</p><p className="text-[#4b4638] font-medium truncate">{pkr(rec)}</p></div>
                          <div><p className="text-[#a39b86]">Profit</p><p className={`font-semibold truncate ${prof >= 0 ? 'text-[#232323]' : 'text-rose-600'}`}>{pkr(prof)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="rounded-2xl border border-[#f1e8d2] px-3.5 py-3">
                    <p className="text-xs text-[#8a8372]">All {projects.length} projects</p>
                    <div className="grid grid-cols-3 gap-2 mt-1.5 text-[11px]">
                      <p className="font-semibold text-[#232323] truncate">{pkr(projCost)}</p>
                      <p className="font-semibold text-[#232323] truncate">{pkr(projRec)}</p>
                      <p className={`font-semibold truncate ${projProfit >= 0 ? 'text-[#232323]' : 'text-rose-600'}`}>{pkr(projProfit)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Unpaid invoices — dark task-style card */}
          <div className="md:col-span-2 xl:col-span-1 md:order-5 xl:order-none rounded-xl p-6 text-white" style={{ background: 'linear-gradient(160deg,#2c2c2c,#171717)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl">Unpaid invoices</h2>
              <span className="text-2xl font-light text-[#f9c846]">{unpaid.length}</span>
            </div>
            {unpaid.length === 0 ? (
              <p className="py-10 text-sm text-white/50 text-center">Everything is paid</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {unpaid.slice(0, 5).map(i => {
                  const late = i.due_date && i.due_date < today;
                  return (
                    <div key={i.id} onClick={() => navigate(`/invoices?view=${i.id}`)} className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-10 h-10 rounded-2xl bg-white/10 grid place-items-center flex-shrink-0 group-hover:bg-white/20 transition-colors">
                        <FileText size={16} className="text-white/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{i.client_name || i.number}</p>
                        <p className={`text-xs truncate ${late ? 'text-rose-300' : 'text-white/45'}`}>{i.number}{late ? ' · overdue' : ''}</p>
                      </div>
                      <span className="text-xs font-medium text-[#f9c846] whitespace-nowrap">{money(i.balance, i.currency)}</span>
                    </div>
                  );
                })}
                {unpaid.length > 5 && (
                  <button onClick={() => navigate('/invoices')} className="w-full text-xs text-white/50 hover:text-white pt-1 flex items-center justify-center gap-1">
                    + {unpaid.length - 5} more <ArrowUpRight size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </>)}
    </div>
  );
}
