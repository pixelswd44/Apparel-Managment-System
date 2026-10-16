import { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Trophy, AlertTriangle, Layers } from 'lucide-react';

// Profit & Loss "command centre": neon bars (income vs expenses) with a profit line,
// animated count-up numbers, a margin gauge and quick insights. Pure SVG + CSS.

const pkr = n => `Rs${Math.round(Math.abs(n || 0)).toLocaleString('en-PK')}`;
const signed = n => `${n < 0 ? '−' : ''}${pkr(n)}`;
const short = n => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function niceScale(min, max, ticks = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

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
  let run = 0;
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(b => {
    const net = b.income - b.expense;
    run += net;
    return {
      ...b, net, cum: run,
      label: daily ? String(parseInt(b.key.slice(8), 10)) : `${MONTHS[parseInt(b.key.slice(5, 7), 10) - 1]}${days === Infinity ? ` ${b.key.slice(2, 4)}` : ''}`,
      full: daily
        ? new Date(b.key + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : `${MONTHS[parseInt(b.key.slice(5, 7), 10) - 1]} ${b.key.slice(0, 4)}`,
    };
  });
}

// Smoothly animates a number towards its target.
function useCountUp(target, ms = 1000) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf;
    const tick = t => {
      const p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e;
      setV(cur); from.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Counter({ value, signedValue = false }) {
  const v = useCountUp(value);
  return <>{signedValue ? signed(v) : pkr(v)}</>;
}

const CSS = `
@keyframes plGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes plDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes plFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes plPop  { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
@keyframes plPulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(3.2); opacity: 0; } }
@keyframes plScan { from { transform: translateX(-10%); } to { transform: translateX(110%); } }
@keyframes plBlink { 50% { opacity: .25; } }
.pl-bar  { transform-box: fill-box; transform-origin: 50% 100%; animation: plGrow .8s cubic-bezier(.2,.8,.2,1) both; }
.pl-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: plDraw 1.4s .35s ease-out forwards; }
.pl-area { animation: plFade 1s 1.2s ease-out both; }
.pl-dot  { transform-box: fill-box; transform-origin: center; animation: plPop .4s both; }
.pl-ping { transform-box: fill-box; transform-origin: center; animation: plPulse 1.8s 1.8s infinite ease-out; }
.pl-scan { animation: plScan 5s linear infinite; }
.pl-live { animation: plBlink 1.6s infinite; }
@media (prefers-reduced-motion: reduce) { .pl-bar,.pl-line,.pl-area,.pl-dot,.pl-ping,.pl-scan,.pl-live { animation: none !important; stroke-dashoffset: 0; } }
`;

function Gauge({ pct }) {
  const clamped = Math.max(-100, Math.min(100, pct));
  const good = clamped >= 0;
  const r = 34, c = 2 * Math.PI * r;
  const len = (Math.abs(clamped) / 100) * c;
  const color = good ? '#6366f1' : '#f43f5e';
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" className="flex-shrink-0">
      <circle cx="46" cy="46" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
      <circle key={pct} cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${len} ${c}`} transform="rotate(-90 46 46)"
        style={{ filter: `drop-shadow(0 2px 4px ${color}55)`, transition: 'stroke-dasharray 1s ease' }} />
      <text x="46" y="44" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">{pct.toFixed(0)}%</text>
      <text x="46" y="58" textAnchor="middle" fontSize="8" fill="#94a3b8" letterSpacing="1">MARGIN</text>
    </svg>
  );
}

export default function PLChart({ rows, from, to, periodLabel, className = '' }) {
  const wrap = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  const [mode, setMode] = useState('net'); // 'net' | 'cum'

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => bucketize(rows || [], from, to), [rows, from, to]);
  const income = data.reduce((s, b) => s + b.income, 0);
  const expense = data.reduce((s, b) => s + b.expense, 0);
  const net = income - expense;
  const margin = income > 0 ? (net / income) * 100 : 0;

  const best = data.length ? data.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const worst = data.length ? data.reduce((a, b) => (b.net < a.net ? b : a)) : null;
  const last = data[data.length - 1], prev = data[data.length - 2];
  const trend = last && prev && prev.net !== 0 ? ((last.net - prev.net) / Math.abs(prev.net)) * 100 : null;
  const unit = data.length && data[0].key.length === 10 ? 'day' : 'month';
  const lossCount = data.filter(b => b.net < 0).length;

  const small = w < 480;
  const H = small ? 250 : 320;
  const m = { t: 18, r: 14, b: 30, l: small ? 40 : 54 };
  const iw = w - m.l - m.r, ih = H - m.t - m.b;
  const series = data.map(b => (mode === 'cum' ? b.cum : b.net));

  const minV = Math.min(0, ...series);
  const maxV = Math.max(0, ...series, ...data.map(b => Math.max(b.income, b.expense)));
  const ticks = niceScale(minV, maxV);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = v => m.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const slot = data.length ? iw / data.length : iw;
  const bw = Math.max(2, Math.min(26, slot * 0.34));
  const cx = i => m.l + slot * i + slot / 2;
  const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 36)));

  const pts = series.map((v, i) => [cx(i), y(v)]);
  const line = pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${y(0).toFixed(1)} L${pts[0][0].toFixed(1)},${y(0).toFixed(1)} Z` : '';
  const animKey = `${data.length}-${Math.round(income)}-${Math.round(expense)}-${mode}`;
  const hb = hover !== null ? data[hover] : null;
  const positive = net >= 0;

  const insight = (Icon, label, value, sub, tone) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 min-w-0">
      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${tone}`}><Icon size={11} /> {label}</div>
      <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{value}</p>
      <p className="text-[11px] text-slate-500 truncate">{sub}</p>
    </div>
  );

  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 sm:p-6 bg-white text-slate-900 border border-slate-200 shadow-sm ${className}`}
      style={{ background: 'radial-gradient(900px 300px at 0% -20%, rgba(99,102,241,.08), transparent 60%), radial-gradient(700px 300px at 100% 120%, rgba(16,185,129,.07), transparent 60%), #fff' }}>
      <style>{CSS}</style>
      {/* faint grid + scanning light */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{ backgroundImage: 'linear-gradient(#0f172a 1px,transparent 1px),linear-gradient(90deg,#0f172a 1px,transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="pl-scan absolute inset-y-0 w-1/3 pointer-events-none"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(99,102,241,.07),transparent)' }} />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.25em] text-indigo-600">
              <span className="pl-live w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]" /> PROFIT &amp; LOSS
            </div>
            <p className="text-xs text-slate-500 mt-1">{periodLabel || 'All time'} · per {unit}</p>
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-semibold">
            {[['net', 'Per ' + unit], ['cum', 'Cumulative']].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-3 py-1.5 rounded-lg transition-all ${mode === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Hero numbers */}
        <div className="flex items-center gap-4 sm:gap-6 mt-4 flex-wrap">
          <Gauge pct={margin} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{positive ? 'Net profit' : 'Net loss'}</p>
            <p className={`text-3xl sm:text-4xl font-black tabular-nums leading-tight ${positive ? 'text-indigo-600' : 'text-rose-600'}`}>
              <Counter value={net} signedValue />
            </p>
            <div className="flex gap-5 mt-1.5 text-sm flex-wrap">
              <span className="text-emerald-600 font-semibold tabular-nums">▲ <Counter value={income} /> <span className="text-slate-400 font-normal text-xs">in</span></span>
              <span className="text-rose-600 font-semibold tabular-nums">▼ <Counter value={expense} /> <span className="text-slate-500 font-normal text-xs">out</span></span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div ref={wrap} className="relative w-full mt-4">
          {data.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No income or expenses in this period.</p>
          ) : (
            <>
              <svg width={w} height={H} className="block select-none overflow-visible" onMouseLeave={() => setHover(null)}>
                <defs>
                  <linearGradient id="plIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#10b981" stopOpacity=".75" /></linearGradient>
                  <linearGradient id="plOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb7185" /><stop offset="100%" stopColor="#f43f5e" stopOpacity=".75" /></linearGradient>
                  <linearGradient id="plArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity=".22" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient>
                  <filter id="plGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {lo < 0 && <rect x={m.l} y={y(0)} width={iw} height={y(lo) - y(0)} fill="#fb7185" opacity=".07" />}

                {ticks.map(t => (
                  <g key={t}>
                    <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#94a3b8' : '#e2e8f0'} strokeDasharray={t === 0 ? '' : '2 5'} />
                    <text x={m.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">{t < 0 ? '−' : ''}{short(Math.abs(t))}</text>
                  </g>
                ))}

                <g key={animKey}>
                  {data.map((b, i) => (
                    <g key={b.key}>
                      {hover === i && (
                        <>
                          <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="#6366f1" opacity=".06" rx="6" />
                          <line x1={cx(i)} x2={cx(i)} y1={m.t} y2={m.t + ih} stroke="#6366f1" strokeOpacity=".45" strokeDasharray="3 4" />
                        </>
                      )}
                      <rect className="pl-bar" style={{ animationDelay: `${i * 55}ms` }} x={cx(i) - bw - 1} y={y(b.income)} width={bw}
                        height={Math.max(0, y(0) - y(b.income))} rx={Math.min(4, bw / 2)} fill="url(#plIn)" />
                      <rect className="pl-bar" style={{ animationDelay: `${i * 55 + 90}ms` }} x={cx(i) + 1} y={y(b.expense)} width={bw}
                        height={Math.max(0, y(0) - y(b.expense))} rx={Math.min(4, bw / 2)} fill="url(#plOut)" />
                      {i % every === 0 && <text x={cx(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">{b.label}</text>}
                    </g>
                  ))}

                  {area && <path className="pl-area" d={area} fill="url(#plArea)" />}
                  {data.length > 1 && (
                    <path className="pl-line" pathLength="1" d={line} fill="none" stroke="#6366f1" strokeWidth="2.6"
                      strokeLinejoin="round" strokeLinecap="round" filter="url(#plGlow)" />
                  )}
                  {pts.map(([x, yy], i) => {
                    const isLast = i === pts.length - 1;
                    return (
                      <g key={i}>
                        {isLast && <circle className="pl-ping" cx={x} cy={yy} r="5" fill="#6366f1" />}
                        <circle className="pl-dot" style={{ animationDelay: `${900 + i * 40}ms` }} cx={x} cy={yy}
                          r={hover === i ? 5.5 : isLast ? 4.5 : data.length > 18 ? 0 : 3.5} fill="#fff" stroke="#6366f1" strokeWidth="2" />
                      </g>
                    );
                  })}
                </g>

                {data.map((b, i) => (
                  <rect key={`h${i}`} x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)} onClick={() => setHover(i)} />
                ))}
              </svg>

              {hb && (
                <div className="absolute z-10 pointer-events-none rounded-xl px-3 py-2.5 text-xs space-y-0.5 bg-white text-slate-700 border border-slate-200 shadow-lg"
                  style={{ top: 0, left: Math.min(Math.max(cx(hover) - 85, 0), w - 180), width: 170 }}>
                  <p className="font-bold text-indigo-600 mb-1">{hb.full}</p>
                  <p className="flex justify-between"><span className="text-emerald-600">Income</span><span>{pkr(hb.income)}</span></p>
                  <p className="flex justify-between"><span className="text-rose-600">Expenses</span><span>{pkr(hb.expense)}</span></p>
                  <p className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-bold">
                    <span>{hb.net >= 0 ? 'Profit' : 'Loss'}</span><span className={hb.net >= 0 ? 'text-indigo-600' : 'text-rose-600'}>{signed(hb.net)}</span>
                  </p>
                  {mode === 'cum' && <p className="flex justify-between text-slate-500"><span>Running total</span><span>{signed(hb.cum)}</span></p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Expenses</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-indigo-500" /> {mode === 'cum' ? 'Running profit' : 'Net profit'}</span>
        </div>

        {/* Insights */}
        {data.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
            {insight(Trophy, `Best ${unit}`, best ? `${best.full}` : '—', best ? `${signed(best.net)} net` : '', 'text-emerald-600')}
            {insight(AlertTriangle, `Toughest ${unit}`, worst ? `${worst.full}` : '—', worst ? `${signed(worst.net)} net` : '', 'text-rose-600')}
            {insight(trend === null || trend >= 0 ? ArrowUpRight : ArrowDownRight, 'Latest trend',
              trend === null ? '—' : `${trend >= 0 ? '+' : '−'}${Math.min(999, Math.abs(trend)).toFixed(0)}%`,
              prev ? `vs previous ${unit}` : 'need 2+ periods', trend === null || trend >= 0 ? 'text-indigo-600' : 'text-rose-600')}
            {insight(lossCount ? Activity : Layers, 'Loss periods', `${lossCount} of ${data.length}`,
              lossCount ? `${unit}s in the red` : 'all in profit', lossCount ? 'text-amber-600' : 'text-indigo-600')}
          </div>
        )}
      </div>
    </div>
  );
}
