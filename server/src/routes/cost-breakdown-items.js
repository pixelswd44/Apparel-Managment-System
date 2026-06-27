import { Router } from 'express';
import db, { DEFAULT_COST_ITEMS, seedCostItems } from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM cost_breakdown_items ORDER BY sort_order ASC, id ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label required' });
    const key = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM cost_breakdown_items').get().m;
    const result = db.prepare(
      'INSERT INTO cost_breakdown_items (key, label, enabled, sort_order) VALUES (?, ?, 1, ?)'
    ).run(key || 'item', label.trim(), maxOrder + 1);
    res.status(201).json(db.prepare('SELECT * FROM cost_breakdown_items WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk save (reorder + toggle + rename)
router.put('/bulk', (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array required' });
    const update = db.prepare(
      'UPDATE cost_breakdown_items SET label = ?, enabled = ?, sort_order = ? WHERE id = ?'
    );
    db.transaction(() => {
      items.forEach((item, i) => update.run(item.label, item.enabled ? 1 : 0, i, item.id));
    })();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore defaults
router.post('/restore-defaults', (req, res) => {
  try {
    db.prepare('DELETE FROM cost_breakdown_items').run();
    const insert = db.prepare(
      'INSERT INTO cost_breakdown_items (key, label, enabled, sort_order) VALUES (?, ?, 1, ?)'
    );
    DEFAULT_COST_ITEMS.forEach((item, i) => insert.run(item.key, item.label, i));
    res.json(db.prepare('SELECT * FROM cost_breakdown_items ORDER BY sort_order ASC').all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { label, enabled } = req.body;
    db.prepare('UPDATE cost_breakdown_items SET label = ?, enabled = ? WHERE id = ?')
      .run(label, enabled ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM cost_breakdown_items WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM cost_breakdown_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
