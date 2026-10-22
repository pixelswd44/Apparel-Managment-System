import webpush from 'web-push';
import db from '../db/index.js';

// Web Push for task reminders — delivers a system notification when a task
// falls due, even with the app closed. Needs VAPID keys in the environment:
//   npx web-push generate-vapid-keys
//   VAPID_PUBLIC_KEY=…  VAPID_PRIVATE_KEY=…  VAPID_SUBJECT=mailto:you@example.com
// Without them push stays off and the app falls back to open-tab notifications.

const PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const APP_URL     = process.env.APP_URL || '';
const SUBJECT     = process.env.VAPID_SUBJECT || (/^https:/.test(APP_URL) ? APP_URL : '');

const TICK_MS      = 60 * 1000;
const PRUNE_MS     = 60 * 60 * 1000;
const ALL_DAY_TIME = '09:00'; // all-day tasks fall due at 09:00 local (same as the client)

let enabled = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  if (!SUBJECT) {
    console.warn('[push] VAPID keys set but no VAPID_SUBJECT (mailto: or https: URL) — push disabled');
  } else {
    try {
      webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
      enabled = true;
    } catch (e) {
      console.error(`[push] invalid VAPID config — push disabled: ${e.message}`);
    }
  }
}

export const pushEnabled = () => enabled;
export const vapidPublicKey = () => (enabled ? PUBLIC_KEY : '');

export function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// ── Local wall-clock time in a time zone, as "YYYY-MM-DDTHH:MM" ─────────────
const fmtCache = new Map();
function wallNow(tz, at = new Date()) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// remind_at is "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" in the user's local time
function dueWall(r) {
  const day = String(r.remind_at || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const m = String(r.remind_at).match(/T(\d{2}:\d{2})/);
  return `${day}T${m ? m[1] : ALL_DAY_TIME}`;
}

const sig = r => `${r.id}@${r.remind_at}`;

function whenLabel(r, today) {
  const day = String(r.remind_at).slice(0, 10);
  const m = String(r.remind_at).match(/T(\d{2}):(\d{2})/);
  const d = new Date(`${day}T00:00:00Z`);
  const dayText = day === today ? 'Today'
    : d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  if (!m) return dayText;
  const h = Number(m[1]);
  return `${dayText} · ${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

function payloadFor(fresh, today) {
  if (fresh.length === 1) {
    const r = fresh[0];
    return { title: r.title, body: `Reminder · ${whenLabel(r, today)}`, tag: `crm-reminder-${r.id}`, url: '/' };
  }
  return {
    title: `${fresh.length} tasks are due`,
    body: fresh.slice(0, 5).map(r => `• ${r.title}`).join('\n') + (fresh.length > 5 ? '\n…' : ''),
    tag: 'crm-reminders', url: '/',
  };
}

const openReminders = () => db.prepare('SELECT id, title, remind_at FROM reminders WHERE done = 0').all();

// Mark everything already due as pushed, so a newly subscribed device only gets
// reminders that fall due from now on (the open app shows the overdue ones).
export function seedSubscription(subId, tz) {
  const now = wallNow(tz);
  const due = openReminders().filter(r => { const d = dueWall(r); return d && d <= now; });
  if (!due.length) return;
  const ins = db.prepare('INSERT OR IGNORE INTO push_sent (subscription_id, reminder_id, sig) VALUES (?, ?, ?)');
  db.transaction(() => { for (const r of due) ins.run(subId, r.id, sig(r)); })();
}

async function send(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 12 * 60 * 60, urgency: 'high' },
    );
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      // The browser dropped this subscription — forget it
      db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
    } else {
      console.error(`[push] send failed (${e.statusCode || e.code || 'error'}): ${e.body || e.message}`);
    }
  }
}

let running = false;
let lastPrune = 0;

export async function tick() {
  if (!enabled || running) return;
  running = true;
  try {
    const subs = db.prepare('SELECT * FROM push_subscriptions').all();
    if (!subs.length) return;
    const open = openReminders();
    const sent = new Set(db.prepare('SELECT subscription_id, sig FROM push_sent').all().map(r => `${r.subscription_id}|${r.sig}`));

    const outbox = [];
    for (const sub of subs) {
      const tz = validTz(sub.tz) ? sub.tz : 'UTC';
      const now = wallNow(tz);
      const fresh = open.filter(r => { const d = dueWall(r); return d && d <= now && !sent.has(`${sub.id}|${sig(r)}`); });
      if (fresh.length) outbox.push({ sub, fresh, today: now.slice(0, 10) });
    }

    if (outbox.length) {
      // Record first (one DB write) so a slow or failing push service never repeats a reminder
      const ins = db.prepare('INSERT OR IGNORE INTO push_sent (subscription_id, reminder_id, sig) VALUES (?, ?, ?)');
      db.transaction(() => { for (const o of outbox) for (const r of o.fresh) ins.run(o.sub.id, r.id, sig(r)); })();
      await Promise.all(outbox.map(o => send(o.sub, payloadFor(o.fresh, o.today))));
    }

    // Drop records of tasks that were deleted or completed (only write when needed)
    if (Date.now() - lastPrune > PRUNE_MS) {
      lastPrune = Date.now();
      const stale = 'reminder_id NOT IN (SELECT id FROM reminders WHERE done = 0)';
      if (db.prepare(`SELECT COUNT(*) AS n FROM push_sent WHERE ${stale}`).get().n) {
        db.prepare(`DELETE FROM push_sent WHERE ${stale}`).run();
      }
    }
  } catch (e) {
    console.error(`[push] reminder job failed: ${e.message}`);
  } finally {
    running = false;
  }
}

export function startPushJob() {
  if (!enabled) {
    console.log('[push] Web Push disabled (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT to enable)');
    return;
  }
  console.log('[push] Web Push enabled — checking reminders every minute');
  setTimeout(tick, 5000);
  setInterval(tick, TICK_MS);
}
