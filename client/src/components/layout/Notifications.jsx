import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Check, X, Clock, CalendarDays } from 'lucide-react';
import api from '../../lib/api';
import { REMINDERS_CHANGED, announceRemindersChanged, dueAt, timeOf, whenLabel, isoDay, dayOf } from '../../lib/reminders';
import { pushSupported, ensurePushSubscription } from '../../lib/push';

// Reminder notifications while the app is open:
//   • useReminderNotifier — polls open tasks; when one falls due it shows an
//     in-app toast and (if allowed) a desktop notification, once per task/due time.
//     With Web Push on (lib/push.js) the server sends the desktop notification
//     instead — also while the app is closed — so the page only shows the toast.
//   • NotificationBell    — sidebar bell with the due count and a quick list
//   • ReminderToasts      — the toast stack (render once)

const POLL_MS      = 60 * 1000;
const NOTIFIED_KEY = 'crm_notified_reminders';
const TOAST_MS     = 9000;

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;
const sig = r => `${r.id}@${r.remind_at}`; // re-notify if the task is rescheduled

function readNotified() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); } catch { return new Set(); }
}
function writeNotified(set) {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-300))); } catch { /* storage unavailable */ }
}

export function useReminderNotifier() {
  const navigate = useNavigate();
  const [open, setOpen]             = useState([]);   // all open tasks
  const [now, setNow]               = useState(() => new Date());
  const [toasts, setToasts]         = useState([]);
  const [permission, setPermission] = useState(() => (canNotify() ? Notification.permission : 'unsupported'));
  const [pushOn, setPushOn]         = useState(false); // this device gets server pushes
  const pushOnRef = useRef(false);
  pushOnRef.current = pushOn;

  const notify = useCallback(fresh => {
    if (!fresh.length) return;
    // In-app toasts — one per task, or a single summary when several fall due together
    const items = fresh.length > 2
      ? [{ id: `summary-${Date.now()}`, summary: true, title: `${fresh.length} tasks are due`,
           when: fresh.slice(0, 3).map(r => r.title).join(' · ') + (fresh.length > 3 ? ' …' : ''), at: Date.now() }]
      : fresh.map(r => ({ id: r.id, title: r.title, when: whenLabel(r), at: Date.now() }));
    setToasts(t => [...t, ...items].slice(-3));
    // Desktop notification — one summary when several fall due together
    // (skipped when the service worker gets these as pushes)
    if (canNotify() && Notification.permission === 'granted' && !pushOnRef.current) {
      try {
        const n = fresh.length === 1
          ? new Notification(fresh[0].title, { body: `Reminder · ${whenLabel(fresh[0])}`, tag: `crm-reminder-${fresh[0].id}`, icon: '/favicon.svg' })
          : new Notification(`${fresh.length} tasks are due`, { body: fresh.map(r => `• ${r.title}`).join('\n'), tag: 'crm-reminders', icon: '/favicon.svg' });
        n.onclick = () => { window.focus(); navigate('/'); n.close(); };
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }, [navigate]);

  const check = useCallback(async () => {
    try {
      const { data } = await api.get('/reminders', { params: { done: 0 } });
      const list = Array.isArray(data) ? data : [];
      const at = new Date();
      setOpen(list);
      setNow(at);
      const notified = readNotified();
      const fresh = list.filter(r => { const d = dueAt(r); return d && d <= at && !notified.has(sig(r)); });
      if (fresh.length) {
        fresh.forEach(r => notified.add(sig(r)));
        writeNotified(notified);
        notify(fresh);
      }
    } catch { /* offline or signed out — try again next tick */ }
  }, [notify]);

  useEffect(() => {
    check();
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener(REMINDERS_CHANGED, check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REMINDERS_CHANGED, check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  // Web Push: subscribe this device once notifications are allowed; listen to
  // the service worker (a push arrived while on screen / a notification was clicked)
  const subscribePush = useCallback(() => {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    ensurePushSubscription().then(setPushOn).catch(e => { console.warn('[push] subscribe failed:', e); setPushOn(false); });
  }, []);

  useEffect(() => {
    subscribePush();
    if (!pushSupported()) return;
    const onMessage = e => {
      if (e.data?.type === 'reminder-push') check();
      if (e.data?.type === 'open') { window.focus(); navigate(e.data.url || '/'); }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [subscribePush, check, navigate]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts(list => list.filter(x => Date.now() - x.at < TOAST_MS)), 1000);
    return () => clearTimeout(t);
  }, [toasts]);

  async function requestPermission() {
    if (!canNotify()) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') subscribePush();
    } catch { /* ignored */ }
  }

  async function markDone(id) {
    setOpen(list => list.filter(r => r.id !== id));
    setToasts(list => list.filter(t => t.id !== id));
    try { await api.put(`/reminders/${id}`, { done: 1 }); } catch { /* next poll restores it */ }
    announceRemindersChanged();
  }

  const due      = open.filter(r => { const d = dueAt(r); return d && d <= now; });
  const today    = isoDay(now);
  const laterToday = open.filter(r => dayOf(r) === today && !due.includes(r));

  return {
    due, laterToday, toasts, permission, pushOn, requestPermission, markDone,
    dismissToast: id => setToasts(list => list.filter(t => t.id !== id)),
  };
}

// ── Bell + popover ────────────────────────────────────────────────────────────
export function NotificationBell({ due, laterToday, permission, pushOn, requestPermission, markDone, align = 'left' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const count = due.length;
  const item = (r, late) => (
    <li key={r.id} className="flex items-start gap-2.5 px-2 py-2 rounded-xl hover:bg-white/60">
      <button type="button" onClick={() => markDone(r.id)} title="Mark as done"
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 grid place-items-center hover:bg-[#34c759] hover:border-[#34c759] hover:text-white text-transparent transition-colors ${late ? 'border-rose-400' : 'border-[#c7c7cc]'}`}>
        <Check size={11} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#1d1d1f] leading-snug break-words">{r.title}</p>
        <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${late ? 'text-rose-500' : 'text-[#86868b]'}`}>
          {timeOf(r) ? <Clock size={10} /> : <CalendarDays size={10} />} {whenLabel(r)}
        </p>
      </div>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-label={count ? `${count} reminders due` : 'Reminders'}
        className={`relative w-9 h-9 grid place-items-center rounded-full transition-colors ${open ? 'bg-white/80' : 'hover:bg-white/60'} ${count ? 'text-[#0071e3]' : 'text-[#515154]'}`}>
        {count ? <BellRing size={17} className="bell-ring" /> : <Bell size={17} />}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff3b30] text-white text-[10px] font-bold grid place-items-center shadow-[0_0_0_2px_rgba(255,255,255,.9)]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute top-full mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] bg-white !bg-white/95 border border-slate-200 rounded-2xl shadow-xl p-2 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <p className="text-sm font-semibold text-[#1d1d1f]">Reminders</p>
            <button type="button" onClick={() => { setOpen(false); navigate('/'); }} className="text-xs font-medium text-[#0071e3] hover:underline">All tasks</button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {due.length === 0 && laterToday.length === 0 && (
              <p className="px-2 py-6 text-sm text-[#86868b] text-center">You're all caught up.</p>
            )}
            {due.length > 0 && (
              <>
                <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">Due now</p>
                <ul>{due.map(r => item(r, true))}</ul>
              </>
            )}
            {laterToday.length > 0 && (
              <>
                <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">Later today</p>
                <ul>{laterToday.map(r => item(r, false))}</ul>
              </>
            )}
          </div>

          {permission !== 'unsupported' && (
            <div className="mt-1 pt-2 px-2 pb-1 border-t border-slate-100">
              {permission === 'granted' ? (
                <p className="text-[11px] text-[#34a853] flex items-center gap-1">
                  <Check size={11} /> {pushOn ? 'Notifications are on — even when the app is closed' : 'Desktop notifications are on'}
                </p>
              ) : permission === 'denied' ? (
                <p className="text-[11px] text-[#86868b]">Desktop notifications are blocked — allow them for this site in your browser settings.</p>
              ) : (
                <button type="button" onClick={requestPermission}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
                  <BellRing size={13} /> Turn on desktop notifications
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────────────
export function ReminderToasts({ toasts, dismissToast, markDone }) {
  const navigate = useNavigate();
  if (!toasts.length) return null;
  return createPortal(
    <div className="print:hidden fixed z-[300] bottom-4 right-4 left-4 sm:left-auto sm:w-80 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} role="status"
          className="pointer-events-auto glass-strong !bg-white/90 rounded-2xl p-3 pr-2 flex items-start gap-3 animate-modal">
          <span className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0 text-white bg-gradient-to-b from-[#2b8cff] to-[#0071e3]">
            <BellRing size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0071e3]">Reminder</p>
            <p className="text-sm font-medium text-[#1d1d1f] leading-snug break-words">{t.title}</p>
            <p className="text-[11px] text-[#86868b] mt-0.5">{t.when}</p>
            {t.summary ? (
              <button type="button" onClick={() => { dismissToast(t.id); navigate('/'); }}
                className="mt-1.5 text-xs font-semibold text-[#0071e3] hover:underline">View tasks</button>
            ) : (
              <button type="button" onClick={() => markDone(t.id)}
                className="mt-1.5 text-xs font-semibold text-[#0071e3] hover:underline flex items-center gap-1"><Check size={12} /> Mark done</button>
            )}
          </div>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss"
            className="w-6 h-6 rounded-full grid place-items-center text-[#86868b] hover:bg-black/5"><X size={13} /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
