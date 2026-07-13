import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// ── Other Income CRUD ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { month, from, to } = req.query;
  let sql = `SELECT * FROM other_income WHERE 1=1`;
  const params = [];
  if (from && to) {
    sql += ` AND income_date >= ? AND income_date <= ?`;
    params.push(from, to);
  } else if (month) {
    sql += ` AND strftime('%Y-%m', income_date) = ?`;
    params.push(month);
  }
  sql += ` ORDER BY income_date DESC, created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/summary', (req, res) => {
  const { month, from, to } = req.query;
  const hasRange = from && to;

  let totalRow, bySource;
  if (hasRange) {
    totalRow = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM other_income WHERE income_date >= ? AND income_date <= ?`).get(from, to);
    bySource = db.prepare(`
      SELECT COALESCE(NULLIF(category,''), 'Uncategorized') as category, COALESCE(SUM(amount),0) as total
      FROM other_income WHERE income_date >= ? AND income_date <= ?
      GROUP BY category ORDER BY total DESC
    `).all(from, to);
  } else {
    const curMonth = month || new Date().toISOString().slice(0, 7);
    totalRow = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM other_income WHERE strftime('%Y-%m', income_date) = ?`).get(curMonth);
    bySource = db.prepare(`
      SELECT COALESCE(NULLIF(category,''), 'Uncategorized') as category, COALESCE(SUM(amount),0) as total
      FROM other_income WHERE strftime('%Y-%m', income_date) = ?
      GROUP BY category ORDER BY total DESC
    `).all(curMonth);
  }

  res.json({ thisMonth: totalRow.total, bySource });
});

router.post('/', (req, res) => {
  const { title, category = '', amount, received_by = '', payment_method = 'cash', income_date, notes = '' } = req.body;
  if (!title?.trim() || !income_date) return res.status(400).json({ error: 'title and income_date are required' });
  const result = db.prepare(`
    INSERT INTO other_income (title, category, amount, received_by, payment_method, income_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title.trim(), category, parseFloat(amount) || 0, received_by, payment_method, income_date, notes);
  res.status(201).json(db.prepare('SELECT * FROM other_income WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { title, category = '', amount, received_by = '', payment_method = 'cash', income_date, notes = '' } = req.body;
  if (!title?.trim() || !income_date) return res.status(400).json({ error: 'title and income_date are required' });
  db.prepare(`
    UPDATE other_income SET title=?, category=?, amount=?, received_by=?, payment_method=?, income_date=?, notes=?
    WHERE id=?
  `).run(title.trim(), category, parseFloat(amount) || 0, received_by, payment_method, income_date, notes, req.params.id);
  const row = db.prepare('SELECT * FROM other_income WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM other_income WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
