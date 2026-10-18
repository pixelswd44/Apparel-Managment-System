import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { pkr, pkrShort as short } from '../lib/currency';

// Dashboard "Profit & Loss" card in the warm theme: thin pill bars per day/month —
// charcoal for income, yellow for expenses — with the best period highlighted.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const CSS = `
@keyframes wpGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.wp-bar { transform-origin: 50% 100%; animation: wpGrow .8s cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .wp-bar { animation: none; } }
`;

export default function WarmPL({ rows, from, to, periodLabel }) {
  const [hover, setHover] = useState(null);
  const data = useMemo(() => bucketize(rows || [], from, to), [rows, from, to]);
  const income = data.reduce((s, b) => s + b.income, 0);
  const expense = data.reduce((s, b) => s + b.expense, 0);
  const net = income - expense;
  const unit = data.length && data[0].key.length === 10 ? 'day' : 'month';
  const max = Math.max(1, ...data.map(b => Math.max(b.income, b.expense)));
  const bestIdx = data.length ? data.reduce((bi, b, i, arr) => (b.net > arr[bi].net ? i : bi), 0) : -1;
  const show = hover !== null ? hover : bestIdx;
  const sb = data[show];
  const H = 170;
  const key = `${data.length}-${Math.round(income)}-${Math.round(expense)}`;

  return (
    <div className="h-full rounded-xl bg-white/85 border border-white shadow-[0_10px_40px_-18px_rgba(120,90,20,.25)] p-6 flex flex-col">
      <style>{CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-[#232323]">Profit &amp; Loss</h2>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className={`text-4xl font-light tabular-nums ${net >= 0 ? 'text-[#232323]' : 'text-rose-600'}`}>{pkr(net)}</span>
            <span className="text-xs text-[#8a8372] leading-tight">net · {periodLabel || 'all time'}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-xs text-[#6f6a5d] flex-shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" /> Income {short(income)}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#f9c846]" /> Expenses {short(expense)}</span>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="flex-1 grid place-items-center text-sm text-[#a39b86] py-10">No income or expenses in this period.</p>
      ) : (
        <div className="mt-5 flex-1 flex flex-col justify-end" onMouseLeave={() => setHover(null)}>
          <div key={key} className="relative flex items-end gap-1 sm:gap-2" style={{ height: H + 34 }}>
            {data.map((b, i) => {
              const active = i === show;
              return (
                <div key={b.key} className="relative flex-1 min-w-0 flex flex-col items-center justify-end h-full cursor-pointer"
                  onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                  {active && sb && (
                    <span className="absolute z-10 whitespace-nowrap text-[11px] font-medium bg-[#f9c846] text-[#232323] px-2 py-0.5 rounded-full shadow-sm"
                      style={{ bottom: Math.max(b.income, b.expense) / max * H + 28 }}>
                      {pkr(b.net)}
                    </span>
                  )}
                  <div className="flex items-end gap-[3px]" style={{ height: H }}>
                    <div className="wp-bar rounded-full" style={{ width: 7, height: Math.max(4, b.income / max * H), background: active ? '#f9c846' : '#2a2a2a', animationDelay: `${i * 45}ms`, opacity: active || hover === null ? 1 : .55 }} />
                    <div className="wp-bar rounded-full" style={{ width: 7, height: Math.max(4, b.expense / max * H), background: active ? '#2a2a2a' : '#f9c846', animationDelay: `${i * 45 + 70}ms`, opacity: active || hover === null ? 1 : .55 }} />
                  </div>
                  <span className={`mt-2 text-[11px] ${active ? 'text-[#232323] font-semibold' : 'text-[#a39b86]'}`}>{b.label}</span>
                </div>
              );
            })}
          </div>
          {sb && (
            <div className="mt-3 pt-3 border-t border-[#f1e8d2] flex items-center justify-between gap-3 text-xs text-[#6f6a5d] flex-wrap">
              <span className="font-medium text-[#232323]">{sb.full}</span>
              <span>In {pkr(sb.income)}</span>
              <span>Out {pkr(sb.expense)}</span>
              <span className={`flex items-center gap-1 font-semibold ${sb.net >= 0 ? 'text-[#232323]' : 'text-rose-600'}`}>
                {sb.net >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{sb.net >= 0 ? 'Profit' : 'Loss'} {pkr(sb.net)}
              </span>
              {hover === null && <span className="text-[#a39b86]">best {unit}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
