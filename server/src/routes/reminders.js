import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// A task is general, or linked to a client or a project (never both)
const clientName = c => `COALESCE(NULLIF(${c}.display_name, ''), NULLIF(${c}.company, ''), ${c}.name)`;
const SELECT = `
  SELECT r.*, ${clientName('c')} AS client_name, c.company AS client_company,
         p.title AS project_title, ${clientName('pc')} AS project_client_name
  FROM reminders r
  LEFT JOIN clients  c  ON c.id  = r.client_id
  LEFT JOIN projects p  ON p.id  = r.project_id
  LEFT JOIN clients  pc ON pc.id = p.client_id
`;
const idOrNull = v => (v === undefined || v === null || v === '' ? null : parseInt(v, 10) || null);

// ── GET /api/reminders/links — clients and projects a task can be linked to ─
router.get('/links', (req, res) => {
  try {
    const clients = db.prepare(`SELECT id, ${clientName('clients')} AS name FROM clients ORDER BY 2 COLLATE NOCASE`).all();
    const projects = db.prepare(`
      SELECT p.id, p.title, p.status, ${clientName('c')} AS client_name
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      ORDER BY p.updated_at DESC
    `).all();
    res.json({ clients, projects });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/reminders  (optional ?done=0|1) ──────────────────────────────
router.get('/', (req, res) => {
  try {
    const { done } = req.query;
    let sql = SELECT;
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
    const { title, note = '', remind_at } = req.body;
    if (!title || !remind_at) return res.status(400).json({ error: 'title and remind_at are required' });
    const project_id = idOrNull(req.body.project_id);
    const client_id  = project_id ? null : idOrNull(req.body.client_id);
    const stmt = db.prepare(`
      INSERT INTO reminders (client_id, project_id, title, note, remind_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(client_id, project_id, title, note, remind_at);
    const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/reminders/:id ────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, note, remind_at, done } = req.body;
    const existing = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });
    // Changing the link replaces it: a project link clears the client and vice versa
    let { client_id, project_id } = existing;
    if (req.body.project_id !== undefined || req.body.client_id !== undefined) {
      project_id = idOrNull(req.body.project_id);
      client_id  = project_id ? null : idOrNull(req.body.client_id);
    }

    db.prepare(`
      UPDATE reminders
      SET client_id  = ?,
          project_id = ?,
          title      = ?,
          note       = ?,
          remind_at  = ?,
          done       = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      client_id,
      project_id,
      title      !== undefined ? title      : existing.title,
      note       !== undefined ? note       : existing.note,
      remind_at  !== undefined ? remind_at  : existing.remind_at,
      done       !== undefined ? (done ? 1 : 0) : existing.done,
      id,
    );

    const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id);
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
