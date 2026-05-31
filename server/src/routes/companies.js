import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const FIELDS = ['name', 'logo', 'address', 'city', 'country', 'phone', 'email', 'website', 'tax_number', 'bank_details'];

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM companies ORDER BY is_default DESC, name ASC').all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Company name is required.' });
    const vals = FIELDS.map(f => req.body[f]?.trim() ?? '');
    const isFirst = db.prepare('SELECT COUNT(*) as n FROM companies').get().n === 0;
    const result = db.prepare(`
      INSERT INTO companies (name, logo, address, city, country, phone, email, website, tax_number, bank_details, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...vals, isFirst ? 1 : 0);
    res.status(201).json(db.prepare('SELECT * FROM companies WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Company name is required.' });
    const vals = FIELDS.map(f => req.body[f]?.trim() ?? '');
    db.prepare(`
      UPDATE companies
      SET name=?, logo=?, address=?, city=?, country=?, phone=?, email=?, website=?, tax_number=?, bank_details=?,
          updated_at=datetime('now')
      WHERE id=?
    `).run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/set-default', (req, res) => {
  try {
    db.prepare('UPDATE companies SET is_default = 0').run();
    db.prepare("UPDATE companies SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.is_default) return res.status(400).json({ error: 'Cannot delete the default company. Set another company as default first.' });
    db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
