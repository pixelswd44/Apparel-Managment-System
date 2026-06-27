import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const FIELDS = ['name', 'product_id', 'total_pieces', 'profit_margin', 'costs', 'size_breakdown', 'notes', 'currency'];

function coerce(f, v) {
  if (f === 'costs' || f === 'size_breakdown') return typeof v === 'string' ? v : JSON.stringify(v ?? {});
  if (f === 'product_id') return v ? parseInt(v) : null;
  if (['total_pieces', 'profit_margin'].includes(f)) return parseFloat(v) || 0;
  return v ?? null;
}

router.get('/', (req, res) => {
  try {
    const { product_id } = req.query;
    let sql = `
      SELECT t.*, p.name as product_name
      FROM calculator_templates t
      LEFT JOIN products p ON t.product_id = p.id
    `;
    const params = [];
    if (product_id) { sql += ' WHERE t.product_id = ?'; params.push(parseInt(product_id)); }
    sql += ' ORDER BY t.updated_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT t.*, p.name as product_name
      FROM calculator_templates t
      LEFT JOIN products p ON t.product_id = p.id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Template not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const vals = FIELDS.map(f => coerce(f, req.body[f]));
    const result = db.prepare(
      `INSERT INTO calculator_templates (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`
    ).run(...vals);
    const row = db.prepare('SELECT * FROM calculator_templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const vals = FIELDS.map(f => coerce(f, req.body[f]));
    const sets = FIELDS.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE calculator_templates SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM calculator_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Template not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM calculator_templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
