import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

// ── Quarter metadata ──────────────────────────────────────────────────────────
export const QUARTERS = [
  { key: 'Q1', label: 'Q1', months: 'Jan – Mar', from: '-01-01', to: '-03-31' },
  { key: 'Q2', label: 'Q2', months: 'Apr – Jun', from: '-04-01', to: '-06-30' },
  { key: 'Q3', label: 'Q3', months: 'Jul – Sep', from: '-07-01', to: '-09-30' },
  { key: 'Q4', label: 'Q4', months: 'Oct – Dec', from: '-10-01', to: '-12-31' },
];

export function calcRange(period, year) {
  if (!period || period === 'all') return { from: null, to: null, label: 'All Time' };
  const q = QUARTERS.find(q => q.key === period);
  if (!q) return { from: null, to: null, label: 'All Time' };
  return {
    from:  `${year}${q.from}`,
    to:    `${year}${q.to}`,
    label: `${q.key} ${year}  ·  ${q.months}`,
    quarter: period,
    year,
  };
}

// Returns the current calendar quarter key e.g. 'Q2'
function currentQ() {
  return `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
}

// ── PeriodPicker ─────────────────────────────────────────────────────────────
// Props:
//   onChange({ from, to, label }) — called whenever the selection changes
//
// Usage:
//   const [range, setRange] = useState({ from: null, to: null, label: 'All Time' });
//   <PeriodPicker onChange={setRange} />
// ─────────────────────────────────────────────────────────────────────────────
export default function PeriodPicker({ onChange }) {
  const now        = new Date();
  const thisYear   = now.getFullYear();
  const thisQ      = currentQ();

  const [period, setPeriod] = useState('all');
  const [year,   setYear]   = useState(thisYear);

  function select(p, y = year) {
    setPeriod(p);
    onChange(calcRange(p, y));
  }

  function shiftYear(delta) {
    const newY = Math.min(year + delta, thisYear);
    setYear(newY);
    if (period !== 'all') onChange(calcRange(period, newY));
  }

  const btnBase = 'px-3 py-1.5 text-xs rounded-lg font-semibold transition-all';
  const active  = 'bg-indigo-600 text-white shadow-sm';
  const inactive = 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50';
  const thisQCls = 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-200';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All Time button */}
      <button
        onClick={() => select('all')}
        className={`${btnBase} border ${period === 'all'
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}
      >
        All Time
      </button>

      {/* Year + Quarter selector */}
      <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden divide-x divide-slate-100">
        {/* Year arrows */}
        <button
          onClick={() => shiftYear(-1)}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="px-2.5 text-xs font-bold text-slate-700 select-none">{year}</span>
        <button
          onClick={() => shiftYear(1)}
          disabled={year >= thisYear}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={13} />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 mx-0" />

        {/* Q1 – Q4 buttons */}
        {QUARTERS.map(q => {
          const isActive  = period === q.key;
          const isCurrent = q.key === thisQ && year === thisYear;
          return (
            <button
              key={q.key}
              onClick={() => select(q.key)}
              title={`${q.key} ${year}  (${q.months})`}
              className={`px-3 py-1.5 text-xs font-bold transition-all select-none
                ${isActive  ? active  : isCurrent ? thisQCls : inactive}`}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      {/* Active period label */}
      {period !== 'all' && (
        <span className="flex items-center gap-1 text-2xs text-indigo-600 font-medium bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1">
          <CalendarDays size={11} />
          {QUARTERS.find(q => q.key === period)?.months}  {year}
        </span>
      )}
    </div>
  );
}
