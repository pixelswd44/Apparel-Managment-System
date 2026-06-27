import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// ── Expense Categories ─────────────────────────────────────────────────────
router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM expense_categories ORDER BY name').all();
  res.json(cats);
});

router.post('/categories', (req, res) => {
  const { name, color = '#6366f1', icon = '' } = req.body;
  const result = db.prepare('INSERT INTO expense_categories (name, color, icon) VALUES (?, ?, ?)')
    .run(name, color, icon);
  res.json({ id: result.lastInsertRowid, name, color, icon });
});

router.put('/categories/:id', (req, res) => {
  const { name, color = '#6366f1', icon = '' } = req.body;
  db.prepare('UPDATE expense_categories SET name=?, color=?, icon=? WHERE id=?')
    .run(name, color, icon, req.params.id);
  res.json(db.prepare('SELECT * FROM expense_categories WHERE id=?').get(req.params.id));
});

router.delete('/categories/:id', (req, res) => {
  // Unlink expenses from this category
  db.prepare('UPDATE expenses SET expense_category_id=NULL WHERE expense_category_id=?').run(req.params.id);
  db.prepare('DELETE FROM expense_categories WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Expenses CRUD ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { month, from, to, category_id } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, ec.color as category_color
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE 1=1
  `;
  const params = [];
  if (from && to) {
    sql += ` AND e.expense_date >= ? AND e.expense_date <= ?`;
    params.push(from, to);
  } else if (month) {
    sql += ` AND strftime('%Y-%m', e.expense_date) = ?`;
    params.push(month);
  }
  if (category_id) {
    sql += ` AND e.expense_category_id = ?`;
    params.push(category_id);
  }
  sql += ` ORDER BY e.expense_date DESC, e.created_at DESC`;
  const expenses = db.prepare(sql).all(...params);
  res.json(expenses);
});

router.get('/summary', (req, res) => {
  const { month, from, to } = req.query;
  const hasRange = from && to;

  let thisMonthRow, byCategory;

  if (hasRange) {
    thisMonthRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE expense_date >= ? AND expense_date <= ?
    `).get(from, to);
    byCategory = db.prepare(`
      SELECT ec.name, ec.color, COALESCE(SUM(e.amount), 0) as total
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
      WHERE e.expense_date >= ? AND e.expense_date <= ?
      GROUP BY e.expense_category_id
      ORDER BY total DESC
    `).all(from, to);
  } else {
    const curMonth = month || new Date().toISOString().slice(0, 7);
    thisMonthRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE strftime('%Y-%m', expense_date) = ?
    `).get(curMonth);
    byCategory = db.prepare(`
      SELECT ec.name, ec.color, COALESCE(SUM(e.amount), 0) as total
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
      WHERE strftime('%Y-%m', e.expense_date) = ?
      GROUP BY e.expense_category_id
      ORDER BY total DESC
    `).all(curMonth);
  }

  const recurring = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM expenses
    WHERE recurring = 1 AND recurring_period = 'monthly'
  `).get();

  res.json({ thisMonth: thisMonthRow.total, recurringMonthly: recurring.total, byCategory });
});

router.post('/', (req, res) => {
  const {
    title, category = '', expense_category_id = null, amount = 0,
    paid_by = '', expense_date = null, notes = '',
    payment_method = 'cash', receipt_url = '', recurring = 0, recurring_period = 'monthly'
  } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO expenses
      (title, category, expense_category_id, amount, paid_by, expense_date, notes,
       payment_method, receipt_url, recurring, recurring_period)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(title, category, expense_category_id, amount, paid_by,
         expense_date || today, notes, payment_method, receipt_url, recurring ? 1 : 0, recurring_period);
  const exp = db.prepare(`
    SELECT e.*, ec.name as category_name, ec.color as category_color
    FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE e.id=?
  `).get(result.lastInsertRowid);
  res.json(exp);
});

router.put('/:id', (req, res) => {
  const {
    title, category = '', expense_category_id = null, amount = 0,
    paid_by = '', expense_date = null, notes = '',
    payment_method = 'cash', receipt_url = '', recurring = 0, recurring_period = 'monthly'
  } = req.body;
  db.prepare(`
    UPDATE expenses SET
      title=?, category=?, expense_category_id=?, amount=?, paid_by=?, expense_date=?, notes=?,
      payment_method=?, receipt_url=?, recurring=?, recurring_period=?
    WHERE id=?
  `).run(title, category, expense_category_id, amount, paid_by,
         expense_date, notes, payment_method, receipt_url, recurring ? 1 : 0, recurring_period,
         req.params.id);
  const exp = db.prepare(`
    SELECT e.*, ec.name as category_name, ec.color as category_color
    FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE e.id=?
  `).get(req.params.id);
  res.json(exp);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

export default router;
