import { Router } from 'express';
import db from '../db/index.js';
import { pushEnabled, vapidPublicKey, seedSubscription, validTz } from '../lib/push.js';

const router = Router();

// ── GET /api/push/key — VAPID public key (enabled: false when not configured) ─
router.get('/key', (req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
});

// ── POST /api/push/subscribe  { subscription: PushSubscription JSON, tz } ────
router.post('/subscribe', (req, res) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Push notifications are not configured on the server' });
    const { subscription, tz } = req.body || {};
    const endpoint = subscription?.endpoint;
    const { p256dh, auth } = subscription?.keys || {};
    if (!/^https:\/\//.test(endpoint || '') || !p256dh || !auth) return res.status(400).json({ error: 'Invalid push subscription' });
    const zone = validTz(tz) ? tz : 'UTC';

    const existing = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (existing) {
      // Re-sent on every app load — only write when something changed
      if (existing.user_id !== req.user.id || existing.p256dh !== p256dh || existing.auth !== auth || existing.tz !== zone) {
        db.prepare('UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, tz = ? WHERE id = ?')
          .run(req.user.id, p256dh, auth, zone, existing.id);
      }
      return res.json({ ok: true });
    }

    const info = db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, tz) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, endpoint, p256dh, auth, zone);
    seedSubscription(info.lastInsertRowid, zone);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/push/unsubscribe  { endpoint } ─────────────────────────────────
router.post('/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    const row = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (row) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
