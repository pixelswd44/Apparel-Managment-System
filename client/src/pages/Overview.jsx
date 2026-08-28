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

// Right-to-left / non-Latin symbols (e.g. AED "د.إ") get visually reordered next to
// digits in mixed text, producing "195.6د.إK". For those we use the ISO code instead.
const isLatinSymbol = s => !!s && !/[؀-ۿ֐-׿]/.test(s);
function symFor(code, dbSymbol) {
  if (dbSymbol && isLatinSymbol(dbSymbol)) return dbSymbol;
  if (dbSymbol) return `${code} `;
  return CURRENCY_SYMBOLS[code] || `${code} `;
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
  const getSymbol = c => symFor(c.code, c.symbol);

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
        const { label, value, full, sub, icon: Icon, iconBg, iconCl, dot } = card;
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
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-800 leading-none" title={full || undefined}>{value}</p>
              {full && full !== value && <p className="text-xs text-slate-400 mt-0.5 font-medium truncate">{full}</p>}
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

// ── SVG area chart (revenue trend inside the hero card) ──────────────────────
function AreaChart({ values, labels = [], height = 120, light = false }) {
  const w = 100, h = 40; // viewBox units — scales to container
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    values.length > 1 ? (i / (values.length - 1)) * w : w / 2,
    h - 4 - (v / max) * (h - 10),
  ]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gradId = light ? 'areaLight' : 'areaDark';
  const stroke = light ? '#6366f1' : 'rgba(255,255,255,0.9)';
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={light ? 'rgba(99,102,241,0.28)' : 'rgba(255,255,255,0.45)'} />
            <stop offset="100%" stopColor={light ? 'rgba(99,102,241,0.02)' : 'rgba(255,255,255,0.02)'} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="0.8" fill={light ? '#6366f1' : '#fff'} opacity={i === pts.length - 1 ? 1 : 0} />
        ))}
      </svg>
      {labels.length > 0 && (
        <div className="flex justify-between mt-1">
          {labels.map((l, i) => <span key={i} className={`text-2xs ${light ? 'text-slate-400' : 'text-white/50'}`}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

// Category badge pill — soft tinted, like a status chip
function CardBadge({ color, children }) {
  const map = {
    indigo:  'text-indigo-700 bg-indigo-100/70 border-indigo-200/70',
    emerald: 'text-emerald-700 bg-emerald-100/70 border-emerald-200/70',
    rose:    'text-rose-700 bg-rose-100/70 border-rose-200/70',
    orange:  'text-orange-700 bg-orange-100/70 border-orange-200/70',
    sky:     'text-sky-700 bg-sky-100/70 border-sky-200/70',
    violet:  'text-violet-700 bg-violet-100/70 border-violet-200/70',
    amber:   'text-amber-700 bg-amber-100/70 border-amber-200/70',
    slate:   'text-slate-200 bg-white/10 border-white/10',
  };
  const dot = { indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500', orange: 'bg-orange-500', sky: 'bg-sky-500', violet: 'bg-violet-500', amber: 'bg-amber-500', slate: 'bg-emerald-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider border px-2.5 py-1 rounded-full ${map[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[color]}`} /> {children}
    </span>
  );
}

// ── Cash-flow: dual smooth areas (In / Out) with a Net line ──────────────────
function CashFlowChart({ data, fmtC }) {
  const [hover, setHover] = useState(null);
  // viewBox in 0..1000 x 0..200 units; the SVG stretches to the full container
  // width (preserveAspectRatio="none"), strokes stay crisp via non-scaling-stroke
  const W = 1000, H = 200, PT = 12, PB = 6;
  const rows = data.map(m => ({ ...m, net: m.in - m.out }));
  const max  = Math.max(...rows.map(r => Math.max(r.in, r.out)), 1);
  const x = i => rows.length > 1 ? (i / (rows.length - 1)) * W : W / 2;
  const y = v => PT + (1 - v / max) * (H - PT - PB);

  const spline = pts => {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
  };
  const inPts  = rows.map((r, i) => [x(i), y(r.in)]);
  const outPts = rows.map((r, i) => [x(i), y(r.out)]);
  const netPts = rows.map((r, i) => [x(i), y(Math.max(0, r.net))]);
  const areaOf = pts => `${spline(pts)} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height: 190 }}>
        <defs>
          <linearGradient id="cfIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.30)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </linearGradient>
          <linearGradient id="cfOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(244,63,94,0.22)" />
            <stop offset="100%" stopColor="rgba(244,63,94,0)" />
          </linearGradient>
        </defs>

        <path d={areaOf(outPts)} fill="url(#cfOut)" />
        <path d={spline(outPts)} fill="none" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={areaOf(inPts)} fill="url(#cfIn)" />
        <path d={spline(inPts)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={spline(netPts)} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.8" vectorEffect="non-scaling-stroke" />

        {hover !== null && (
          <line x1={x(hover)} y1={PT} x2={x(hover)} y2={H} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        {rows.map((r, i) => (
          <rect key={i} x={x(i) - W / rows.length / 2} y={0} width={W / rows.length} height={H}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      {/* dots for the hovered month — HTML so they stay circular */}
      {hover !== null && [['#10b981', rows[hover].in], ['#fb7185', rows[hover].out]].map(([c, v], k) => (
        <span key={k} className="absolute w-2 h-2 rounded-full border-2 border-white pointer-events-none"
          style={{ background: c, left: `${(x(hover) / W) * 100}%`, top: `${(y(v) / H) * 190}px`, transform: 'translate(-50%,-50%)' }} />
      ))}

      {/* month labels */}
      <div className="flex mt-1.5">
        {rows.map((r, i) => (
          <span key={i} className="flex-1 text-center text-2xs text-slate-400">{r.label}</span>
        ))}
      </div>

      {/* Tooltip */}
      {hover !== null && (
        <div className="absolute -top-2 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold text-slate-300 mb-1">{rows[hover].label}</p>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />In {fmtC(rows[hover].in)}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" />Out {fmtC(rows[hover].out)}</span>
            </div>
            <p className={`mt-1 font-bold ${rows[hover].net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              Net {rows[hover].net >= 0 ? '+' : '−'}{fmtC(Math.abs(rows[hover].net))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [fin,     setFin]     = useState(null);   // /financials/summary
  const [monthly, setMonthly] = useState([]);     // /financials/monthly
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [periodRange, setPeriodRange] = useState({ from: null, to: null, label: 'All Time' });

  // Draggable bento order (persisted)
  const BENTO_DEFAULT = ['revenue', 'profit', 'expenses', 'wallet', 'received', 'outstanding', 'projectsPaid', 'bizSpend'];
  const [bentoOrder, setBentoOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard_bento_order') || '[]');
      if (Array.isArray(saved) && saved.length) {
        const valid = saved.filter(k => BENTO_DEFAULT.includes(k));
        return [...valid, ...BENTO_DEFAULT.filter(k => !valid.includes(k))];
      }
    } catch { /* ignore */ }
    return BENTO_DEFAULT;
  });
  const dragKey = useRef(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  function reorderBento(targetKey) {
    const from = bentoOrder.indexOf(dragKey.current);
    const to   = bentoOrder.indexOf(targetKey);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...bentoOrder];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setBentoOrder(next);
    localStorage.setItem('dashboard_bento_order', JSON.stringify(next));
  }

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
      api.get('/financials/summary', { params }).catch(() => ({ data: null })),
      api.get('/financials/monthly', { params }).catch(() => ({ data: [] })),
    ]).then(([ov, cl, st, fs, fm]) => {
      setData(ov.data);
      setClients(cl.data || []);
      setFin(fs.data);
      setMonthly(Array.isArray(fm.data) ? fm.data : []);
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

  const symbolMap = Object.fromEntries(currencies.map(c => [c.code, symFor(c.code, c.symbol)]));
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

  // Compact: 11,704,779 → $11.7M, 496,129 → $496K
  const fmtSelC = amount => {
    const n = Math.abs(parseFloat(amount) || 0);
    const s = sym(selectedCurrency);
    if (n >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000)     return `${s}${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${s}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };
  const fmt$C = pkrAmt => fmtSelC(conv(pkrAmt));

  // Rate label: show 1 CURRENCY = X PKR
  const selPkrRate = ratesToPkr[selectedCurrency] || 1;
  const usdPkrRate = ratesToPkr['USD'] || 280;
  const rateLabel  = selectedCurrency === 'PKR'
    ? `1 USD = ₨${usdPkrRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `1 ${selectedCurrency} = ₨${selPkrRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const revSubLabel = periodRange.from
    ? periodRange.label
    : `${fmt$C(d.month_revenue_pkr)} this month`;

  // ── Financial summary (PKR values from /financials/summary) ──
  const f = fin || {};
  const received      = f.totalRevenue  ?? d.revenue_pkr ?? 0;
  const outstanding   = f.outstanding   ?? 0;
  const totalExpenses = f.totalExpenses ?? 0;
  const projectedPL   = f.projectedPL   ?? 0;
  const outOfPocket   = f.outOfPocket   ?? 0;
  const margin        = (received + outstanding) > 0 ? (projectedPL / (received + outstanding)) * 100 : 0;

  // Monthly series for the charts, converted to the selected currency
  const series     = monthly.slice(-12);
  const areaValues = series.map(m => conv(m.revenue));
  const monthLbl   = m => MONTHS_SHORT[parseInt(String(m.month).slice(5), 10) - 1] || '';
  const areaLabels = series.length > 1
    ? series.map((m, i) => (i === 0 || i === series.length - 1 || i === Math.floor((series.length - 1) / 2)) ? monthLbl(m) : '')
    : [];
  const duoData = monthly.slice(-8).map(m => ({ label: monthLbl(m), in: conv(m.revenue), out: conv(m.totalOut) }));
  const last2   = monthly.slice(-2);
  const revChange = last2.length === 2 && last2[0].revenue > 0
    ? ((last2[1].revenue - last2[0].revenue) / last2[0].revenue) * 100
    : null;

  const miniTiles = [
    { label: 'Active Clients',  value: d.active_clients ?? 0,      sub: `${d.total_clients ?? 0} total`,          icon: Users,       chip: 'bg-emerald-50 text-emerald-600' },
    { label: 'Open Quotations', value: d.open_quotations ?? 0,     sub: `${fmt$C(d.pipeline_pkr)} pipeline`,      icon: FileText,    chip: 'bg-amber-50 text-amber-600' },
    { label: 'Accepted',        value: d.accepted_quotations ?? 0, sub: fmt$C(d.accepted_pkr),                    icon: CheckCircle, chip: 'bg-violet-50 text-violet-600' },
    { label: 'Unpaid Invoices', value: d.unpaid_invoices ?? 0,
      sub: d.overdue_invoices > 0 ? `${d.overdue_invoices} overdue!` : `${fmt$C(d.unpaid_pkr)} due`,
      icon: Receipt, chip: d.overdue_invoices > 0 ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600' },
  ];

  // Per-currency received breakdown, e.g. "USD 53,251 · AED 102,660"
  const ccSub = Object.entries(f.revenueByCC || {})
    .filter(([, v]) => v > 0)
    .map(([cc, v]) => `${cc} ${Number(v).toLocaleString()}`)
    .join(' · ');

  const bizSpendTotal = (f.businessExpenses ?? 0) + (f.salariesPaid ?? 0);

  // ── Bento cards (draggable, order persisted) ──
  const bentoCards = {
    revenue: {
      span: 'col-span-2 lg:row-span-2',
      el: (
        <div className="h-full rounded-3xl p-6 bg-white border border-slate-200 border-t-4 border-t-indigo-500 shadow-sm flex flex-col justify-between gap-4 relative overflow-hidden">
          
          <div className="flex items-start justify-between relative">
            <div>
              <CardBadge color="indigo">Revenue</CardBadge>
              <p className="text-4xl font-black mt-3 tracking-tight text-slate-900" title={fmt$(received)}>{fmtSelC(conv(received))}</p>
              <p className="text-xs text-slate-500 mt-1">
                {periodRange.from ? periodRange.label : `${fmt$C(d.month_revenue_pkr)} collected this month`}
              </p>
            </div>
            {revChange !== null && (
              <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                revChange >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200/70' : 'bg-rose-50 text-rose-600 border-rose-200/70'}`}>
                <TrendingUp size={11} className={revChange < 0 ? 'rotate-180' : ''} />
                {Math.abs(revChange).toFixed(1)}%
              </span>
            )}
          </div>
          {areaValues.some(v => v > 0)
            ? <AreaChart values={areaValues} labels={areaLabels} height={100} light />
            : <div className="h-20 flex items-center justify-center text-slate-300 text-sm">No payment data yet</div>}
          <div className="flex items-center gap-5 relative flex-wrap">
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wider">Outstanding</p>
              <p className="text-sm font-bold text-slate-800" title={fmt$(outstanding)}>{fmt$C(outstanding)}</p>
            </div>
            <div className="w-px h-8 bg-indigo-100" />
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wider">Pipeline</p>
              <p className="text-sm font-bold text-slate-800" title={fmt$(d.pipeline_pkr)}>{fmt$C(d.pipeline_pkr)}</p>
            </div>
            <div className="w-px h-8 bg-indigo-100" />
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wider">New Quotes · Month</p>
              <p className="text-sm font-bold text-slate-800">{d.month_quotations ?? 0}</p>
            </div>
          </div>
        </div>
      ),
    },
    profit: {
      span: '',
      el: (
        <div className={`h-full rounded-3xl p-5 flex flex-col justify-between min-h-[150px] shadow-sm border relative overflow-hidden ${
          projectedPL >= 0
            ? 'bg-white border-slate-200 border-t-4 border-t-emerald-500'
            : 'bg-white border-slate-200 border-t-4 border-t-rose-500'}`}>
          <div className="flex items-center justify-between">
            <CardBadge color={projectedPL >= 0 ? 'emerald' : 'rose'}>{projectedPL >= 0 ? 'Profit' : 'Loss'}</CardBadge>
            <TrendingUp size={14} className={`${projectedPL >= 0 ? 'text-emerald-300' : 'text-rose-300 rotate-180'}`} />
          </div>
          <div>
            <p className={`text-2xl font-black tracking-tight ${projectedPL >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
              title={fmt$(Math.abs(projectedPL))}>{projectedPL < 0 && '−'}{fmt$C(Math.abs(projectedPL))}</p>
            <p className="text-xs text-slate-500 mt-0.5">{Math.abs(margin).toFixed(1)}% margin · projected</p>
          </div>
        </div>
      ),
    },
    expenses: {
      span: '',
      el: (
        <div className="h-full rounded-3xl p-5 bg-white border border-slate-200 border-t-4 border-t-orange-500 shadow-sm flex flex-col justify-between min-h-[150px] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <CardBadge color="orange">Expenses</CardBadge>
            <Banknote size={14} className="text-orange-300" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-slate-900" title={fmt$(totalExpenses)}>{fmt$C(totalExpenses)}</p>
            <p className="text-xs text-slate-500 mt-0.5">everything paid out, all sources</p>
          </div>
        </div>
      ),
    },
    wallet: {
      span: 'col-span-2',
      el: (
        <div className={`h-full rounded-3xl p-5 border shadow-sm flex items-center justify-between gap-4 relative overflow-hidden ${
          outOfPocket > 0
            ? 'bg-white border-slate-200 border-t-4 border-t-rose-500'
            : 'bg-white border-slate-200 border-t-4 border-t-emerald-500'}`}>
          <div>
            <CardBadge color={outOfPocket > 0 ? 'rose' : 'emerald'}>{outOfPocket > 0 ? 'Out of Pocket' : 'In Wallet'}</CardBadge>
            <p className={`text-2xl font-black tracking-tight mt-2 ${outOfPocket > 0 ? 'text-rose-700' : 'text-emerald-700'}`}
              title={fmt$(Math.abs(outOfPocket))}>
              {outOfPocket > 0 ? '−' : '+'}{fmt$C(Math.abs(outOfPocket))}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 leading-relaxed">
            <p>Received <span className="text-emerald-600 font-semibold">{fmt$C(received)}</span></p>
            <p>Spent <span className="text-rose-500 font-semibold">{fmt$C(totalExpenses)}</span></p>
          </div>
        </div>
      ),
    },
    received: {
      span: '',
      el: (
        <div className="h-full rounded-3xl p-5 bg-white border border-slate-200 border-t-4 border-t-sky-500 shadow-sm flex flex-col justify-between min-h-[150px]">
          <div className="flex items-center justify-between">
            <CardBadge color="sky">Received</CardBadge>
            <Banknote size={14} className="text-sky-300" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-slate-900" title={fmt$(received)}>{fmt$C(received)}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate" title={ccSub}>{ccSub || 'cash collected'}</p>
          </div>
        </div>
      ),
    },
    outstanding: {
      span: '',
      el: (
        <div className="h-full rounded-3xl p-5 bg-white border border-slate-200 border-t-4 border-t-rose-500 shadow-sm flex flex-col justify-between min-h-[150px]">
          <div className="flex items-center justify-between">
            <CardBadge color="rose">Outstanding</CardBadge>
            <Clock size={14} className="text-rose-300" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-rose-700" title={fmt$(outstanding)}>{fmt$C(outstanding)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{d.unpaid_invoices ?? 0} unpaid invoice{(d.unpaid_invoices ?? 0) !== 1 ? 's' : ''}</p>
          </div>
        </div>
      ),
    },
    projectsPaid: {
      span: '',
      el: (
        <div className="h-full rounded-3xl p-5 bg-white border border-slate-200 border-t-4 border-t-violet-500 shadow-sm flex flex-col justify-between min-h-[150px]">
          <div className="flex items-center justify-between">
            <CardBadge color="violet">Projects Paid</CardBadge>
            <CheckCircle size={14} className="text-violet-300" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-slate-900" title={fmt$(f.totalProjectsPaid)}>{fmt$C(f.totalProjectsPaid)}</p>
            <p className="text-xs text-slate-500 mt-0.5">of {fmt$C(f.totalProjectsExpense)} projected</p>
          </div>
        </div>
      ),
    },
    bizSpend: {
      span: '',
      el: (
        <div className="h-full rounded-3xl p-5 bg-white border border-slate-200 border-t-4 border-t-amber-500 shadow-sm flex flex-col justify-between min-h-[150px]">
          <div className="flex items-center justify-between">
            <CardBadge color="amber">Business + Payroll</CardBadge>
            <Users size={14} className="text-amber-300" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-slate-900" title={fmt$(bizSpendTotal)}>{fmt$C(bizSpendTotal)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Biz {fmt$C(f.businessExpenses)} · Salaries {fmt$C(f.salariesPaid)}</p>
          </div>
        </div>
      ),
    },
  };

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Business overview & financials in <span className="font-semibold text-slate-700">{selectedCurrency}</span>
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
          <button onClick={() => navigate('/expenses')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-semibold shadow-sm transition-colors">
            <Banknote size={14} /> Record Expense
          </button>
          <button onClick={() => navigate('/quotations/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
            <FileText size={14} /> New Quotation
          </button>
        </div>
      </div>

      {/* ── Period Filter ── */}
      <PeriodPicker onChange={range => setPeriodRange(range)} />

      {/* ── Bento grid — drag cards to rearrange, order is remembered ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 grid-flow-dense">
        {bentoOrder.map(k => {
          const c = bentoCards[k];
          if (!c) return null;
          return (
            <div
              key={k}
              draggable
              onDragStart={() => { dragKey.current = k; }}
              onDragOver={e => { e.preventDefault(); if (dragOverKey !== k) setDragOverKey(k); }}
              onDragLeave={() => setDragOverKey(o => (o === k ? null : o))}
              onDrop={e => { e.preventDefault(); reorderBento(k); setDragOverKey(null); }}
              onDragEnd={() => { dragKey.current = null; setDragOverKey(null); }}
              className={`${c.span} cursor-grab active:cursor-grabbing select-none transition-transform ${
                dragOverKey === k ? 'ring-2 ring-indigo-300 rounded-3xl scale-[1.01]' : ''
              }`}
            >
              {c.el}
            </div>
          );
        })}
      </div>

      {/* ── Cash flow chart + mini tiles ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-slate-800">Cash Flow</h2>
              <p className="text-xs text-slate-400 mt-0.5">Money in vs out · {selectedCurrency}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" /> In</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-400 rounded-full" /> Out</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500" style={{ borderTop: '1.5px dashed #6366f1', background: 'none', height: 0 }} /> Net</span>
            </div>
          </div>
          {duoData.some(m => m.in > 0 || m.out > 0)
            ? <CashFlowChart data={duoData} fmtC={fmtSelC} />
            : <div className="h-32 flex items-center justify-center text-slate-300 text-sm">No activity yet</div>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {miniTiles.map(({ label, value, sub, icon: Icon, chip }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col justify-between min-h-[100px]">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${chip}`}><Icon size={15} /></div>
              <div className="mt-2">
                <p className="text-xl font-black text-slate-900 leading-none">{value}</p>
                <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wide mt-1">{label}</p>
                <p className="text-2xs text-slate-400 mt-0.5 truncate">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

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
