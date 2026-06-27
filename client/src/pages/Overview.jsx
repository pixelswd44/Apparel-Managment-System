import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Users, FileText, Receipt, AlertCircle,
  ArrowRight, CheckCircle, Clock, Banknote, ChevronDown,
  Bell, Plus, X, Check, CalendarClock, GripVertical,
  Trash2, ChevronRight, AlarmClock,
} from 'lucide-react';
import api from '../lib/api';
import PeriodPicker from '../components/PeriodPicker';
import Drawer from '../components/Drawer';

// ── Currency helpers ──────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', PKR: '₨', AED: 'AED ',
  SAR: 'SAR ', CAD: 'CA$', AUD: 'A$', JPY: '¥', CNY: '¥',
  INR: '₹', BDT: '৳', TRY: '₺', MYR: 'RM ', QAR: 'QAR ',
};

function symFor(code, dbSymbol) {
  return dbSymbol || CURRENCY_SYMBOLS[code] || `${code} `;
}

// ratesToPkr = { USD: 280, AED: 76, PKR: 1, … }
function fromPKR(pkrAmount, toCurrency, ratesToPkr) {
  const pkr    = parseFloat(pkrAmount) || 0;
  const toRate = ratesToPkr[toCurrency] || ratesToPkr['USD'] || 280;
  return pkr / toRate;
}

function fromNative(amount, fromCurrency, toCurrency, ratesToPkr) {
  const fromRate = ratesToPkr[fromCurrency] || ratesToPkr['USD'] || 280;
  const toRate   = ratesToPkr[toCurrency]   || ratesToPkr['USD'] || 280;
  const pkr      = (parseFloat(amount) || 0) * fromRate;
  return pkr / toRate;
}

function fmtMoney(amount, currency) {
  const n = parseFloat(amount) || 0;
  const decimals = ['JPY', 'KRW', 'PKR', 'IDR'].includes(currency) ? 0 : 2;
  return `${symFor(currency)}${n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
};

// Format a date string as YYYY-MM-DD for <input type="date">
const toInputDate = isoStr => {
  if (!isoStr) return '';
  return String(isoStr).slice(0, 10);
};

const STATUS_INV = {
  unpaid:  { label: 'Unpaid',  cls: 'bg-amber-100 text-amber-700'   },
  partial: { label: 'Partial', cls: 'bg-blue-100  text-blue-700'    },
  paid:    { label: 'Paid',    cls: 'bg-emerald-100 text-emerald-700' },
};

function InvBadge({ status }) {
  const cfg = STATUS_INV[status] ?? STATUS_INV.unpaid;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
  );
}

// ── Currency Selector ─────────────────────────────────────────────────────────

function CurrencySelector({ selected, currencies, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = currencies.find(c => c.code === selected);
  const getSymbol = c => c.symbol || symFor(c.code);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-all shadow-sm"
      >
        <span className="text-base leading-none">{current ? getSymbol(current).trim() : selected}</span>
        <span>{selected}</span>
        {current?.name && (
          <span className="text-xs text-slate-400 font-normal hidden sm:inline">· {current.name}</span>
        )}
        <ChevronDown size={13} className={`text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden min-w-[200px]"
          style={{ maxHeight: 280, overflowY: 'auto' }}>
          {currencies.map(c => (
            <button
              key={c.code}
              onClick={() => { onChange(c.code); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                c.code === selected
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 text-right font-mono text-xs text-slate-400">{getSymbol(c).trim()}</span>
                <span className="font-semibold">{c.code}</span>
              </div>
              {c.name && <span className="text-xs text-slate-400 ml-3 truncate max-w-[80px]">{c.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Spark bar ─────────────────────────────────────────────────────────────────

function TrendBar({ trend, currency, ratesToPkr }) {
  const converted = trend.map(t => ({
    month: t.month,
    value: fromPKR(t.pkr, currency, ratesToPkr),
  }));
  const max = Math.max(...converted.map(t => t.value), 1);

  return (
    <div className="flex items-end gap-1.5 h-16">
      {converted.map(({ month, value }) => (
        <div key={month} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-indigo-500 rounded-t-sm transition-all duration-500"
            style={{ height: `${Math.max((value / max) * 52, value > 0 ? 4 : 1)}px` }}
            title={`${month}: ${fmtMoney(value, currency)}`}
          />
          <span className="text-slate-400 text-[9px] font-medium">{month}</span>
        </div>
      ))}
    </div>
  );
}

// ── Reminders helpers ─────────────────────────────────────────────────────────

function reminderUrgency(remind_at) {
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(remind_at + 'T00:00:00');
  const diff  = Math.floor((due - today) / 86400000); // days
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7)  return 'soon';
  return 'upcoming';
}

const URGENCY_STYLES = {
  overdue:  { bar: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-700',   label: 'Overdue'  },
  today:    { bar: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700', label: 'Today'    },
  soon:     { bar: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',   label: 'This week'},
  upcoming: { bar: 'bg-slate-300',  badge: 'bg-slate-100 text-slate-500', label: 'Upcoming' },
};

// ── Reminder Form Modal ───────────────────────────────────────────────────────

function ReminderModal({ clients, initial, onSave, onClose }) {
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? '',
    title:     initial?.title ?? '',
    note:      initial?.note  ?? '',
    remind_at: initial ? toInputDate(initial.remind_at) : '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Default remind_at = 3 months from today
  useEffect(() => {
    if (!form.remind_at && !initial) {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      set('remind_at', d.toISOString().slice(0, 10));
    }
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title.trim() || !form.remind_at) return;
    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id || null,
        title:     form.title.trim(),
        note:      form.note.trim(),
        remind_at: form.remind_at,
      };
      if (initial?.id) {
        const r = await api.put(`/reminders/${initial.id}`, payload);
        onSave(r.data, 'edit');
      } else {
        const r = await api.post('/reminders', payload);
        onSave(r.data, 'add');
      }
    } catch {}
    setSaving(false);
  };

  return (
    <Drawer open={true} onClose={onClose} title={initial?.id ? 'Edit Reminder' : 'New Reminder'} width="max-w-sm">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Client picker */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Client (optional)</label>
          <select
            value={form.client_id}
            onChange={e => set('client_id', e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">— No client —</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.company || c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Reminder title *</label>
          <input
            type="text"
            placeholder="e.g. Follow up — check for new inquiry"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            required
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Due date */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Remind on *</label>
          <input
            type="date"
            value={form.remind_at}
            onChange={e => set('remind_at', e.target.value)}
            required
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Note (optional)</label>
          <textarea
            value={form.note}
            onChange={e => set('note', e.target.value)}
            rows={2}
            placeholder="Any extra context…"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : (initial?.id ? 'Save changes' : 'Add Reminder')}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── Reminders Widget ──────────────────────────────────────────────────────────

function RemindersWidget({ clients }) {
  const [reminders, setReminders]   = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editItem,  setEditItem]    = useState(null);
  const [showDone,  setShowDone]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/reminders');
      setReminders(r.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (row, mode) => {
    setReminders(prev =>
      mode === 'add' ? [row, ...prev] : prev.map(r => r.id === row.id ? row : r)
    );
    setShowModal(false);
    setEditItem(null);
  };

  const markDone = async (rem) => {
    try {
      const r = await api.put(`/reminders/${rem.id}`, { done: !rem.done });
      setReminders(prev => prev.map(x => x.id === rem.id ? r.data : x));
    } catch {}
  };

  const snooze = async (rem) => {
    const d = new Date(rem.remind_at + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    try {
      const r = await api.put(`/reminders/${rem.id}`, { remind_at: d.toISOString().slice(0, 10) });
      setReminders(prev => prev.map(x => x.id === rem.id ? r.data : x));
    } catch {}
  };

  const remove = async (rem) => {
    try {
      await api.delete(`/reminders/${rem.id}`);
      setReminders(prev => prev.filter(x => x.id !== rem.id));
    } catch {}
  };

  const pending  = reminders.filter(r => !r.done);
  const done     = reminders.filter(r =>  r.done);

  const overdue  = pending.filter(r => reminderUrgency(r.remind_at) === 'overdue').length;
  const todayDue = pending.filter(r => reminderUrgency(r.remind_at) === 'today').length;

  return (
    <>
      {showModal && (
        <ReminderModal
          clients={clients}
          initial={editItem}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(null); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Bell size={16} className="text-indigo-600" />
            <h2 className="font-bold text-slate-800 text-sm">Reminders</h2>
            {overdue > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
                {overdue} overdue
              </span>
            )}
            {todayDue > 0 && overdue === 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                {todayDue} today
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditItem(null); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus size={13} /> Add reminder
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="px-5 py-8 text-sm text-slate-400 text-center">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <CalendarClock size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No pending reminders</p>
            <p className="text-xs text-slate-300 mt-1">Add one to follow up with clients 2–3 months after an order</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pending.map(rem => {
              const urg = reminderUrgency(rem.remind_at);
              const st  = URGENCY_STYLES[urg];
              const clientLabel = rem.client_name || rem.client_company || null;
              return (
                <div key={rem.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors group">
                  {/* urgency bar */}
                  <div className={`w-0.5 self-stretch rounded-full flex-shrink-0 mt-0.5 ${st.bar}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-2xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${st.badge}`}>
                        {st.label}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 truncate">{rem.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {clientLabel && (
                        <span className="text-xs text-indigo-600 font-medium truncate">{clientLabel}</span>
                      )}
                      <span className="text-xs text-slate-400">{fmt(rem.remind_at)}</span>
                    </div>
                    {rem.note && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{rem.note}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => markDone(rem)}
                      title="Mark done"
                      className="p-1.5 rounded-lg hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => snooze(rem)}
                      title="Snooze 1 week"
                      className="p-1.5 rounded-lg hover:bg-amber-100 text-slate-400 hover:text-amber-600 transition-colors"
                    >
                      <AlarmClock size={14} />
                    </button>
                    <button
                      onClick={() => { setEditItem(rem); setShowModal(true); }}
                      title="Edit"
                      className="p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      <CalendarClock size={14} />
                    </button>
                    <button
                      onClick={() => remove(rem)}
                      title="Delete"
                      className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Completed section toggle */}
        {done.length > 0 && (
          <div className="border-t border-slate-100">
            <button
              onClick={() => setShowDone(s => !s)}
              className="w-full flex items-center justify-between px-5 py-3 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors font-semibold"
            >
              <span>{done.length} completed</span>
              <ChevronRight size={13} className={`transition-transform ${showDone ? 'rotate-90' : ''}`} />
            </button>
            {showDone && (
              <div className="divide-y divide-slate-50 pb-1">
                {done.map(rem => {
                  const clientLabel = rem.client_name || rem.client_company || null;
                  return (
                    <div key={rem.id} className="flex items-center gap-3 px-5 py-2.5 group opacity-50 hover:opacity-70 transition-opacity">
                      <div className="w-0.5 self-stretch rounded-full flex-shrink-0 bg-slate-200" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-500 line-through truncate">{rem.title}</p>
                        {clientLabel && <p className="text-xs text-slate-400 truncate">{clientLabel}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => markDone(rem)} title="Undo" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                          <X size={13} />
                        </button>
                        <button onClick={() => remove(rem)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Draggable stat card ───────────────────────────────────────────────────────

const CARD_ORDER_KEY = 'overview_card_order';

function useCardOrder(defaultOrder) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CARD_ORDER_KEY));
      if (Array.isArray(saved) && saved.length === defaultOrder.length) return saved;
    } catch {}
    return defaultOrder;
  });

  const save = useCallback(newOrder => {
    setOrder(newOrder);
    localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(newOrder));
  }, []);

  return [order, save];
}

function DraggableStatCards({ cards }) {
  const defaultOrder = cards.map((_, i) => i);
  const [order, saveOrder] = useCardOrder(defaultOrder);
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const ordered = order.map(i => cards[i]).filter(Boolean);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {ordered.map((card, pos) => {
        const realIdx = order[pos];
        const { label, value, sub, icon: Icon, iconBg, iconCl, dot } = card;
        const isOver = dragOver === pos;
        return (
          <div
            key={label}
            draggable
            onDragStart={() => { dragIdx.current = pos; }}
            onDragOver={e => { e.preventDefault(); setDragOver(pos); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => {
              const from = dragIdx.current;
              const to   = pos;
              setDragOver(null);
              if (from === null || from === to) return;
              const next = [...order];
              const [removed] = next.splice(from, 1);
              next.splice(to, 0, removed);
              saveOrder(next);
              dragIdx.current = null;
            }}
            onDragEnd={() => { dragIdx.current = null; setDragOver(null); }}
            className={`bg-white border rounded-2xl p-5 shadow-sm flex items-start gap-4 cursor-grab active:cursor-grabbing select-none transition-all ${
              isOver
                ? 'border-indigo-400 shadow-md scale-[1.02] ring-2 ring-indigo-200'
                : 'border-slate-200'
            }`}
          >
            {/* Drag handle hint */}
            <GripVertical size={14} className="text-slate-200 absolute opacity-0 group-hover:opacity-100 mt-0.5 -ml-1" />
            <div className={`${iconBg} rounded-xl p-2.5 flex-shrink-0`}>
              <Icon size={20} className={iconCl} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">{label}</p>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-slate-800 leading-tight break-all">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'overview_currency';

export default function Overview() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [periodRange, setPeriodRange] = useState({ from: null, to: null, label: 'All Time' });

  // Persist selected currency across sessions
  // Initial value: localStorage preference or empty (resolved after settings load)
  const [selectedCurrency, setSelectedCurrency] = useState(
    () => localStorage.getItem(STORAGE_KEY) || ''
  );

  useEffect(() => {
    const params = periodRange.from ? { from: periodRange.from, to: periodRange.to } : {};
    setLoading(true);
    Promise.all([
      api.get('/overview', { params }),
      api.get('/clients'),
      api.get('/settings'),
    ]).then(([ov, cl, st]) => {
      setData(ov.data);
      setClients(cl.data || []);
      const codes      = (ov.data.currencies || []).map(c => c.code);
      const baseCurr   = (st.data && st.data.base_currency) || 'USD';
      const savedCurr  = localStorage.getItem(STORAGE_KEY);
      // Priority: 1) valid user-saved preference  2) base_currency from settings  3) USD
      const resolved   = (savedCurr && codes.includes(savedCurr))
        ? savedCurr
        : (codes.includes(baseCurr) ? baseCurr : (codes[0] || 'USD'));
      setSelectedCurrency(resolved);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [periodRange.from, periodRange.to]);

  const handleCurrencyChange = code => {
    setSelectedCurrency(code);
    localStorage.setItem(STORAGE_KEY, code);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const d = data || {};

  // rates_to_pkr: { USD: 280, AED: 76, PKR: 1, … }
  const ratesToPkr = (d.rates_to_pkr && Object.keys(d.rates_to_pkr).length > 0)
    ? d.rates_to_pkr
    : { USD: 280, PKR: 1, AED: 76, EUR: 302, GBP: 356 };

  const currencies = (d.currencies || []).length > 0
    ? d.currencies
    : [{ code: 'USD', name: 'US Dollar', symbol: '$' }, { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' }];

  const symbolMap = Object.fromEntries(currencies.map(c => [c.code, c.symbol || symFor(c.code)]));
  const sym = code => symbolMap[code] || symFor(code);

  const conv    = pkrAmt     => fromPKR(pkrAmt, selectedCurrency, ratesToPkr);
  const convNat = (amt, from) => fromNative(amt, from, selectedCurrency, ratesToPkr);

  const fmtSel = amount => {
    const n = parseFloat(amount) || 0;
    const decimals = ['JPY', 'KRW', 'PKR', 'IDR'].includes(selectedCurrency) ? 0 : 2;
    return `${sym(selectedCurrency)}${n.toLocaleString('en-US', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    })}`;
  };
  const fmt$ = pkrAmt => fmtSel(conv(pkrAmt));

  // Rate label: show 1 CURRENCY = X PKR
  const selPkrRate = ratesToPkr[selectedCurrency] || 1;
  const usdPkrRate = ratesToPkr['USD'] || 280;
  const rateLabel  = selectedCurrency === 'PKR'
    ? `1 USD = ₨${usdPkrRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `1 ${selectedCurrency} = ₨${selPkrRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const revSubLabel = periodRange.from
    ? periodRange.label
    : `${fmt$(d.month_revenue_pkr)} this month`;

  const statCards = [
    {
      label: 'Total Revenue',
      value: fmt$(d.revenue_pkr),
      sub:   revSubLabel,
      icon:  TrendingUp,
      iconBg: 'bg-indigo-50',
      iconCl: 'text-indigo-600',
      dot:    'bg-indigo-500',
    },
    {
      label: 'Active Clients',
      value: d.active_clients ?? 0,
      sub:   `${d.total_clients ?? 0} total`,
      icon:  Users,
      iconBg: 'bg-emerald-50',
      iconCl: 'text-emerald-600',
      dot:    'bg-emerald-500',
    },
    {
      label: 'Open Quotations',
      value: d.open_quotations ?? 0,
      sub:   `${fmt$(d.pipeline_pkr)} pipeline`,
      icon:  FileText,
      iconBg: 'bg-amber-50',
      iconCl: 'text-amber-600',
      dot:    'bg-amber-500',
    },
    {
      label: 'Accepted Quotations',
      value: d.accepted_quotations ?? 0,
      sub:   fmt$(d.accepted_pkr),
      icon:  CheckCircle,
      iconBg: 'bg-violet-50',
      iconCl: 'text-violet-600',
      dot:    'bg-violet-500',
    },
    {
      label: 'Unpaid Invoices',
      value: d.unpaid_invoices ?? 0,
      sub:   `${fmt$(d.unpaid_pkr)} outstanding`,
      icon:  Receipt,
      iconBg: 'bg-rose-50',
      iconCl: 'text-rose-600',
      dot:    'bg-rose-500',
    },
    {
      label: 'Overdue Invoices',
      value: d.overdue_invoices ?? 0,
      sub:   d.overdue_invoices > 0 ? 'Needs attention' : 'All on track',
      icon:  AlertCircle,
      iconBg: d.overdue_invoices > 0 ? 'bg-orange-50' : 'bg-slate-50',
      iconCl: d.overdue_invoices > 0 ? 'text-orange-600' : 'text-slate-400',
      dot:    d.overdue_invoices > 0 ? 'bg-orange-500' : 'bg-slate-300',
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Showing values in <span className="font-semibold text-slate-700">{selectedCurrency}</span>
            <span className="ml-2 text-slate-400">· {rateLabel}</span>
            {periodRange.from && <span className="ml-2 font-medium text-indigo-600">· {periodRange.label}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <CurrencySelector
            selected={selectedCurrency}
            currencies={currencies}
            onChange={handleCurrencyChange}
          />
          <button onClick={() => navigate('/quotations/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
            <FileText size={14} /> New Quotation
          </button>
        </div>
      </div>

      {/* ── Period Filter ── */}
      <PeriodPicker onChange={range => setPeriodRange(range)} />

      {/* ── Draggable Stat cards ── */}
      <DraggableStatCards cards={statCards} />

      {/* ── Revenue trend + This month ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue trend */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-slate-800">Revenue Trend</h2>
              <p className="text-xs text-slate-400 mt-0.5">Last 6 months · {selectedCurrency}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-indigo-600">{fmt$(d.revenue_pkr)}</p>
              <p className="text-xs text-slate-400">total collected</p>
            </div>
          </div>
          {d.trend?.length > 0
            ? <TrendBar trend={d.trend} currency={selectedCurrency} ratesToPkr={ratesToPkr} />
            : <div className="h-16 flex items-center justify-center text-slate-300 text-sm">No payment data yet</div>
          }
        </div>

        {/* This month */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-800">This Month</h2>
          {[
            { label: 'Revenue',        value: fmt$(d.month_revenue_pkr), icon: Banknote,   cl: 'text-indigo-600' },
            { label: 'New Quotations', value: d.month_quotations ?? 0,   icon: FileText,   cl: 'text-amber-600'  },
            { label: 'Pipeline',       value: fmt$(d.pipeline_pkr),       icon: TrendingUp, cl: 'text-violet-600' },
            { label: 'Overdue',        value: d.overdue_invoices ?? 0,    icon: Clock,      cl: 'text-rose-600'   },
          ].map(({ label, value, icon: Icon, cl }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Icon size={14} className={`${cl} flex-shrink-0`} />
                <span className="text-sm text-slate-600">{label}</span>
              </div>
              <span className="text-sm font-bold text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reminders ── */}
      <RemindersWidget clients={clients} />

      {/* ── Recent invoices + Recent clients ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Invoices */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">Recent Invoices</h2>
            <button onClick={() => navigate('/invoices')}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {!d.recent_invoices?.length ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No invoices yet</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {d.recent_invoices.map(inv => {
                const converted = convNat(inv.total, inv.currency || 'USD');
                return (
                  <div key={inv.id}
                    onClick={() => navigate('/invoices')}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {inv.number}
                        </span>
                        <InvBadge status={inv.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{inv.client_name || 'No client'}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold text-slate-800">{fmtSel(converted)}</p>
                      <p className="text-xs text-slate-400">{fmt(inv.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Clients */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">Recent Clients</h2>
            <button onClick={() => navigate('/clients')}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {!d.recent_clients?.filter(c => c.status !== 'inactive').length ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No active clients yet</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {d.recent_clients.filter(c => c.status !== 'inactive').map(c => (
                <div key={c.id}
                  onClick={() => navigate('/clients')}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {c.display_name || c.company || c.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{c.email || 'No email'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{c.currency || 'USD'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      c.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      c.status === 'lead'   ? 'bg-amber-100  text-amber-700'   :
                                              'bg-slate-100  text-slate-500'
                    }`}>{c.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
