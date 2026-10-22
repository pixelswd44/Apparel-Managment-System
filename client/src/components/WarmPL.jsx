import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Trophy } from 'lucide-react';
import { pkr, pkrShort as short } from '../lib/currency';

// Dashboard "Profit & Loss" card on glass: smooth income (blue) and expense
// (orange) curves per day/month with a scrubbing glass tooltip, and a "profit
// pulse" strip underneath — one bar per period, up for profit, down for loss.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const W = 1000, H = 200, PAD_T = 14, PAD_B = 6; // chart viewBox; curves use preserveAspectRatio="none"
const PULSE = 22; // px each way from the pulse baseline

function bucketize(rows, from, to) {
  const days = from && to ? Math.round((new Date(to) - new Date(from)) / 864e5) + 1 : Infinity;
  const daily = days <= 35;
  const map = new Map();
  for (const e of rows) {
    if (e.isOpeningBalance) continue;
    const d = String(e.date || '').replace(' ', 'T').split('T')[0];
    if (!d) continue;
    const key = daily ? d : d.slice(0, 7);
    const b = map.get(key) || { key, income: 0, expense: 0 };
    b.income += e.credit || 0;
    b.expense += e.debit || 0;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(b => ({
    ...b, net: b.income - b.expense,
    label: daily ? String(parseInt(b.key.slice(8), 10)) : `${MONTHS[parseInt(b.key.slice(5, 7), 10) - 1]}${days === Infinity ? ` ${b.key.slice(2, 4)}` : ''}`,
    full: daily
      ? new Date(b.key + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : `${MONTHS[parseInt(b.key.slice(5, 7), 10) - 1]} ${b.key.slice(0, 4)}`,
  }));
}

// Smooth curve through the points (Catmull-Rom → cubic Bézier), kept inside the chart
function smooth(pts) {
  if (pts.length === 1) return `M0,${pts[0][1]} L${W},${pts[0][1]}`;
  const lo = PAD_T, hi = H - PAD_B;
  const cy = y => Math.max(lo, Math.min(hi, y));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cy(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, cy(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const CSS = `
@keyframes wpDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes wpFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes wpGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.wp-line { stroke-dasharray: 1; animation: wpDraw 1.2s cubic-bezier(.65,0,.35,1) both; }
.wp-area { animation: wpFade 1s .35s ease both; }
.wp-pulse { animation: wpGrow .7s cubic-bezier(.34,1.3,.64,1) both; }
@media (prefers-reduced-motion: reduce) { .wp-line, .wp-area, .wp-pulse { animation: none; } }
`;

export default function WarmPL({ rows, from, to, periodLabel }) {
  const [hover, setHover] = useState(null);
  const data = useMemo(() => bucketize(rows || [], from, to), [rows, from, to]);
  const income = data.reduce((s, b) => s + b.income, 0);
  const expense = data.reduce((s, b) => s + b.expense, 0);
  const net = income - expense;
  const unit = data.length && data[0].key.length === 10 ? 'day' : 'month';
  const max = Math.max(1, ...data.map(b => Math.max(b.income, b.expense))) * 1.08;
  const maxNet = Math.max(1, ...data.map(b => Math.abs(b.net)));
  const bestIdx = data.length ? data.reduce((bi, b, i, arr) => (b.net > arr[bi].net ? i : bi), 0) : -1;
  const show = hover !== null ? hover : bestIdx;
  const sb = data[show];
  const key = `${data.length}-${Math.round(income)}-${Math.round(expense)}`;

  // x as a % of the width (columns centred), y in viewBox units
  const n = data.length;
  const xPct = i => (n === 1 ? 50 : ((i + 0.5) / n) * 100);
  const y = v => H - PAD_B - (v / max) * (H - PAD_T - PAD_B);
  const pts = field => data.map((b, i) => [(xPct(i) / 100) * W, y(b[field])]);
  const inLine = n ? smooth(pts('income')) : '';
  const outLine = n ? smooth(pts('expense')) : '';
  const area = line => `${line} L${n === 1 ? W : (xPct(n - 1) / 100) * W},${H} L${n === 1 ? 0 : (xPct(0) / 100) * W},${H} Z`;
  const yPct = v => (y(v) / H) * 100;
  // Show at most ~12 axis labels
  const every = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="h-full glass rounded-3xl p-6 flex flex-col">
      <style>{CSS}</style>

      {/* Header: net for the period, then income / expenses / best period */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl text-[#1d1d1f]">Profit &amp; Loss</h2>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className={`text-4xl font-light tabular-nums tracking-tight ${net >= 0 ? 'text-[#1d1d1f]' : 'text-rose-600'}`}>{pkr(net)}</span>
            <span className="text-xs text-[#86868b] leading-tight">{net >= 0 ? 'profit' : 'loss'} · {periodLabel || 'all time'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0071e3]/10 text-[#0058b0] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#0071e3]" /> In {short(income)}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ff9f0a]/12 text-[#b25f00] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#ff9f0a]" /> Out {short(expense)}
          </span>
          {bestIdx >= 0 && data[bestIdx].net > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#34c759]/12 text-[#248a3d] font-medium">
              <Trophy size={12} /> Best {data[bestIdx].label} · {short(data[bestIdx].net)}
            </span>
          )}
        </div>
      </div>

      {n === 0 ? (
        <p className="flex-1 grid place-items-center text-sm text-[#86868b] py-10">No income or expenses in this period.</p>
      ) : (
        <div key={key} className="mt-5 flex-1 flex flex-col justify-end select-none">
          {/* Curves + scrubber */}
          <div className="relative h-[200px]" onMouseLeave={() => setHover(null)}>
            {/* Soft grid */}
            {[0.25, 0.5, 0.75].map(g => (
              <span key={g} className="absolute inset-x-0 border-t border-dashed border-black/[.06]" style={{ top: `${g * 100}%` }} />
            ))}
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
              <defs>
                <linearGradient id="wp-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0a84ff" stopOpacity=".32" />
                  <stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="wp-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff9f0a" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#ff9f0a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="wp-area" d={area(inLine)} fill="url(#wp-in)" />
              <path className="wp-area" d={area(outLine)} fill="url(#wp-out)" />
              <path className="wp-line" pathLength="1" d={outLine} fill="none" stroke="#ff9f0a" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path className="wp-line" pathLength="1" d={inLine} fill="none" stroke="#0a84ff" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Scrub line, dots and glass tooltip for the active period */}
            {sb && (
              <>
                <span className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#1d1d1f]/20 to-transparent pointer-events-none transition-[left] duration-200"
                  style={{ left: `${xPct(show)}%` }} />
                {[['income', '#0a84ff'], ['expense', '#ff9f0a']].map(([f, c]) => (
                  <span key={f} className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,.18)] pointer-events-none transition-[left,top] duration-200"
                    style={{ left: `${xPct(show)}%`, top: `${yPct(sb[f])}%`, background: c }} />
                ))}
                <div className={`absolute top-0 z-10 pointer-events-none transition-[left] duration-200 ${xPct(show) > 60 ? '-translate-x-[calc(100%+14px)]' : 'translate-x-[14px]'}`}
                  style={{ left: `${xPct(show)}%` }}>
                  <div className="glass-strong !bg-white/85 rounded-2xl px-3.5 py-2.5 min-w-[11rem] shadow-lg">
                    <p className="text-[11px] font-semibold text-[#1d1d1f] flex items-center justify-between gap-3">
                      {sb.full}
                      {hover === null && <span className="text-[10px] font-medium text-[#248a3d]">best {unit}</span>}
                    </p>
                    <div className="mt-1.5 space-y-1 text-[11px] tabular-nums">
                      <p className="flex justify-between gap-4 text-[#515154]"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]" />In</span>{pkr(sb.income)}</p>
                      <p className="flex justify-between gap-4 text-[#515154]"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a]" />Out</span>{pkr(sb.expense)}</p>
                    </div>
                    <p className={`mt-1.5 pt-1.5 border-t border-black/[.06] text-xs font-semibold flex items-center justify-between gap-4 tabular-nums ${sb.net >= 0 ? 'text-[#248a3d]' : 'text-rose-600'}`}>
                      <span className="flex items-center gap-1">{sb.net >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{sb.net >= 0 ? 'Profit' : 'Loss'}</span>
                      {pkr(sb.net)}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Hover / tap columns */}
            <div className="absolute inset-0 flex">
              {data.map((b, i) => (
                <div key={b.key} className="flex-1 h-full cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              ))}
            </div>
          </div>

          {/* Profit pulse: one bar per period, up for profit, down for loss */}
          <div className="relative mt-3 flex" style={{ height: PULSE * 2 }}>
            <span className="absolute inset-x-0 top-1/2 border-t border-black/[.07]" />
            {data.map((b, i) => {
              // Square-root scale so small months still read next to a huge one
              const h = Math.max(4, Math.sqrt(Math.abs(b.net) / maxNet) * PULSE);
              const up = b.net >= 0;
              const active = i === show;
              return (
                <div key={b.key} className="flex-1 relative cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                  <span className={`wp-pulse absolute left-1/2 -translate-x-1/2 w-[min(14px,60%)] rounded-full transition-opacity ${
                      up ? 'bg-gradient-to-t from-[#34c759] to-[#7ee08f]' : 'bg-gradient-to-b from-[#ff453a] to-[#ff8a80]'}`}
                    style={{
                      height: h, opacity: active || hover === null ? 1 : 0.45,
                      ...(up ? { bottom: '50%', transformOrigin: '50% 100%' } : { top: '50%', transformOrigin: '50% 0%' }),
                      animationDelay: `${0.5 + i * 0.04}s`,
                    }} />
                </div>
              );
            })}
          </div>

          {/* Axis labels */}
          <div className="mt-1 flex">
            {data.map((b, i) => (
              <span key={b.key} className={`flex-1 text-center text-[11px] whitespace-nowrap ${i === show ? 'text-[#1d1d1f] font-semibold' : 'text-[#86868b]'} ${
                  n > 6 && (i / every) % 2 === 1 && i !== show ? 'max-sm:invisible' : ''}`}>
                {i % every === 0 || i === show ? b.label : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
