import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Calendar, X } from 'lucide-react';

// ── Quarter metadata ──────────────────────────────────────────────────────────
export const QUARTERS = [
  { key: 'Q1', label: 'Q1', months: 'Jan – Mar', from: '-01-01', to: '-03-31' },
  { key: 'Q2', label: 'Q2', months: 'Apr – Jun', from: '-04-01', to: '-06-30' },
  { key: 'Q3', label: 'Q3', months: 'Jul – Sep', from: '-07-01', to: '-09-30' },
  { key: 'Q4', label: 'Q4', months: 'Oct – Dec', from: '-10-01', to: '-12-31' },
];

const MONTHS = [
  { idx: 1,  label: 'Jan', full: 'January'   },
  { idx: 2,  label: 'Feb', full: 'February'  },
  { idx: 3,  label: 'Mar', full: 'March'     },
  { idx: 4,  label: 'Apr', full: 'April'     },
  { idx: 5,  label: 'May', full: 'May'       },
  { idx: 6,  label: 'Jun', full: 'June'      },
  { idx: 7,  label: 'Jul', full: 'July'      },
  { idx: 8,  label: 'Aug', full: 'August'    },
  { idx: 9,  label: 'Sep', full: 'September' },
  { idx: 10, label: 'Oct', full: 'October'   },
  { idx: 11, label: 'Nov', full: 'November'  },
  { idx: 12, label: 'Dec', full: 'December'  },
];

// Days in a month
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Pad to YYYY-MM-DD
function pad(n) { return String(n).padStart(2, '0'); }

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

function currentQ() {
  return `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
}

// Range for the current calendar month — used as the Ledger's default period.
export function currentMonthRange() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const days  = daysInMonth(year, month);
  const label = `${MONTHS[month - 1].full} ${year}`;
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(days)}`, label };
}

// ── PeriodPicker ─────────────────────────────────────────────────────────────
export default function PeriodPicker({ onChange, defaultMode = 'all' }) {
  const now      = new Date();
  const thisYear = now.getFullYear();
  const thisQ    = currentQ();
  const thisMonth = now.getMonth() + 1;

  // mode: 'all' | 'quarter' | 'month' | 'custom'
  const [mode,      setMode]      = useState(defaultMode === 'month' ? 'month' : 'all');
  const [year,      setYear]      = useState(thisYear);
  const [period,    setPeriod]    = useState('all');   // quarter key
  const [selMonth,  setSelMonth]  = useState(defaultMode === 'month' ? thisMonth : null);    // 1-12
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [showCustom, setShowCustom] = useState(false);

  function selectAll() {
    setMode('all'); setPeriod('all'); setSelMonth(null);
    setShowCustom(false);
    onChange({ from: null, to: null, label: 'All Time' });
  }

  function selectQuarter(q, y = year) {
    setMode('quarter'); setPeriod(q); setSelMonth(null); setShowCustom(false);
    onChange(calcRange(q, y));
  }

  function selectMonth(m, y = year) {
    setMode('month'); setSelMonth(m); setPeriod('all'); setShowCustom(false);
    const days = daysInMonth(y, m);
    const label = `${MONTHS[m - 1].full} ${y}`;
    onChange({ from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(days)}`, label });
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const label = `${customFrom} → ${customTo}`;
    setMode('custom'); setPeriod('all'); setSelMonth(null);
    onChange({ from: customFrom, to: customTo, label });
    setShowCustom(false);
  }

  function shiftYear(delta) {
    const newY = Math.min(year + delta, thisYear);
    setYear(newY);
    if (mode === 'quarter') onChange(calcRange(period, newY));
    if (mode === 'month' && selMonth) selectMonth(selMonth, newY);
  }

  const btnBase  = 'px-3 py-1.5 text-xs rounded-lg font-semibold transition-all';
  const active   = 'bg-indigo-600 text-white shadow-sm';
  const inactive = 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50';

  return (
    <div className="space-y-2">
      {/* Row 1: All Time + Year nav + Quarter + Month toggle + Custom */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* All Time */}
        <button onClick={selectAll}
          className={`${btnBase} border ${mode === 'all'
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
            : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}>
          All Time
        </button>

        {/* Year nav + Quarters */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden divide-x divide-slate-100">
          <button onClick={() => shiftYear(-1)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
            <ChevronLeft size={13} />
          </button>
          <span className="px-2.5 text-xs font-bold text-slate-700 select-none">{year}</span>
          <button onClick={() => shiftYear(1)} disabled={year >= thisYear}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-30">
            <ChevronRight size={13} />
          </button>
          <div className="w-px h-5 bg-slate-200" />
          {QUARTERS.map(q => {
            const isActive  = mode === 'quarter' && period === q.key;
            const isCurrent = q.key === thisQ && year === thisYear;
            return (
              <button key={q.key} onClick={() => selectQuarter(q.key)}
                title={`${q.key} ${year} (${q.months})`}
                className={`px-3 py-1.5 text-xs font-bold transition-all select-none
                  ${isActive ? active : isCurrent ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-200' : inactive}`}>
                {q.label}
              </button>
            );
          })}
        </div>

        {/* Custom date range toggle */}
        <button onClick={() => setShowCustom(v => !v)}
          className={`${btnBase} border flex items-center gap-1.5 ${mode === 'custom'
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
            : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}>
          <Calendar size={12} /> Custom Range
        </button>

        {/* Active label */}
        {mode !== 'all' && (
          <span className="flex items-center gap-1.5 text-2xs text-indigo-600 font-medium bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1">
            <CalendarDays size={11} />
            {mode === 'quarter' && `${period} ${year} · ${QUARTERS.find(q => q.key === period)?.months}`}
            {mode === 'month'   && `${MONTHS[(selMonth||1) - 1]?.full} ${year}`}
            {mode === 'custom'  && `${customFrom} → ${customTo}`}
            <button onClick={selectAll} className="ml-1 hover:text-indigo-900">
              <X size={11} />
            </button>
          </span>
        )}
      </div>

      {/* Row 2: Month buttons (always visible under year nav) */}
      <div className="flex items-center gap-1 flex-wrap">
        {MONTHS.map(m => {
          const isActive  = mode === 'month' && selMonth === m.idx && year === year;
          const isCurrent = m.idx === thisMonth && year === thisYear;
          return (
            <button key={m.idx} onClick={() => selectMonth(m.idx)}
              title={`${m.full} ${year}`}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all
                ${isActive  ? 'bg-indigo-600 text-white shadow-sm'
                : isCurrent ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-200'
                : 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50'}`}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Custom date range panel */}
      {showCustom && (
        <div className="flex items-end gap-3 p-3 bg-white border border-indigo-200 rounded-xl shadow-sm flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              min={customFrom}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
          </div>
          <button onClick={applyCustom} disabled={!customFrom || !customTo}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            Apply
          </button>
          <button onClick={() => setShowCustom(false)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
