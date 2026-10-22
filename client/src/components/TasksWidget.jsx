import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus, X, ListTodo, CalendarDays, Clock, AlertCircle, Tag, AlignLeft, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth, canAccess } from '../lib/authContext';
import { REMINDERS_CHANGED, announceRemindersChanged, isoDay, dayOf, timeOf, dueAt, dayLabel, fmtTime, whenLabel, linkOf, linkPath, LINK_ICON } from '../lib/reminders';
import TaskLinkPicker from './TaskLinkPicker';

// Dashboard "Tasks & reminders" card — a small to-do list backed by /api/reminders.
// Each task has a due date, an optional time, an optional short description and
// is either general or for a client / project. Open tasks are grouped into
// Overdue / Today / Upcoming; click a task to edit it. The sidebar bell
// (NotificationBell) raises the reminders when they fall due.

const chip = 'relative flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors max-w-[11rem]';
const chipOn  = 'text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/15';
const chipOff = 'text-[#6e6e73] bg-black/[.04] hover:bg-black/[.07]';
const openPicker = e => { try { e.currentTarget.showPicker?.(); } catch { /* not supported */ } };

const splitWhen = r => ({ due: dayOf(r), time: timeOf(r) });
const toPayload = d => ({
  title: d.title.trim(),
  note: d.note.trim(),
  remind_at: d.due + (d.time ? `T${d.time}` : ''),
  client_id:  d.link?.type === 'client'  ? d.link.id : null,
  project_id: d.link?.type === 'project' ? d.link.id : null,
});

// Due date, time, description and General / Client / Project chips (shared by add + edit)
function TaskChips({ draft, set, today, noteOpen, onNote, linkOpen, onLink }) {
  const LinkIcon = draft.link ? LINK_ICON[draft.link.type] : Tag;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Transparent native pickers sit on top of the date / time chips */}
      <label title="Due date" className={`${chip} ${chipOn}`}>
        <CalendarDays size={11} /> {dayLabel(draft.due || today)}
        <input type="date" value={draft.due} onChange={e => set({ due: e.target.value || today })} onClick={openPicker}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
      <label title="Remind me at (optional)" className={`${chip} ${draft.time ? chipOn : chipOff}`}>
        <Clock size={11} /> {draft.time ? fmtTime(draft.time) : 'Add time'}
        <input type="time" value={draft.time} onChange={e => set({ time: e.target.value })} onClick={openPicker}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
      {draft.time && (
        <button type="button" onClick={() => set({ time: '' })} title="Clear time"
          className="w-5 h-5 -ml-1 rounded-full grid place-items-center text-[#86868b] hover:bg-black/5"><X size={11} /></button>
      )}
      <button type="button" onClick={onLink} title="General task, or for a client / project"
        className={`${chip} ${draft.link || linkOpen ? chipOn : chipOff}`}>
        <LinkIcon size={11} className="flex-shrink-0" /> <span className="truncate">{draft.link ? draft.link.name : 'General'}</span>
      </button>
      {onNote && (
        <button type="button" onClick={onNote} title="Add a short description"
          className={`${chip} ${draft.note || noteOpen ? chipOn : chipOff}`}>
          <AlignLeft size={11} /> Details
        </button>
      )}
    </div>
  );
}

export default function TasksWidget() {
  const { user } = useAuth();
  const allowProjects = canAccess(user, '/projects');
  const today = isoDay(new Date());
  const blank = () => ({ title: '', note: '', due: today, time: '', link: null });

  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState(blank);
  const [addPanel, setAddPanel] = useState(''); // '' | 'note' | 'link'
  const [editing, setEditing]   = useState(null); // { id, draft, linkOpen }
  const [saving, setSaving]     = useState(false);
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

  const setD = patch => setDraft(d => ({ ...d, ...patch }));

  async function add(e) {
    e?.preventDefault();
    if (!draft.title.trim()) { inputRef.current?.focus(); return; }
    setError('');
    try {
      const { data } = await api.post('/reminders', toPayload({ ...draft, due: draft.due || today }));
      setTasks(prev => [...prev, data]);
      // Keep the day and client/project for the next task; clear the rest
      setDraft(d => ({ ...d, title: '', note: '', time: '' }));
      setAddPanel('');
      inputRef.current?.focus();
      announceRemindersChanged();
    } catch {
      setError('Could not add the task.');
    }
  }

  function startEdit(task) {
    setEditing({ id: task.id, linkOpen: false, draft: { title: task.title || '', note: task.note || '', ...splitWhen(task), link: linkOf(task) } });
  }
  const setE = patch => setEditing(ed => ({ ...ed, draft: { ...ed.draft, ...patch } }));

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editing || !editing.draft.title.trim() || saving) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.put(`/reminders/${editing.id}`, toPayload({ ...editing.draft, due: editing.draft.due || today }));
      setTasks(prev => prev.map(x => x.id === data.id ? data : x));
      setEditing(null);
      announceRemindersChanged();
    } catch {
      setError('Could not save the task.');
    } finally {
      setSaving(false);
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
    if (editing?.id === task.id) setEditing(null);
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

  const editor = task => {
    const d = editing.draft;
    return (
      <li key={task.id} className="my-1 -mx-1">
        <form onSubmit={saveEdit}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(e);
          }}
          className="rounded-2xl bg-white/85 border border-[#0071e3]/25 ring-4 ring-[#0071e3]/10 p-3 space-y-2">
          <input autoFocus value={d.title} onChange={e => setE({ title: e.target.value })} placeholder="Task"
            className="w-full bg-transparent border-0 outline-none focus-visible:outline-none text-sm font-medium text-[#1d1d1f] placeholder:text-[#86868b]" />
          <textarea value={d.note} onChange={e => setE({ note: e.target.value })} rows={2} maxLength={500}
            placeholder="Short description (optional)"
            className="w-full resize-none bg-black/[.03] rounded-xl border-0 outline-none focus-visible:outline-none px-2.5 py-1.5 text-xs text-[#1d1d1f] placeholder:text-[#86868b]" />
          <TaskChips draft={d} set={setE} today={today}
            linkOpen={editing.linkOpen} onLink={() => setEditing(ed => ({ ...ed, linkOpen: !ed.linkOpen }))} />
          {editing.linkOpen && (
            <TaskLinkPicker value={d.link} allowProjects={allowProjects}
              onChange={link => setEditing(ed => ({ ...ed, linkOpen: false, draft: { ...ed.draft, link } }))} />
          )}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => remove(task)} title="Delete task"
              className="w-8 h-8 rounded-full grid place-items-center text-[#86868b] hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
            <span className="flex-1" />
            <button type="button" onClick={() => setEditing(null)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#1d1d1f] bg-black/[.05] hover:bg-black/[.08]">Cancel</button>
            <button type="submit" disabled={!d.title.trim() || saving}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-b from-[#2b8cff] to-[#0071e3] hover:brightness-110 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </li>
    );
  };

  const row = task => {
    if (editing?.id === task.id) return editor(task);
    const late = !task.done && isLate(task);
    const link = linkOf(task);
    const LinkIcon = link && LINK_ICON[link.type];
    const linkTo = link && (link.type !== 'project' || allowProjects) ? linkPath(link) : '';
    return (
      <li key={task.id} className="group flex items-start gap-3 px-2 py-2 -mx-2 rounded-2xl hover:bg-white/55 transition-colors">
        <button type="button" onClick={() => toggle(task)} title={task.done ? 'Mark as not done' : 'Mark as done'}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 grid place-items-center transition-all ${
            task.done ? 'bg-[#34c759] border-[#34c759] text-white' : late ? 'border-rose-400 hover:bg-rose-50' : 'border-[#c7c7cc] hover:border-[#0071e3]'}`}>
          {task.done ? <Check size={12} strokeWidth={3} /> : null}
        </button>
        <div className="min-w-0 flex-1">
          {/* A real button, so the dashboard grid treats it as a control rather than a drag handle */}
          <button type="button" title="Edit task" onClick={() => startEdit(task)}
            className="block w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/30">
            <span className={`block text-sm leading-snug break-words ${task.done ? 'line-through text-[#86868b]' : 'text-[#1d1d1f]'}`}>{task.title}</span>
            {task.note && <span className="block text-xs text-[#6e6e73] leading-snug mt-0.5 line-clamp-2 break-words whitespace-pre-line">{task.note}</span>}
          </button>
          <p className={`text-[11px] mt-0.5 flex items-center gap-1 min-w-0 ${late ? 'text-rose-500' : 'text-[#86868b]'}`}>
            {timeOf(task) ? <Clock size={11} className="flex-shrink-0" /> : <CalendarDays size={11} className="flex-shrink-0" />}
            <span className="flex-shrink-0">{whenLabel(task)}</span>
            {link && (
              linkTo ? (
                <Link to={linkTo} onClick={e => e.stopPropagation()} title={link.sub ? `${link.name} · ${link.sub}` : link.name}
                  className="min-w-0 flex items-center gap-1 text-[#0071e3] hover:underline">
                  · <LinkIcon size={11} className="flex-shrink-0" /> <span className="truncate">{link.name}</span>
                </Link>
              ) : (
                <span className="min-w-0 flex items-center gap-1">· <LinkIcon size={11} className="flex-shrink-0" /> <span className="truncate">{link.name}</span></span>
              )
            )}
          </p>
        </div>
        <button type="button" onClick={() => remove(task)} title="Delete task"
          className="mt-0.5 w-6 h-6 rounded-full grid place-items-center text-[#86868b] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-rose-50 hover:text-rose-600 transition-opacity">
          <X size={13} />
        </button>
      </li>
    );
  };

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

      {/* Quick add: title, then due day / time / client-project / details chips */}
      <form onSubmit={add} className="mt-4 rounded-[20px] bg-white/70 border border-white/80 shadow-[inset_0_1px_2px_rgba(15,23,42,.05)] p-1.5 pl-4 focus-within:ring-4 focus-within:ring-[#0071e3]/15 focus-within:border-[#0071e3]/40 transition-all">
        <div className="flex items-center gap-1.5">
          <input ref={inputRef} value={draft.title} onChange={e => setD({ title: e.target.value })} placeholder="Add a task or reminder…"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none focus-visible:outline-none text-sm text-[#1d1d1f] placeholder:text-[#86868b] py-1" />
          <button type="submit" title="Add task"
            className="w-8 h-8 flex-shrink-0 rounded-full grid place-items-center text-white bg-gradient-to-b from-[#2b8cff] to-[#0071e3] shadow-[inset_0_1px_0_rgba(255,255,255,.3)] hover:brightness-110">
            <Plus size={16} />
          </button>
        </div>
        {addPanel === 'note' && (
          <textarea autoFocus value={draft.note} onChange={e => setD({ note: e.target.value })} rows={2} maxLength={500}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(e); }}
            placeholder="Short description (optional)"
            className="mt-1 mr-1.5 w-[calc(100%-0.375rem)] resize-none bg-black/[.03] rounded-xl border-0 outline-none focus-visible:outline-none px-2.5 py-1.5 text-xs text-[#1d1d1f] placeholder:text-[#86868b]" />
        )}
        <div className="mt-1 pb-0.5">
          <TaskChips draft={draft} set={setD} today={today}
            noteOpen={addPanel === 'note'} onNote={() => setAddPanel(p => (p === 'note' ? '' : 'note'))}
            linkOpen={addPanel === 'link'} onLink={() => setAddPanel(p => (p === 'link' ? '' : 'link'))} />
        </div>
        {addPanel === 'link' && (
          <TaskLinkPicker value={draft.link} allowProjects={allowProjects}
            onChange={link => { setD({ link }); setAddPanel(''); inputRef.current?.focus(); }} />
        )}
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
