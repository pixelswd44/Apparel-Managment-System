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
  const { month, from, to, category_id, project_id, employee_id } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, ec.color as category_color, p.title as project_title,
           emp.name as employee_name
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN employees emp ON emp.id = e.employee_id
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
  // project_id=none → business expenses only; any id → that project's expenses
  if (project_id === 'none') sql += ` AND e.project_id IS NULL`;
  else if (project_id) { sql += ` AND e.project_id = ?`; params.push(project_id); }
  if (employee_id) { sql += ` AND e.employee_id = ?`; params.push(employee_id); }
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

// Fields shared by create/update. project_id charges the expense to a project
// (null = business expense); paid_to is who received the money (optional).
function expenseFields(body) {
  const {
    title, category = '', expense_category_id = null, amount = 0,
    paid_by = '', paid_to = '', project_id = null, expense_date = null, notes = '',
    payment_method = 'cash', receipt_url = '', recurring = 0, recurring_period = 'monthly',
    employee_id = null,
  } = body;
  const pid = project_id ? parseInt(project_id) : null;
  const eid = employee_id ? parseInt(employee_id) : null;
  return {
    employee_id: eid && db.prepare('SELECT 1 FROM employees WHERE id = ?').get(eid) ? eid : null,
    title, category, expense_category_id: expense_category_id || null, amount: parseFloat(amount) || 0,
    paid_by, paid_to: (paid_to || '').trim(), project_id: pid && db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid) ? pid : null,
    expense_date, notes, payment_method, receipt_url, recurring: recurring ? 1 : 0, recurring_period,
  };
}

// An expense of type "Advance" for an employee keeps a matching advance record in
// Employees (linked by expense_id) so balances and repayments work there. The
// ledger skips linked advances — the expense itself is already in it.
function syncAdvance(expenseId, f) {
  const isAdv = f.employee_id && (f.title || '').trim().toLowerCase() === 'advance';
  const linked = db.prepare('SELECT id FROM employee_advances WHERE expense_id = ?').get(expenseId);
  const date = f.expense_date || new Date().toISOString().split('T')[0];
  if (isAdv) {
    const reason = (f.notes || '').trim() || 'Advance from Expenses';
    if (linked) {
      db.prepare('UPDATE employee_advances SET employee_id=?, amount=?, date=?, reason=? WHERE id=?')
        .run(f.employee_id, f.amount, date, reason, linked.id);
    } else {
      db.prepare(`INSERT INTO employee_advances (employee_id, amount, date, reason, repaid_amount, status, notes, expense_id)
                  VALUES (?, ?, ?, ?, 0, 'pending', '', ?)`)
        .run(f.employee_id, f.amount, date, reason, expenseId);
    }
  } else if (linked) {
    db.prepare('DELETE FROM employee_advances WHERE id = ?').run(linked.id);
  }
}

// One-off catch-up for Advance expenses saved before this link existed
try {
  const pending = db.prepare(`SELECT * FROM expenses e WHERE e.employee_id IS NOT NULL AND LOWER(TRIM(e.title)) = 'advance'
                              AND NOT EXISTS (SELECT 1 FROM employee_advances a WHERE a.expense_id = e.id)`).all();
  for (const e of pending) syncAdvance(e.id, e);
} catch {}

const SELECT_ONE = `
  SELECT e.*, ec.name as category_name, ec.color as category_color, p.title as project_title,
         emp.name as employee_name
  FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
  LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN employees emp ON emp.id = e.employee_id
  WHERE e.id = ?
`;

router.post('/', (req, res) => {
  const f = expenseFields(req.body);
  if (!f.title?.trim()) return res.status(400).json({ error: 'Title is required.' });
  const today = new Date().toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO expenses
      (title, category, expense_category_id, amount, paid_by, paid_to, project_id, expense_date, notes,
       payment_method, receipt_url, recurring, recurring_period, employee_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(f.title.trim(), f.category, f.expense_category_id, f.amount, f.paid_by, f.paid_to, f.project_id,
         f.expense_date || today, f.notes, f.payment_method, f.receipt_url, f.recurring, f.recurring_period, f.employee_id);
  syncAdvance(result.lastInsertRowid, f);
  res.json(db.prepare(SELECT_ONE).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const f = expenseFields(req.body);
  if (!f.title?.trim()) return res.status(400).json({ error: 'Title is required.' });
  db.prepare(`
    UPDATE expenses SET
      title=?, category=?, expense_category_id=?, amount=?, paid_by=?, paid_to=?, project_id=?, expense_date=?, notes=?,
      payment_method=?, receipt_url=?, recurring=?, recurring_period=?, employee_id=?
    WHERE id=?
  `).run(f.title.trim(), f.category, f.expense_category_id, f.amount, f.paid_by, f.paid_to, f.project_id,
         f.expense_date, f.notes, f.payment_method, f.receipt_url, f.recurring, f.recurring_period, f.employee_id,
         req.params.id);
  const exp = db.prepare(SELECT_ONE).get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  syncAdvance(Number(req.params.id), f);
  res.json(exp);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM employee_advances WHERE expense_id=?').run(req.params.id);
  db.prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

export default router;
