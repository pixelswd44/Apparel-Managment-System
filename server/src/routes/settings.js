import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/settings — returns all settings as a flat object { key: value }
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const obj = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:key
router.put('/:key', (req, res) => {
  try {
    const { value } = req.body;
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(req.params.key, String(value));
    res.json({ key: req.params.key, value: String(value) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
