import { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Sparkles, HandCoins, Flame, AlertCircle } from 'lucide-react';
import { pkr, pkrShort, displayCurrency } from '../lib/currency';

// Dashboard top row: five glass stat cards. Money in / out / profit carry a small
// monthly trend line built from the Ledger rows; To receive and Projects say what
// needs attention. Lays out by the widget's own width (container queries), so it
// works at full and half size on the dashboard grid.

const MONTHS = 8; // trend length

// Full amount on roomy cards, "₨26.1M" when the card is narrow (phones, half-size widget)
const Amount = ({ v }) => (
  <>
    <span className="hidden @[13rem]/card:inline">{pkr(v)}</span>
    <span className="@[13rem]/card:hidden" title={pkr(v)}>{v < 0 ? '−' : ''}{displayCurrency().symbol}{pkrShort(Math.abs(v))}</span>
  </>
);

function monthly(rows) {
  const map = new Map();
  for (const e of rows || []) {
    if (e.isOpeningBalance) continue;
    const m = String(e.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const b = map.get(m) || { in: 0, out: 0 };
    b.in += e.credit || 0;
    b.out += e.debit || 0;
    map.set(m, b);
  }
  const keys = [...map.keys()].sort().slice(-MONTHS);
  return keys.map(k => ({ ...map.get(k), net: map.get(k).in - map.get(k).out }));
}

function Spark({ values, color, id }) {
  if (values.length < 2) return <span className="block h-8" />;
  const min = Math.min(0, ...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 26 - ((v - min) / span) * 22]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-8 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,30 L0,30 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.6" fill={color} stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ dark, icon: Icon, tint, label, value, valueTone = '', foot, children, onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick}
      className={`@container/card ${dark ? 'glass-dark text-white' : 'glass text-[#1d1d1f]'} glass-lift relative overflow-hidden rounded-3xl p-4 text-left flex flex-col min-w-0 ${className}`}>
      {dark && <span aria-hidden className="pointer-events-none absolute -top-16 -right-12 w-44 h-44 rounded-full bg-[radial-gradient(closest-side,rgba(10,132,255,.5),transparent)]" />}
      <span className="relative flex items-center gap-2 min-w-0">
        <span className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,.5)] ${tint}`}><Icon size={15} /></span>
        <span className={`text-xs font-medium truncate ${dark ? 'text-white/70' : 'text-[#6e6e73]'}`}>{label}</span>
      </span>
      <span className={`relative mt-3 text-[1.6rem] leading-none font-light tabular-nums tracking-tight truncate ${valueTone}`}>{value}</span>
      <span className="relative mt-auto pt-3 block">{children}</span>
      {foot && <span className={`relative mt-1.5 text-[11px] leading-tight truncate ${dark ? 'text-white/60' : 'text-[#86868b]'}`}>{foot}</span>}
    </button>
  );
}

export default function StatCards({ moneyIn, moneyOut, net, outstanding, unpaidCount, overdueCount, activeProjects, totalProjects, ledgerRows, navigate }) {
  const trend = useMemo(() => monthly(ledgerRows), [ledgerRows]);
  const keptPct = moneyIn > 0 ? Math.round((net / moneyIn) * 100) : null;
  const doneProjects = Math.max(0, totalProjects - activeProjects);

  return (
    <div className="@container">
      <div className="grid grid-cols-2 @2xl:grid-cols-6 @5xl:grid-cols-5 gap-2.5 sm:gap-3">
        <Card icon={ArrowDownLeft} tint="bg-[#34c759]/15 text-[#248a3d]" label="Money in" value={<Amount v={moneyIn} />}
          foot="Payments + other income" onClick={() => navigate('/ledger')}
          className="@2xl:col-span-2 @5xl:col-span-1">
          <Spark id="spark-in" values={trend.map(b => b.in)} color="#34c759" />
        </Card>

        <Card icon={ArrowUpRight} tint="bg-orange-500/12 text-orange-500" label="Money out" value={<Amount v={moneyOut} />}
          foot="Projects, business & salaries" onClick={() => navigate('/expenses')}
          className="@2xl:col-span-2 @5xl:col-span-1">
          <Spark id="spark-out" values={trend.map(b => b.out)} color="#ff9500" />
        </Card>

        <Card dark icon={Sparkles} tint="bg-white/15 text-white" label="Profit" value={<Amount v={net} />}
          valueTone={net < 0 ? 'text-rose-300' : ''}
          foot={keptPct === null ? 'Money in − money out' : net >= 0 ? `You kept ${keptPct}% of money in` : 'Spent more than came in'}
          onClick={() => navigate('/ledger')}
          className="col-span-2 @2xl:col-span-2 @5xl:col-span-1">
          <Spark id="spark-net" values={trend.map(b => b.net)} color="#64d2ff" />
        </Card>

        <Card icon={HandCoins} tint="bg-[#0071e3]/10 text-[#0071e3]" label="To receive" value={<Amount v={outstanding} />}
          onClick={() => navigate('/invoices')} className="@2xl:col-span-3 @5xl:col-span-1">
          <span className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/[.05] text-[#515154]">
              {unpaidCount} unpaid invoice{unpaidCount === 1 ? '' : 's'}
            </span>
            {overdueCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 flex items-center gap-1">
                <AlertCircle size={10} /> {overdueCount} overdue
              </span>
            )}
          </span>
        </Card>

        <Card icon={Flame} tint="bg-[#5e5ce6]/10 text-[#5e5ce6]" label="Active projects" value={activeProjects}
          foot={`${doneProjects} completed · ${totalProjects} in total`}
          onClick={() => navigate('/projects')} className="@2xl:col-span-3 @5xl:col-span-1">
          {totalProjects > 0 && (
            <span className="block h-1.5 rounded-full bg-black/[.06] overflow-hidden">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#7d7bf0] to-[#5e5ce6]"
                style={{ width: `${Math.max(4, (activeProjects / totalProjects) * 100)}%` }} />
            </span>
          )}
        </Card>
      </div>
    </div>
  );
}
