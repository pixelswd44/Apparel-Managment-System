// Apparel CRM service worker — shows task reminders pushed by the server
// (server/src/lib/push.js), even when no tab of the app is open.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Reminder', body: event.data?.text() || '' }; }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.filter(c => c.visibilityState === 'visible');
    if (visible.length) {
      // The app is on screen — its own toast covers this, so don't double up
      visible.forEach(c => c.postMessage({ type: 'reminder-push', tag: data.tag }));
      return;
    }
    await self.registration.showNotification(data.title || 'Reminder', {
      body: data.body || '',
      tag: data.tag || 'crm-reminder',
      icon: '/icon-192.png',
      data: { url: data.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = windows.find(c => new URL(c.url).origin === self.location.origin);
    if (win) {
      // Route inside the open app (keeps unsaved work) instead of reloading it
      await win.focus();
      win.postMessage({ type: 'open', url: event.notification.data?.url || '/' });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
