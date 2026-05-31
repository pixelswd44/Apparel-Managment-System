import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const FIELDS = ['name','type','contact_name','phone','email','address','city','country','bank_details','notes','rating','status'];

// ── GET list ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.*,
        (SELECT COUNT(DISTINCT pv.project_id) FROM project_vendors pv WHERE pv.vendor_id = v.id) as project_count,
        (SELECT COALESCE(SUM(pv.invoice_amount), 0) FROM project_vendors pv WHERE pv.vendor_id = v.id) as total_billed,
        (SELECT COALESCE(SUM(pvp.amount), 0) FROM project_vendor_payments pvp
           JOIN project_vendors pv ON pvp.project_vendor_id = pv.id WHERE pv.vendor_id = v.id) as total_paid
      FROM vendors v
      ORDER BY v.name ASC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET single with payment history ───────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Not found' });

    // Get all projects this vendor worked on
    const projectVendors = db.prepare(`
      SELECT pv.*,
        p.title as project_title, p.status as project_status,
        COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE project_vendor_id = pv.id), 0) as total_paid
      FROM project_vendors pv
      JOIN projects p ON pv.project_id = p.id
      WHERE pv.vendor_id = ?
      ORDER BY pv.created_at DESC
    `).all(req.params.id);

    // Get payments for each project_vendor
    const withPayments = projectVendors.map(pv => ({
      ...pv,
      payments: db.prepare(
        'SELECT * FROM project_vendor_payments WHERE project_vendor_id = ? ORDER BY paid_at DESC'
      ).all(pv.id),
    }));

    res.json({ ...vendor, projects: withPayments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });
    const vals = FIELDS.map(f => {
      if (f === 'rating') return parseInt(req.body[f]) || 0;
      if (f === 'status' && !req.body[f]) return 'active';
      if (f === 'type'   && !req.body[f]) return 'process';
      return req.body[f] ?? '';
    });
    const result = db.prepare(
      `INSERT INTO vendors (${FIELDS.join(',')}) VALUES (${FIELDS.map(() => '?').join(',')})`
    ).run(...vals);
    res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update ────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });
    const vals = FIELDS.map(f => {
      if (f === 'rating') return parseInt(req.body[f]) || 0;
      return req.body[f] ?? '';
    });
    db.prepare(
      `UPDATE vendors SET ${FIELDS.map(f => `${f}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`
    ).run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM vendors WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
