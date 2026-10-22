// Web Push for task reminders: registers /sw.js and subscribes this device so
// the server (server/src/lib/push.js) can notify it while the app is closed.
import api from './api';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function sameKey(a, b) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

let registration;
export function registerServiceWorker() {
  if (!pushSupported()) return Promise.resolve(null);
  registration ||= navigator.serviceWorker.register('/sw.js').catch(() => null);
  return registration;
}

// Subscribe (or re-sync) this device. Needs notification permission already
// granted. Resolves true when reminders will be pushed to this device.
export async function ensurePushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const { data } = await api.get('/push/key');
  if (!data?.enabled || !data.publicKey) return false;
  if (!(await registerServiceWorker())) return false;
  const reg = await navigator.serviceWorker.ready;

  const appKey = keyBytes(data.publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, appKey)) { // server keys changed
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  await api.post('/push/subscribe', { subscription: sub.toJSON(), tz });
  return true;
}

// Stop pushes to this device (on sign-out). Takes the token up front because
// the caller clears it right after.
export async function removePushSubscription() {
  if (!pushSupported()) return;
  const token = localStorage.getItem('crm_token');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    if (token) await api.post('/push/unsubscribe', { endpoint: sub.endpoint }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* nothing to remove */ }
}
