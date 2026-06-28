import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────
function enrichEmployee(e) {
  if (!e) return null;
  const advances = db.prepare(
    'SELECT * FROM employee_advances WHERE employee_id=? ORDER BY date DESC'
  ).all(e.id);
  const pendingAdv = advances
    .filter(a => a.status !== 'cleared')
    .reduce((s, a) => s + (parseFloat(a.amount) - parseFloat(a.repaid_amount || 0)), 0);
  return { ...e, advances, pending_advance: pendingAdv };
}

// ── Employees CRUD ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const employees = db.prepare(`
    SELECT e.*,
      COALESCE((
        SELECT SUM(a.amount - COALESCE(a.repaid_amount,0))
        FROM employee_advances a
        WHERE a.employee_id = e.id AND a.status != 'cleared'
      ), 0) as pending_advance
    FROM employees e
    ORDER BY e.name
  `).all();
  res.json(employees);
});

router.get('/:id', (req, res) => {
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  res.json(enrichEmployee(e));
});

router.post('/', (req, res) => {
  const {
    name, designation = '', department = '', phone = '', email = '',
    cnic = '', salary = 0, joined_at = null, status = 'active',
    bank_name = '', bank_account = '', bank_iban = '', address = '', notes = ''
  } = req.body;
  const result = db.prepare(`
    INSERT INTO employees
      (name, designation, department, phone, email, cnic, salary,
       joined_at, status, bank_name, bank_account, bank_iban, address, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, designation, department, phone, email, cnic, salary,
         joined_at, status, bank_name, bank_account, bank_iban, address, notes);
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(result.lastInsertRowid);
  res.json(enrichEmployee(e));
});

router.put('/:id', (req, res) => {
  const {
    name, designation = '', department = '', phone = '', email = '',
    cnic = '', salary = 0, joined_at = null, status = 'active',
    bank_name = '', bank_account = '', bank_iban = '', address = '', notes = ''
  } = req.body;
  db.prepare(`
    UPDATE employees SET
      name=?, designation=?, department=?, phone=?, email=?,
      cnic=?, salary=?, joined_at=?, status=?,
      bank_name=?, bank_account=?, bank_iban=?, address=?, notes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(name, designation, department, phone, email, cnic, salary,
         joined_at, status, bank_name, bank_account, bank_iban, address, notes,
         req.params.id);
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  res.json(enrichEmployee(e));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Advances ───────────────────────────────────────────────────────────────
router.get('/:id/advances', (req, res) => {
  const advances = db.prepare(
    'SELECT * FROM employee_advances WHERE employee_id=? ORDER BY date DESC'
  ).all(req.params.id);
  res.json(advances);
});

router.post('/:id/advances', (req, res) => {
  const { amount, date, reason = '', notes = '' } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO employee_advances (employee_id, amount, date, reason, repaid_amount, status, notes)
    VALUES (?, ?, ?, ?, 0, 'pending', ?)
  `).run(req.params.id, amount, date || today, reason, notes);
  res.json(db.prepare('SELECT * FROM employee_advances WHERE id=?').get(result.lastInsertRowid));
});

router.put('/:id/advances/:advId', (req, res) => {
  const { amount, date, reason = '', repaid_amount = 0, status = 'pending', notes = '' } = req.body;
  db.prepare(`
    UPDATE employee_advances
    SET amount=?, date=?, reason=?, repaid_amount=?, status=?, notes=?
    WHERE id=? AND employee_id=?
  `).run(amount, date, reason, repaid_amount, status, notes, req.params.advId, req.params.id);
  res.json(db.prepare('SELECT * FROM employee_advances WHERE id=?').get(req.params.advId));
});

router.delete('/:id/advances/:advId', (req, res) => {
  db.prepare('DELETE FROM employee_advances WHERE id=? AND employee_id=?')
    .run(req.params.advId, req.params.id);
  res.json({ success: true });
});

// ── Payroll Records ────────────────────────────────────────────────────────
router.get('/:id/payroll', (req, res) => {
  const records = db.prepare(
    'SELECT * FROM payroll_records WHERE employee_id=? ORDER BY period DESC'
  ).all(req.params.id);
  res.json(records);
});

router.post('/:id/payroll', (req, res) => {
  const { period, base_salary, bonus = 0, deductions = 0, net_pay, notes = '' } = req.body;

  const save = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO payroll_records (employee_id, period, base_salary, bonus, deductions, net_pay, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(req.params.id, period, base_salary, bonus, deductions, net_pay, notes);

    // Apply deduction against pending advances (oldest first)
    let remaining = parseFloat(deductions) || 0;
    if (remaining > 0) {
      const pending = db.prepare(`
        SELECT * FROM employee_advances
        WHERE employee_id = ? AND status != 'cleared'
        ORDER BY date ASC, id ASC
      `).all(req.params.id);

      for (const adv of pending) {
        if (remaining <= 0) break;
        const outstanding = parseFloat(adv.amount) - parseFloat(adv.repaid_amount || 0);
        if (outstanding <= 0) continue;
        const applying = Math.min(remaining, outstanding);
        const newRepaid = parseFloat(adv.repaid_amount || 0) + applying;
        const newStatus = newRepaid >= parseFloat(adv.amount) ? 'cleared' : 'partial';
        db.prepare(`
          UPDATE employee_advances SET repaid_amount = ?, status = ? WHERE id = ?
        `).run(newRepaid, newStatus, adv.id);
        remaining -= applying;
      }
    }

    return result;
  });

  const result = save();
  res.json(db.prepare('SELECT * FROM payroll_records WHERE id=?').get(result.lastInsertRowid));
});

router.put('/:id/payroll/:recId', (req, res) => {
  const { period, base_salary, bonus = 0, deductions = 0, net_pay, status = 'pending', paid_at = null, notes = '' } = req.body;
  db.prepare(`
    UPDATE payroll_records SET period=?, base_salary=?, bonus=?, deductions=?, net_pay=?, status=?, paid_at=?, notes=?
    WHERE id=? AND employee_id=?
  `).run(period, base_salary, bonus, deductions, net_pay, status, paid_at, notes, req.params.recId, req.params.id);
  res.json(db.prepare('SELECT * FROM payroll_records WHERE id=?').get(req.params.recId));
});

router.delete('/:id/payroll/:recId', (req, res) => {
  db.prepare('DELETE FROM payroll_records WHERE id=? AND employee_id=?')
    .run(req.params.recId, req.params.id);
  res.json({ success: true });
});

// ── All payroll records (for financials) ──────────────────────────────────
router.get('/all/payroll', (req, res) => {
  const records = db.prepare(`
    SELECT pr.*, e.name as employee_name, e.designation
    FROM payroll_records pr
    LEFT JOIN employees e ON e.id = pr.employee_id
    ORDER BY pr.period DESC, pr.created_at DESC
  `).all();
  res.json(records);
});

export default router;
