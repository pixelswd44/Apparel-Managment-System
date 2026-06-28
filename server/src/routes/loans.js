import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/loans?direction=borrowed|lent
router.get('/', (req, res) => {
  const { direction } = req.query;
  const filter = direction ? `WHERE cl.direction = ?` : '';
  const params = direction ? [direction] : [];

  const loans = db.prepare(`
    SELECT cl.*,
      COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = cl.id), 0) as repaid
    FROM capital_loans cl
    ${filter}
    ORDER BY cl.date DESC
  `).all(...params);

  // Attach repayment history to each loan
  const repStmt = db.prepare('SELECT * FROM loan_repayments WHERE loan_id = ? ORDER BY date ASC');
  const result = loans.map(l => ({
    ...l,
    repayments: repStmt.all(l.id),
    outstanding: parseFloat(l.amount) - parseFloat(l.repaid || 0),
  }));

  res.json(result);
});

// POST /api/loans
router.post('/', (req, res) => {
  const { person_name, amount, date, direction = 'borrowed', notes = '' } = req.body;
  if (!person_name || !amount || !date) return res.status(400).json({ error: 'person_name, amount, date required' });
  const r = db.prepare(
    `INSERT INTO capital_loans (lender_name, amount, date, direction, notes, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  ).run(person_name, amount, date, direction, notes);
  const loan = db.prepare('SELECT * FROM capital_loans WHERE id = ?').get(r.lastInsertRowid);
  res.json({ ...loan, repayments: [], repaid: 0, outstanding: parseFloat(amount) });
});

// PUT /api/loans/:id
router.put('/:id', (req, res) => {
  const { person_name, amount, date, direction, notes, status } = req.body;
  db.prepare(
    `UPDATE capital_loans SET lender_name=?, amount=?, date=?, direction=?, notes=?, status=?, updated_at=datetime('now') WHERE id=?`
  ).run(person_name, amount, date, direction, notes ?? '', status ?? 'active', req.params.id);
  res.json(db.prepare('SELECT * FROM capital_loans WHERE id = ?').get(req.params.id));
});

// DELETE /api/loans/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM capital_loans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/loans/:id/repayments
router.post('/:id/repayments', (req, res) => {
  const { amount, date, notes = '' } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'amount and date required' });
  const r = db.prepare(
    'INSERT INTO loan_repayments (loan_id, amount, date, notes) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, amount, date, notes);
  res.json(db.prepare('SELECT * FROM loan_repayments WHERE id = ?').get(r.lastInsertRowid));
});

// DELETE /api/loans/:id/repayments/:rid
router.delete('/:id/repayments/:rid', (req, res) => {
  db.prepare('DELETE FROM loan_repayments WHERE id = ? AND loan_id = ?').run(req.params.rid, req.params.id);
  res.json({ success: true });
});

export default router;
