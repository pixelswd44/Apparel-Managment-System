import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = db.prepare(
      'INSERT INTO categories (name, description, color) VALUES (?, ?, ?)'
    ).run(name, description ?? null, color ?? '#6366f1');
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, description, color } = req.body;
    db.prepare(
      'UPDATE categories SET name = ?, description = ?, color = ? WHERE id = ?'
    ).run(name, description ?? null, color ?? '#6366f1', req.params.id);
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Category not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
