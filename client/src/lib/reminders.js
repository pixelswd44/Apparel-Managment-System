// Shared helpers for tasks / reminders (stored in /api/reminders).
// remind_at is "YYYY-MM-DD" (all-day) or "YYYY-MM-DDTHH:MM" (with a time).
import { UserRound, FolderKanban } from 'lucide-react';

export const REMINDERS_CHANGED = 'reminders-changed';

// All-day tasks fall due at this local hour
const ALL_DAY_HOUR = 9;

const pad = n => String(n).padStart(2, '0');
export const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayOf  = r => String(r?.remind_at || '').slice(0, 10);
export const timeOf = r => { const m = String(r?.remind_at || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; };

// The moment a task is due, as a Date in local time
export function dueAt(r) {
  const day = dayOf(r);
  if (!day) return null;
  const t = timeOf(r) || `${pad(ALL_DAY_HOUR)}:00`;
  const d = new Date(`${day}T${t}:00`);
  return isNaN(d) ? null : d;
}

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// "Today", "Tomorrow", "Yesterday" or "Tue 28 Oct" (+ year when not this year)
export function dayLabel(day) {
  const now = new Date();
  const today    = isoDay(now);
  const tomorrow = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterday = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (day === today)     return 'Today';
  if (day === tomorrow)  return 'Tomorrow';
  if (day === yesterday) return 'Yesterday';
  const d = new Date(day + 'T00:00:00');
  if (isNaN(d)) return day;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const whenLabel = r => [dayLabel(dayOf(r)), fmtTime(timeOf(r))].filter(Boolean).join(' · ');

// What a task is for: a project, a client, or nothing (general)
export const LINK_ICON = { client: UserRound, project: FolderKanban };
export function linkOf(r) {
  if (r?.project_id && r.project_title) return { type: 'project', id: r.project_id, name: r.project_title, sub: r.project_client_name || '' };
  if (r?.client_id && r.client_name)    return { type: 'client',  id: r.client_id,  name: r.client_name };
  return null;
}
export const linkPath = l => (l?.type === 'project' ? `/projects/${l.id}/edit` : l?.type === 'client' ? `/clients/${l.id}/edit` : '');

// Tell every open widget / bell that tasks changed
export const announceRemindersChanged = () => window.dispatchEvent(new Event(REMINDERS_CHANGED));
