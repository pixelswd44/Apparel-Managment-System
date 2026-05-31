import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/document-templates?type=quotation
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM document_templates';
    const params = [];
    if (type) { sql += ' WHERE type = ?'; params.push(type); }
    sql += ' ORDER BY is_default DESC, updated_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/document-templates/default?type=quotation
router.get('/default', (req, res) => {
  try {
    const { type } = req.query;
    if (!type) return res.status(400).json({ error: 'type is required' });
    const row = db.prepare('SELECT * FROM document_templates WHERE type = ? AND is_default = 1 ORDER BY updated_at DESC LIMIT 1').get(type);
    res.json(row || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/document-templates/:id
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/document-templates
router.post('/', (req, res) => {
  try {
    const { name, type, layout = 'classic', config = {} } = req.body;
    const configStr = typeof config === 'string' ? config : JSON.stringify(config);
    const result = db.prepare(
      "INSERT INTO document_templates (name, type, layout, is_default, config) VALUES (?, ?, ?, 0, ?)"
    ).run(name, type, layout, configStr);
    res.status(201).json(db.prepare('SELECT * FROM document_templates WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/document-templates/:id
router.put('/:id', (req, res) => {
  try {
    const { name, layout, config } = req.body;
    const configStr = typeof config === 'string' ? config : JSON.stringify(config ?? {});
    db.prepare(
      "UPDATE document_templates SET name = ?, layout = ?, config = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(name, layout, configStr, req.params.id);
    res.json(db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/document-templates/:id/set-default
router.put('/:id/set-default', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE document_templates SET is_default = 0 WHERE type = ?').run(row.type);
    db.prepare("UPDATE document_templates SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(row.id);
    res.json(db.prepare('SELECT * FROM document_templates WHERE id = ?').get(row.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/document-templates/:id
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.is_default) return res.status(400).json({ error: 'Cannot delete the default template. Set another as default first.' });
    db.prepare('DELETE FROM document_templates WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
