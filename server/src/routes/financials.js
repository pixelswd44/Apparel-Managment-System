import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// ── Currency helper ─────────────────────────────────────────────────────────
// Build a map of { CODE → rate_to_pkr } for fast lookups
function getRates() {
  const rows = db.prepare('SELECT code, rate_to_pkr FROM currencies').all();
  const map = { PKR: 1 };
  for (const r of rows) {
    map[r.code] = parseFloat(r.rate_to_pkr) || 1;
  }
  return map;
}

// Convert an amount in `currency` → PKR
function toPKR(amount, currency, rates) {
  const rate = rates[currency] || rates['USD'] || 1;
  return (parseFloat(amount) || 0) * rate;
}

// ── Summary ────────────────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { from, to } = req.query;
  const rates    = getRates();
  const hasRange = from && to;

  // Revenue: payments received — filtered by date range when provided
  const rawPayments = hasRange
    ? db.prepare(`SELECT amount, COALESCE(currency,'PKR') as currency FROM payments WHERE date(paid_at) >= ? AND date(paid_at) <= ?`).all(from, to)
    : db.prepare(`SELECT amount, COALESCE(currency,'PKR') as currency FROM payments`).all();
  const invoiceRevenue = rawPayments.reduce((s, p) => s + toPKR(p.amount, p.currency, rates), 0);

  // Outstanding invoices — always real-time (status-based, not date-filtered)
  const rawOutstanding = db.prepare(`
    SELECT (total - amount_paid) as balance, COALESCE(currency,'PKR') as currency
    FROM invoices WHERE status != 'paid' AND total > amount_paid
  `).all();
  const outstanding = rawOutstanding.reduce((s, i) => s + toPKR(i.balance, i.currency, rates), 0);

  // Business expenses — stored in PKR
  const businessExpenses = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date >= ? AND expense_date <= ?`).get(from, to).total
    : db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses`).get().total;

  // Salaries paid — stored in PKR
  const salariesPaid = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(net_pay),0) as total FROM payroll_records WHERE status='paid' AND date(paid_at) >= ? AND date(paid_at) <= ?`).get(from, to).total
    : db.prepare(`SELECT COALESCE(SUM(net_pay),0) as total FROM payroll_records WHERE status='paid'`).get().total;

  // Vendor payments — stored in PKR
  const vendorPayments = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM project_vendor_payments WHERE date(paid_at) >= ? AND date(paid_at) <= ?`).get(from, to).total
    : db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM project_vendor_payments`).get().total;

  const totalExpenses = businessExpenses + salariesPaid + vendorPayments;
  const netProfit     = invoiceRevenue - totalExpenses;

  // Per-currency revenue breakdown for display
  const revenueByCC = {};
  for (const p of rawPayments) {
    const cc = p.currency || 'PKR';
    revenueByCC[cc] = (revenueByCC[cc] || 0) + (parseFloat(p.amount) || 0);
  }

  res.json({ invoiceRevenue, outstanding, businessExpenses, salariesPaid, vendorPayments, totalExpenses, netProfit, revenueByCC });
});

// ── Monthly P&L (last 12 months, or within a date range) ──────────────────
router.get('/monthly', (req, res) => {
  const { from, to } = req.query;
  const rates    = getRates();
  const hasRange = from && to;

  // Build the list of months to compute
  const months = [];
  if (hasRange) {
    let d = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    while (d <= end) {
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }

  const result = months.map(month => {
    // Revenue: convert each payment to PKR
    const monthPayments = db.prepare(`
      SELECT amount, COALESCE(currency, 'PKR') as currency
      FROM payments
      WHERE strftime('%Y-%m', paid_at) = ?
    `).all(month);
    const revenue = monthPayments.reduce((s, p) => s + toPKR(p.amount, p.currency, rates), 0);

    // Expenses in PKR
    const expenses = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', expense_date) = ?`
    ).get(month).total;

    const salaries = db.prepare(
      `SELECT COALESCE(SUM(net_pay), 0) as total FROM payroll_records WHERE status='paid' AND strftime('%Y-%m', paid_at) = ?`
    ).get(month).total;

    const vendorPay = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM project_vendor_payments WHERE strftime('%Y-%m', paid_at) = ?`
    ).get(month).total;

    const totalOut = expenses + salaries + vendorPay;
    return { month, revenue, expenses, salaries, vendorPay, totalOut, net: revenue - totalOut };
  });

  res.json(result);
});

// ── Expense breakdown by category ──────────────────────────────────────────
router.get('/expenses-by-category', (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT
      COALESCE(ec.name, 'Uncategorized') as category,
      COALESCE(ec.color, '#94a3b8') as color,
      COALESCE(SUM(e.amount), 0) as total
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ` AND e.expense_date >= ?`; params.push(from); }
  if (to)   { sql += ` AND e.expense_date <= ?`; params.push(to); }
  sql += ` GROUP BY e.expense_category_id ORDER BY total DESC`;
  res.json(db.prepare(sql).all(...params));
});

// ── Recent transactions ─────────────────────────────────────────────────────
router.get('/transactions', (req, res) => {
  const { from, to, limit: limitParam } = req.query;
  const rates    = getRates();
  const limit    = parseInt(limitParam) || 30;
  const hasRange = from && to;

  // Build queries with proper parameterized date bounds
  const payArgs   = hasRange ? [from, to, limit] : [limit];
  const expArgs   = hasRange ? [from, to, limit] : [limit];
  const vendArgs  = hasRange ? [from, to, limit] : [limit];
  const salArgs   = hasRange ? [from, to, limit] : [limit];
  const payWhere  = hasRange ? `AND date(p.paid_at) >= ? AND date(p.paid_at) <= ?`   : '';
  const expWhere  = hasRange ? `AND e.expense_date >= ? AND e.expense_date <= ?`      : '';
  const vendWhere = hasRange ? `AND date(pvp.paid_at) >= ? AND date(pvp.paid_at) <= ?` : '';
  const salWhere  = hasRange ? `AND date(pr.paid_at) >= ? AND date(pr.paid_at) <= ?`  : '';

  const rawPay = db.prepare(`
    SELECT p.id, 'income' as type, 'Invoice Payment' as category,
           i.number as reference, c.name as party,
           p.amount, COALESCE(p.currency,'PKR') as currency,
           p.paid_at as date
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE 1=1 ${payWhere}
    ORDER BY p.paid_at DESC LIMIT ?
  `).all(...payArgs);
  const payments = rawPay.map(p => ({ ...p, amount_pkr: toPKR(p.amount, p.currency, rates), amount_orig: p.amount }));

  const expenses = db.prepare(`
    SELECT e.id, 'expense' as type,
           COALESCE(ec.name, e.category, 'Expense') as category,
           e.title as reference, e.paid_by as party,
           e.amount, 'PKR' as currency,
           e.expense_date as date
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE 1=1 ${expWhere}
    ORDER BY e.expense_date DESC LIMIT ?
  `).all(...expArgs).map(e => ({ ...e, amount_pkr: e.amount, amount_orig: e.amount }));

  const vendorPay = db.prepare(`
    SELECT pvp.id, 'vendor' as type, 'Vendor Payment' as category,
           pv.vendor_name as reference, pv.vendor_name as party,
           pvp.amount, 'PKR' as currency,
           pvp.paid_at as date
    FROM project_vendor_payments pvp
    LEFT JOIN project_vendors pv ON pv.id = pvp.project_vendor_id
    WHERE 1=1 ${vendWhere}
    ORDER BY pvp.paid_at DESC LIMIT ?
  `).all(...vendArgs).map(p => ({ ...p, amount_pkr: p.amount, amount_orig: p.amount }));

  const salaries = db.prepare(`
    SELECT pr.id, 'salary' as type, 'Salary' as category,
           e.name as reference, e.name as party,
           pr.net_pay as amount, 'PKR' as currency,
           pr.paid_at as date
    FROM payroll_records pr
    LEFT JOIN employees e ON e.id = pr.employee_id
    WHERE pr.status = 'paid' ${salWhere}
    ORDER BY pr.paid_at DESC LIMIT ?
  `).all(...salArgs).map(s => ({ ...s, amount_pkr: s.amount, amount_orig: s.amount }));

  const all = [...payments, ...expenses, ...vendorPay, ...salaries]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);

  res.json(all);
});

export default router;
