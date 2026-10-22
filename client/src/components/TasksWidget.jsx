import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Plus, X, ListTodo, CalendarDays, Clock, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { REMINDERS_CHANGED, announceRemindersChanged, isoDay, dayOf, timeOf, dueAt, dayLabel, fmtTime, whenLabel } from '../lib/reminders';

// Dashboard "Tasks & reminders" card — a small to-do list backed by /api/reminders.
// Each task has a due date and an optional time; open tasks are grouped into
// Overdue / Today / Upcoming, finished ones can be shown on demand. The sidebar
// bell (NotificationBell) raises the reminders when they fall due.

export default function TasksWidget() {
  const today = isoDay(new Date());

  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [title, setTitle]       = useState('');
  const [due, setDue]           = useState(today);
  const [time, setTime]         = useState('');
  const [showDone, setShowDone] = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef();

  const load = useCallback(() => api.get('/reminders')
    .then(r => setTasks(Array.isArray(r.data) ? r.data : []))
    .catch(() => setError('Could not load tasks.'))
    .finally(() => setLoading(false)), []);

  useEffect(() => {
    load();
    window.addEventListener(REMINDERS_CHANGED, load);
    return () => window.removeEventListener(REMINDERS_CHANGED, load);
  }, [load]);

  async function add(e) {
    e?.preventDefault();
    const t = title.trim();
    if (!t) { inputRef.current?.focus(); return; }
    setError('');
    try {
      const remind_at = (due || today) + (time ? `T${time}` : '');
      const { data } = await api.post('/reminders', { title: t, remind_at });
      setTasks(prev => [...prev, data]);
      setTitle(''); setTime('');
      inputRef.current?.focus();
      announceRemindersChanged();
    } catch {
      setError('Could not add the task.');
    }
  }

  async function toggle(task) {
    const done = task.done ? 0 : 1;
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, done } : x));
    try { await api.put(`/reminders/${task.id}`, { done }); announceRemindersChanged(); }
    catch {
      setTasks(prev => prev.map(x => x.id === task.id ? { ...x, done: task.done } : x));
      setError('Could not update the task.');
    }
  }

  async function remove(task) {
    setTasks(prev => prev.filter(x => x.id !== task.id));
    try { await api.delete(`/reminders/${task.id}`); announceRemindersChanged(); }
    catch {
      setTasks(prev => [...prev, task]);
      setError('Could not delete the task.');
    }
  }

  const now  = new Date();
  const byDue = (a, b) => String(a.remind_at).localeCompare(String(b.remind_at)) || a.id - b.id;
  const open = tasks.filter(t => !t.done).sort(byDue);
  const done = tasks.filter(t => t.done).sort((a, b) => byDue(b, a));
  // Overdue = past its day, or due earlier today at a set time
  const isLate = t => dayOf(t) < today || (dayOf(t) === today && timeOf(t) && dueAt(t) < now);
  const groups = [
    { key: 'overdue',  label: 'Overdue',  items: open.filter(isLate), tone: 'text-rose-600' },
    { key: 'today',    label: 'Today',    items: open.filter(t => dayOf(t) === today && !isLate(t)), tone: 'text-[#0071e3]' },
    { key: 'upcoming', label: 'Upcoming', items: open.filter(t => dayOf(t) > today), tone: 'text-[#6e6e73]' },
  ].filter(g => g.items.length);
  const overdueCount = groups.find(g => g.key === 'overdue')?.items.length || 0;

  const row = task => {
    const late = !task.done && isLate(task);
    return (
      <li key={task.id} className="group flex items-start gap-3 px-2 py-2 -mx-2 rounded-2xl hover:bg-white/55 transition-colors">
        <button type="button" onClick={() => toggle(task)} title={task.done ? 'Mark as not done' : 'Mark as done'}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 grid place-items-center transition-all ${
            task.done ? 'bg-[#34c759] border-[#34c759] text-white' : late ? 'border-rose-400 hover:bg-rose-50' : 'border-[#c7c7cc] hover:border-[#0071e3]'}`}>
          {task.done ? <Check size={12} strokeWidth={3} /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug break-words ${task.done ? 'line-through text-[#86868b]' : 'text-[#1d1d1f]'}`}>{task.title}</p>
          <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${late ? 'text-rose-500' : 'text-[#86868b]'}`}>
            {timeOf(task) ? <Clock size={11} /> : <CalendarDays size={11} />} {whenLabel(task)}
            {task.client_name && <span className="truncate">· {task.client_name}</span>}
          </p>
        </div>
        <button type="button" onClick={() => remove(task)} title="Delete task"
          className="mt-0.5 w-6 h-6 rounded-full grid place-items-center text-[#86868b] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-rose-50 hover:text-rose-600 transition-opacity">
          <X size={13} />
        </button>
      </li>
    );
  };

  const chip = 'relative flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors';
  const openPicker = e => { try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } };

  return (
    <div className="glass rounded-3xl p-6 flex flex-col h-full">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-[#1d1d1f] flex items-center gap-2">
          <ListTodo size={18} className="text-[#0071e3]" /> Tasks
        </h2>
        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
              <AlertCircle size={11} /> {overdueCount} overdue
            </span>
          )}
          <span className="text-2xl font-light text-[#1d1d1f] tabular-nums">{open.length}</span>
        </div>
      </div>

      {/* Quick add: title, then due day + optional time chips */}
      <form onSubmit={add} className="mt-4 rounded-[20px] bg-white/70 border border-white/80 shadow-[inset_0_1px_2px_rgba(15,23,42,.05)] p-1.5 pl-4 focus-within:ring-4 focus-within:ring-[#0071e3]/15 focus-within:border-[#0071e3]/40 transition-all">
        <div className="flex items-center gap-1.5">
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task or reminder…"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none focus-visible:outline-none text-sm text-[#1d1d1f] placeholder:text-[#86868b] py-1" />
          <button type="submit" title="Add task"
            className="w-8 h-8 flex-shrink-0 rounded-full grid place-items-center text-white bg-gradient-to-b from-[#2b8cff] to-[#0071e3] shadow-[inset_0_1px_0_rgba(255,255,255,.3)] hover:brightness-110">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-1 pb-0.5">
          {/* Transparent native pickers sit on top of each chip */}
          <label title="Due date" className={`${chip} text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/15`}>
            <CalendarDays size={11} /> {dayLabel(due || today)}
            <input type="date" value={due} onChange={e => setDue(e.target.value || today)} onClick={openPicker}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
          <label title="Remind me at (optional)" className={`${chip} ${time ? 'text-[#0071e3] bg-[#0071e3]/10' : 'text-[#6e6e73] bg-black/[.04] hover:bg-black/[.07]'}`}>
            <Clock size={11} /> {time ? fmtTime(time) : 'Add time'}
            <input type="time" value={time} onChange={e => setTime(e.target.value)} onClick={openPicker}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
          {time && (
            <button type="button" onClick={() => setTime('')} title="Clear time"
              className="w-5 h-5 rounded-full grid place-items-center text-[#86868b] hover:bg-black/5"><X size={11} /></button>
          )}
        </div>
      </form>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}

      {/* List */}
      <div className="mt-4 flex-1 min-h-0 max-h-80 overflow-y-auto overflow-x-hidden px-2">
        {loading ? (
          <div className="py-8 grid place-items-center">
            <span className="w-6 h-6 border-2 border-white/70 border-t-[#0071e3] rounded-full animate-spin" />
          </div>
        ) : open.length === 0 && !showDone ? (
          <p className="py-8 text-sm text-[#86868b] text-center">Nothing to do — add a task above.</p>
        ) : (
          <div className="space-y-3">
            {groups.map(g => (
              <div key={g.key}>
                <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${g.tone}`}>{g.label}</p>
                <ul>{g.items.map(row)}</ul>
              </div>
            ))}
            {showDone && done.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 text-[#34a853]">Done</p>
                <ul>{done.map(row)}</ul>
              </div>
            )}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <button type="button" onClick={() => setShowDone(v => !v)}
          className="mt-3 self-start text-xs font-medium text-[#0071e3] hover:underline">
          {showDone ? 'Hide completed' : `Show completed (${done.length})`}
        </button>
      )}
    </div>
  );
}
