import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// ── GET /api/reminders  (optional ?done=0|1) ──────────────────────────────
router.get('/', (req, res) => {
  try {
    const { done } = req.query;
    let sql = `
      SELECT r.*, c.display_name AS client_name, c.company AS client_company
      FROM reminders r
      LEFT JOIN clients c ON c.id = r.client_id
    `;
    const params = [];
    if (done !== undefined) {
      sql += ' WHERE r.done = ?';
      params.push(parseInt(done, 10));
    }
    sql += ' ORDER BY r.remind_at ASC, r.id DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/reminders ───────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { client_id = null, title, note = '', remind_at } = req.body;
    if (!title || !remind_at) return res.status(400).json({ error: 'title and remind_at are required' });
    const stmt = db.prepare(`
      INSERT INTO reminders (client_id, title, note, remind_at)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(client_id || null, title, note, remind_at);
    const row = db.prepare(`
      SELECT r.*, c.display_name AS client_name, c.company AS client_company
      FROM reminders r LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/reminders/:id ────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { client_id, title, note, remind_at, done } = req.body;
    const existing = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });

    db.prepare(`
      UPDATE reminders
      SET client_id  = ?,
          title      = ?,
          note       = ?,
          remind_at  = ?,
          done       = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      client_id !== undefined ? (client_id || null) : existing.client_id,
      title      !== undefined ? title      : existing.title,
      note       !== undefined ? note       : existing.note,
      remind_at  !== undefined ? remind_at  : existing.remind_at,
      done       !== undefined ? (done ? 1 : 0) : existing.done,
      id,
    );

    const row = db.prepare(`
      SELECT r.*, c.display_name AS client_name, c.company AS client_company
      FROM reminders r LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.id = ?
    `).get(id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/reminders/:id ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
