import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Banknote, Check, FileText, Flame, LayoutGrid, Layers, Receipt, RotateCcw, SlidersHorizontal } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/authContext';
import PeriodPicker from '../components/PeriodPicker';
import WarmPL from '../components/WarmPL';
import TasksWidget from '../components/TasksWidget';
import DashboardGrid from '../components/DashboardGrid';
import { pkr, displayCurrency } from '../lib/currency';

// Dashboard — Liquid Glass surfaces over the app wallpaper. All amounts in PKR.
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
const card = 'glass rounded-3xl';
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Labelled pill like the top row of the reference: label above, pill with the value inside.
function Pill({ label, value, pct, tone, grow }) {
  const tones = {
    dark:   'glass-dark !border-white/10',
    blue:   'text-white bg-gradient-to-b from-[#2b8cff] to-[#0071e3] shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_6px_16px_-6px_rgba(0,113,227,.55)]',
    white:  'glass text-[#1d1d1f]',
    stripe: 'glass text-[#1d1d1f]',
  };
  return (
    <div className={`min-w-0 ${tone === 'stripe' ? 'min-w-full order-last sm:min-w-0 sm:order-none' : 'min-w-[calc(33.333%-7px)] sm:min-w-0'}`} style={{ flex: `${grow} 1 0` }}>
      <p className="text-[11px] font-medium text-[#515154] mb-1.5 truncate">{label}</p>
      <div className={`h-9 rounded-full flex items-center px-3.5 text-xs font-semibold relative overflow-hidden ${tones[tone]}`}>
        {tone === 'stripe' && (
          <span className="absolute inset-y-[3px] left-[3px] rounded-full bg-gradient-to-b from-[#7cb5f5]/80 to-[#3d95ef]/70 shadow-[inset_0_1px_0_rgba(255,255,255,.5)] transition-[width] duration-1000 ease-[cubic-bezier(.34,1.3,.64,1)]"
            style={{ width: `calc(${clamp(pct)}% - 6px)` }} />
        )}
        <span className="relative">{value}</span>
      </div>
    </div>
  );
}

function Big({ value, label, icon: Icon, tint, onClick }) {
  return (
    <div onClick={onClick}
      className={`${card} glass-lift px-4 py-3 sm:px-5 sm:py-4 flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-4 cursor-pointer`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full grid place-items-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,.6)] ${tint}`}><Icon size={18} /></div>
      <div className="min-w-0">
        <p className="text-2xl sm:text-3xl font-light text-[#1d1d1f] leading-none tabular-nums tracking-tight">{value}</p>
        <p className="text-[11px] sm:text-xs text-[#6e6e73] mt-1 leading-tight sm:truncate">{label}</p>
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
  const [editing, setEditing]         = useState(false); // rearranging widgets
  const [layoutKey, setLayoutKey]     = useState(0);     // bump to remount the grid after a reset
  const layoutStore = `crm_dashboard_layout_v1_${user?.id ?? 'me'}`;

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
    { label: 'Projects', value: projOut, bg: 'bg-gradient-to-b from-[#2b8cff] to-[#0071e3]', fg: 'text-white' },
    { label: 'Business', value: bizOut, bg: 'bg-gradient-to-b from-[#3a3a40] to-[#1d1d1f]', fg: 'text-white' },
    { label: 'Salaries', value: salOut, bg: 'bg-gradient-to-b from-[#7d7bf0] to-[#5e5ce6]', fg: 'text-white' },
  ];

  return (
    <div className="lg:pt-3">

      {/* Greeting */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-4xl sm:text-5xl font-semibold text-[#1d1d1f] tracking-[-0.03em]">Welcome back, {first}</h1>
          <p className="text-sm text-[#6e6e73] mt-2">All amounts in {displayCurrency().code} · {period.label}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => { try { localStorage.removeItem(layoutStore); } catch { /* ignore */ } setLayoutKey(k => k + 1); }}
                title="Put widgets back in their original places"
                className="glass flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium text-[#1d1d1f] hover:!bg-white/80">
                <RotateCcw size={14} /> <span className="hidden sm:inline">Reset</span>
              </button>
              <button onClick={() => setEditing(false)}
                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-full text-sm font-semibold hover:bg-indigo-700 animate-pop">
                <Check size={15} /> Done
              </button>
            </>
          ) : (
          <>
          <button onClick={() => setEditing(true)} title="Rearrange widgets (or press and hold any widget)"
            className="glass flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium text-[#1d1d1f] hover:!bg-white/80">
            <LayoutGrid size={14} /> <span className="hidden sm:inline">Edit</span>
          </button>
          <button onClick={() => setShowFilters(v => !v)}
            className={`glass flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium ${showFilters ? '!bg-white/90 text-[#0071e3]' : 'text-[#1d1d1f] hover:!bg-white/80'}`}>
            <SlidersHorizontal size={14} /> <span className="hidden sm:inline">Filters</span>
            {period.from && <span className="w-2 h-2 rounded-full bg-[#0071e3]" />}
          </button>
          <button onClick={() => navigate('/expenses/new')}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-indigo-700">
            <Banknote size={15} /> <span className="hidden sm:inline">Record</span> Expense
          </button>
          </>
          )}
        </div>
      </div>

      {/* Period filters — hidden, not unmounted, so the picker keeps its state */}
      <div className={showFilters ? 'mt-4 animate-pop' : 'hidden'}><PeriodPicker onChange={range => setPeriod(range)} /></div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-white/70 border-t-[#0071e3] rounded-full animate-spin" />
        </div>
      ) : (<>
        {editing && (
          <p className="mt-4 text-sm text-[#6e6e73] animate-pop">
            Drag widgets to rearrange them{typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? ' (hold, or use the handle on top)' : ''}, and use <strong className="text-[#1d1d1f]">S · M · L · XL</strong> or the corner handle to resize. Tap <strong className="text-[#1d1d1f]">Done</strong> when finished.
          </p>
        )}
        <DashboardGrid key={layoutKey} storageKey={layoutStore} editing={editing} onEditingChange={setEditing} items={[
          { id: 'kpis', size: 4, sizes: [2, 4], node: (
        <div className="flex flex-wrap sm:flex-nowrap gap-2.5 w-full">
          <Pill label="Margin" value={`${marginPct.toFixed(0)}%`} tone="dark" grow={2} />
          <Pill label="Collected" value={`${collectedPct.toFixed(0)}%`} tone="blue" grow={2} />
          <Pill label="Spent of income" value={`${spendPct.toFixed(0)}%`} tone="stripe" pct={spendPct} grow={5} />
          <Pill label="Overdue" value={`${overduePct.toFixed(0)}%`} tone="white" grow={2} />
        </div>
          ) },
          { id: 'counts', size: 4, sizes: [2, 3, 4], node: (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <Big value={activeProjects} label="Active projects" icon={Flame} tint="bg-orange-500/12 text-orange-500" onClick={() => navigate('/projects')} />
          <Big value={unpaid.length} label="Unpaid invoices" icon={Receipt} tint="bg-[#0071e3]/10 text-[#0071e3]" onClick={() => navigate('/invoices')} />
          <Big value={projects.length} label="Projects" icon={Layers} tint="bg-[#5e5ce6]/10 text-[#5e5ce6]" onClick={() => navigate('/projects')} />
        </div>
          ) },
          { id: 'cash', size: 1, sizes: [1, 2], node: (
          <div className="glass-dark glass-lift relative overflow-hidden rounded-3xl p-6 min-h-[260px] h-full flex flex-col justify-between">
            <span aria-hidden className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[radial-gradient(closest-side,rgba(10,132,255,.55),transparent)]" />
            <span aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 w-64 h-64 rounded-full bg-[radial-gradient(closest-side,rgba(191,90,242,.32),transparent)]" />
            <div className="relative">
              <p className="text-sm text-white/70">Cash balance · as in Ledger</p>
              <p className={`text-4xl sm:text-5xl 2xl:text-[clamp(2rem,2.5vw,3rem)] font-light mt-2 tabular-nums tracking-tight ${cash < 0 ? 'text-rose-300' : ''}`}>{pkr(cash)}</p>
            </div>
            <div className="relative space-y-3">
              <div className="flex gap-2 flex-wrap">
                {Math.round(cashOpen) !== 0 && (
                  <span className="glass-chip px-3 py-1.5 rounded-full text-xs">● Opening {pkr(cashOpen)}</span>
                )}
                <span className="glass-chip px-3 py-1.5 rounded-full text-xs">▲ In {pkr(ledgerSummary ? cashIn : moneyIn)}</span>
                <span className="glass-chip px-3 py-1.5 rounded-full text-xs">▼ Out {pkr(ledgerSummary ? cashOut : moneyOut)}</span>
              </div>
              <div className="flex items-center justify-between rounded-full bg-gradient-to-b from-[#2b8cff] to-[#0071e3] text-white pl-4 pr-1.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_8px_20px_-8px_rgba(0,113,227,.7)]">
                <span className="text-sm font-medium whitespace-nowrap">To receive</span>
                <span className="bg-white/95 text-[#1d1d1f] text-sm font-semibold px-4 py-1.5 rounded-full shadow-[inset_0_1px_0_#fff]">{pkr(outstanding)}</span>
              </div>
            </div>
          </div>
          ) },
          { id: 'pl', size: 2, sizes: [2, 3, 4], node: <WarmPL rows={ledger} from={period.from} to={period.to} periodLabel={period.label} /> },
          { id: 'moneyOut', size: 1, sizes: [1, 2], node: (
          <div className={`${card} p-6 flex flex-col h-full`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl text-[#1d1d1f]">Money out</h2>
              <span className="text-2xl font-light text-[#1d1d1f]">{pkr(moneyOut)}</span>
            </div>
            {moneyOut > 0 ? (
              <>
                <div className="flex gap-1.5 mt-5">
                  {split.filter(s => s.value > 0).map(s => (
                    <div key={s.label} style={{ flex: s.value }} className="min-w-0">
                      <p className="text-[11px] text-[#6e6e73] mb-1">{Math.round((s.value / moneyOut) * 100)}%</p>
                      <div className={`h-12 rounded-2xl px-3 flex items-center text-xs font-medium ${s.bg} ${s.fg} overflow-hidden`}>
                        <span className="truncate">{s.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-2.5 text-sm">
                  {split.map(s => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[#515154]"><span className={`w-2.5 h-2.5 rounded-full ${s.bg}`} />{s.label}</span>
                      <span className="font-medium text-[#1d1d1f] tabular-nums">{pkr(s.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="flex-1 grid place-items-center text-sm text-[#86868b] py-8">No spending in this period</p>
            )}
          </div>
          ) },
          { id: 'projects', size: 2, sizes: [2, 3, 4], node: (
          <div className={`${card} p-5 sm:p-6 h-full`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl text-[#1d1d1f]">Projects</h2>
              <button onClick={() => navigate('/projects')}
                className="w-9 h-9 rounded-full border border-white/80 bg-white/70 shadow-[inset_0_1px_0_#fff,0_2px_6px_-2px_rgba(30,41,82,.15)] grid place-items-center text-[#1d1d1f] hover:!bg-[#0071e3] hover:text-white">
                <ArrowRight size={15} />
              </button>
            </div>
            {recentProjects.length === 0 ? (
              <p className="py-8 text-sm text-[#86868b] text-center">No projects yet</p>
            ) : (
              <>
                {/* Tablet / desktop: table */}
                <div className="hidden sm:block">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 pb-2 text-[11px] uppercase tracking-wider text-[#86868b]">
                    <span>Project</span><span className="text-right">Cost</span><span className="text-right">Received</span><span className="text-right">Profit</span>
                  </div>
                  <div className="space-y-1.5">
                    {recentProjects.map(p => {
                      const cost = parseFloat(p.fin_total_expense) || 0;
                      const rec  = parseFloat(p.fin_received) || 0;
                      const prof = rec - cost;
                      return (
                        <div key={p.id} onClick={() => navigate(`/projects?open=${p.id}`)}
                          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-3 py-2.5 rounded-2xl hover:bg-white/65 hover:shadow-[inset_0_1px_0_#fff,0_4px_14px_-8px_rgba(30,41,82,.25)] cursor-pointer text-sm transition-all duration-200">
                          <div className="min-w-0">
                            <p className="font-medium text-[#1d1d1f] truncate">{p.title}</p>
                            <p className="text-xs text-[#86868b] truncate">{p.client_name || 'No client'}{p.status === 'completed' ? ' · Completed' : ''}</p>
                          </div>
                          <span className="text-right text-[#515154]">{pkr(cost)}</span>
                          <span className="text-right text-[#515154]">{pkr(rec)}</span>
                          <span className={`text-right font-semibold ${prof >= 0 ? 'text-[#1d1d1f]' : 'text-rose-600'}`}>{pkr(prof)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 pt-3 mt-2 border-t border-white/70 text-sm font-semibold">
                    <span className="text-xs text-[#6e6e73] font-normal self-center">All {projects.length} projects</span>
                    <span className="text-right text-[#1d1d1f]">{pkr(projCost)}</span>
                    <span className="text-right text-[#1d1d1f]">{pkr(projRec)}</span>
                    <span className={`text-right ${projProfit >= 0 ? 'text-[#1d1d1f]' : 'text-rose-600'}`}>{pkr(projProfit)}</span>
                  </div>
                </div>

                {/* Phone: one card per project */}
                <div className="sm:hidden space-y-2">
                  {recentProjects.map(p => {
                    const cost = parseFloat(p.fin_total_expense) || 0;
                    const rec  = parseFloat(p.fin_received) || 0;
                    const prof = rec - cost;
                    return (
                      <div key={p.id} onClick={() => navigate(`/projects?open=${p.id}`)} className="rounded-2xl bg-white/55 border border-white/70 shadow-[inset_0_1px_0_#fff] px-3.5 py-3 cursor-pointer active:scale-[.98] transition-transform">
                        <p className="text-sm font-medium text-[#1d1d1f] truncate">{p.title}</p>
                        <p className="text-xs text-[#86868b] truncate">{p.client_name || 'No client'}{p.status === 'completed' ? ' · Completed' : ''}</p>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                          <div><p className="text-[#86868b]">Cost</p><p className="text-[#3a3a3f] font-medium truncate">{pkr(cost)}</p></div>
                          <div><p className="text-[#86868b]">Received</p><p className="text-[#3a3a3f] font-medium truncate">{pkr(rec)}</p></div>
                          <div><p className="text-[#86868b]">Profit</p><p className={`font-semibold truncate ${prof >= 0 ? 'text-[#1d1d1f]' : 'text-rose-600'}`}>{pkr(prof)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="rounded-2xl border border-white/70 px-3.5 py-3">
                    <p className="text-xs text-[#6e6e73]">All {projects.length} projects</p>
                    <div className="grid grid-cols-3 gap-2 mt-1.5 text-[11px]">
                      <p className="font-semibold text-[#1d1d1f] truncate">{pkr(projCost)}</p>
                      <p className="font-semibold text-[#1d1d1f] truncate">{pkr(projRec)}</p>
                      <p className={`font-semibold truncate ${projProfit >= 0 ? 'text-[#1d1d1f]' : 'text-rose-600'}`}>{pkr(projProfit)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          ) },
          { id: 'tasks', size: 1, sizes: [1, 2], node: <TasksWidget /> },
          { id: 'unpaid', size: 1, sizes: [1, 2], node: (
          <div className="glass-dark rounded-3xl p-6 h-full">
            <div className="flex items-center justify-between">
              <h2 className="text-xl">Unpaid invoices</h2>
              <span className="text-2xl font-light text-[#64d2ff]">{unpaid.length}</span>
            </div>
            {unpaid.length === 0 ? (
              <p className="py-10 text-sm text-white/50 text-center">Everything is paid</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {unpaid.slice(0, 5).map(i => {
                  const late = i.due_date && i.due_date < today;
                  return (
                    <div key={i.id} onClick={() => navigate(`/invoices?view=${i.id}`)} className="flex items-center gap-3 cursor-pointer group rounded-2xl -mx-2 px-2 py-1 hover:bg-white/[.06] transition-colors">
                      <div className="glass-chip w-10 h-10 rounded-full grid place-items-center flex-shrink-0 group-hover:bg-white/25 transition-colors">
                        <FileText size={16} className="text-white/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{i.client_name || i.number}</p>
                        <p className={`text-xs truncate ${late ? 'text-rose-300' : 'text-white/45'}`}>{i.number}{late ? ' · overdue' : ''}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#64d2ff] whitespace-nowrap">{money(i.balance, i.currency)}</span>
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
          ) },
        ]} />
      </>)}
    </div>
  );
}
