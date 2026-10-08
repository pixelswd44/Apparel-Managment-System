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

// A payment's real PKR value — uses the manually entered actual amount received
// (bank fees / tax withholding mean this can differ from the theoretical
// amount × rate conversion) when set, otherwise falls back to the auto-conversion.
function paymentToPKR(payment, rates) {
  if (payment.amount_pkr_actual !== null && payment.amount_pkr_actual !== undefined && payment.amount_pkr_actual !== '') {
    return parseFloat(payment.amount_pkr_actual) || 0;
  }
  return toPKR(payment.amount, payment.currency, rates);
}

// ── Summary ────────────────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { from, to } = req.query;
  const rates    = getRates();
  const hasRange = from && to;

  // Revenue: payments received — filtered by date range when provided
  const rawPayments = hasRange
    ? db.prepare(`SELECT amount, COALESCE(currency,'PKR') as currency, amount_pkr_actual FROM payments WHERE date(paid_at) >= ? AND date(paid_at) <= ?`).all(from, to)
    : db.prepare(`SELECT amount, COALESCE(currency,'PKR') as currency, amount_pkr_actual FROM payments`).all();
  const invoiceRevenue = rawPayments.reduce((s, p) => s + paymentToPKR(p, rates), 0);

  // Other income — e.g. selling scrap fabric locally, outside the invoice flow. Stored in PKR.
  const otherIncome = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM other_income WHERE income_date >= ? AND income_date <= ?`).get(from, to).total
    : db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM other_income`).get().total;
  const totalRevenue = invoiceRevenue + otherIncome;

  // Outstanding invoices — always real-time (status-based, not date-filtered)
  const rawOutstanding = db.prepare(`
    SELECT (total - amount_paid) as balance, COALESCE(currency,'PKR') as currency
    FROM invoices WHERE status != 'paid' AND total > amount_paid
  `).all();
  const outstanding = rawOutstanding.reduce((s, i) => s + toPKR(i.balance, i.currency, rates), 0);

  // Spending is entered once, on the Expenses screen. An expense charged to a
  // project is a project cost; everything else is a business expense. All PKR.
  const expenseSum = (projectSql) => (hasRange
    ? db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE ${projectSql} AND expense_date >= ? AND expense_date <= ?`).get(from, to)
    : db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE ${projectSql}`).get()).total;
  const businessExpenses  = expenseSum('project_id IS NULL');
  const totalProjectsPaid = expenseSum('project_id IS NOT NULL');

  // Salaries paid — stored in PKR
  const salariesPaid = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(net_pay),0) as total FROM payroll_records WHERE status='paid' AND date(paid_at) >= ? AND date(paid_at) <= ?`).get(from, to).total
    : db.prepare(`SELECT COALESCE(SUM(net_pay),0) as total FROM payroll_records WHERE status='paid'`).get().total;

  // Project cost is what has been spent on projects (all time — a project's cost
  // isn't "in" one month), used by the lifetime Projected P&L below.
  const totalProjectsExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE project_id IS NOT NULL`).get().t;

  const totalExpenses = totalProjectsPaid + businessExpenses + salariesPaid;

  // Out of Pocket = cash already paid out minus cash received, both within the
  // selected period (positive = money that came from your pocket this period).
  const outOfPocket = totalExpenses - totalRevenue;

  // Projected P&L is a lifetime figure — the projected cost of a project isn't
  // "in" any one month — so its inputs are ALWAYS all-time, independent of the
  // period picker.
  const allTimeRevenue = hasRange
    ? db.prepare(`SELECT amount, COALESCE(currency,'PKR') as currency, amount_pkr_actual FROM payments`).all().reduce((s, p) => s + paymentToPKR(p, rates), 0)
      + db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM other_income`).get().t
    : totalRevenue;
  const allTimeBiz = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE project_id IS NULL`).get().t
    : businessExpenses;
  const allTimeSalaries = hasRange
    ? db.prepare(`SELECT COALESCE(SUM(net_pay),0) as t FROM payroll_records WHERE status='paid'`).get().t
    : salariesPaid;
  const projectedPL = (allTimeRevenue + outstanding) - (totalProjectsExpense + allTimeBiz + allTimeSalaries);

  // Legacy netProfit kept for compatibility (same as projectedPL)
  const netProfit = projectedPL;

  // Per-currency revenue breakdown for display
  const revenueByCC = {};
  for (const p of rawPayments) {
    const cc = p.currency || 'PKR';
    revenueByCC[cc] = (revenueByCC[cc] || 0) + (parseFloat(p.amount) || 0);
  }

  res.json({ invoiceRevenue, otherIncome, totalRevenue, outstanding, businessExpenses, salariesPaid, totalProjectsPaid, totalProjectsExpense, totalExpenses, outOfPocket, projectedPL, netProfit, revenueByCC });
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
      SELECT amount, COALESCE(currency, 'PKR') as currency, amount_pkr_actual
      FROM payments
      WHERE strftime('%Y-%m', paid_at) = ?
    `).all(month);
    const invoiceRevenue = monthPayments.reduce((s, p) => s + paymentToPKR(p, rates), 0);

    const otherIncome = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM other_income WHERE strftime('%Y-%m', income_date) = ?`
    ).get(month).total;
    const revenue = invoiceRevenue + otherIncome;

    // Spending in PKR — business expenses and project costs both live in expenses
    const expenses = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id IS NULL AND strftime('%Y-%m', expense_date) = ?`
    ).get(month).total;
    const projectCosts = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id IS NOT NULL AND strftime('%Y-%m', expense_date) = ?`
    ).get(month).total;

    const salaries = db.prepare(
      `SELECT COALESCE(SUM(net_pay), 0) as total FROM payroll_records WHERE status='paid' AND strftime('%Y-%m', paid_at) = ?`
    ).get(month).total;

    const totalOut = expenses + projectCosts + salaries;
    return { month, revenue, invoiceRevenue, otherIncome, expenses, projectCosts, salaries, totalOut, net: revenue - totalOut };
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
  const salArgs   = hasRange ? [from, to, limit] : [limit];
  const payWhere  = hasRange ? `AND date(p.paid_at) >= ? AND date(p.paid_at) <= ?`   : '';
  const expWhere  = hasRange ? `AND e.expense_date >= ? AND e.expense_date <= ?`      : '';
  const salWhere  = hasRange ? `AND date(pr.paid_at) >= ? AND date(pr.paid_at) <= ?`  : '';

  const rawPay = db.prepare(`
    SELECT p.id, 'income' as type, 'Invoice Payment' as category,
           i.number as reference, COALESCE(NULLIF(TRIM(c.display_name),''), NULLIF(TRIM(c.company),''), NULLIF(TRIM(c.name),''), NULLIF(TRIM(c.name_primary),''), '') as party,
           p.amount, COALESCE(p.currency,'PKR') as currency, p.amount_pkr_actual,
           p.paid_at as date
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE 1=1 ${payWhere}
    ORDER BY p.paid_at DESC LIMIT ?
  `).all(...payArgs);
  const payments = rawPay.map(p => ({ ...p, amount_pkr: paymentToPKR(p, rates), amount_orig: p.amount }));

  const expenses = db.prepare(`
    SELECT e.id, 'expense' as type,
           COALESCE(ec.name, e.category, 'Expense') as category,
           e.title as reference, COALESCE(NULLIF(TRIM(e.paid_to),''), e.paid_by) as party,
           e.amount, 'PKR' as currency,
           e.expense_date as date, p.title as project_title
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE 1=1 ${expWhere}
    ORDER BY e.expense_date DESC LIMIT ?
  `).all(...expArgs).map(e => ({ ...e, amount_pkr: e.amount, amount_orig: e.amount }));

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

  const all = [...payments, ...expenses, ...salaries]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);

  res.json(all);
});

// ── Ledger ─────────────────────────────────────────────────────────────────
// Returns every credit (income) and debit (expense) entry sorted by date ASC
// with a running balance, plus a summary section at the end.
router.get('/ledger', (req, res) => {
  const { from, to } = req.query;
  const rates = getRates();

  // Per-month opening-balance overrides. A month with a manual override resets
  // the running balance to that value at the start of the month; a month without
  // one simply carries the balance forward from everything before it — all the
  // way back to the very first recorded transaction.
  const overrides = db.prepare('SELECT month, amount FROM monthly_opening_balances ORDER BY month ASC').all()
    .map(o => ({ month: o.month, date: `${o.month}-01`, amount: parseFloat(o.amount) || 0 }));

  // We need full history (no lower bound) to compute the carried-forward balance;
  // the `from` cutoff for display is applied in JS further down.
  const dateFilter = (col) => to ? `AND date(${col}) <= '${to}'` : '';

  const entries = [];

  // ── CREDITS (Income) ───────────────────────────────────────────────────────
  const payments = db.prepare(`
    SELECT p.id, p.paid_at as date, p.amount, COALESCE(p.currency,'PKR') as currency, p.amount_pkr_actual,
           'Income' as section, 'Invoice Payment' as category,
           i.number as reference, COALESCE(NULLIF(TRIM(c.display_name),''), NULLIF(TRIM(c.company),''), NULLIF(TRIM(c.name),''), NULLIF(TRIM(c.name_primary),''), '') as party
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN clients  c ON c.id = p.client_id
    WHERE 1=1 ${dateFilter('p.paid_at')}
    ORDER BY p.paid_at ASC
  `).all();
  for (const p of payments) {
    entries.push({ date: p.date, section: 'Income', category: p.category,
      description: `Invoice ${p.reference || ''}`, party: p.party || '',
      credit: paymentToPKR(p, rates), debit: 0,
      currency: p.currency, amount_orig: parseFloat(p.amount) });
  }

  // Other income — e.g. selling scrap fabric locally, outside the invoice flow
  const otherIncome = db.prepare(`
    SELECT id, income_date as date, amount, title, category, received_by
    FROM other_income
    WHERE 1=1 ${dateFilter('income_date')}
    ORDER BY income_date ASC
  `).all();
  for (const inc of otherIncome) {
    entries.push({ date: inc.date, section: 'Income', category: inc.category || 'Other Income',
      description: inc.title, party: inc.received_by || '',
      credit: parseFloat(inc.amount) || 0, debit: 0,
      currency: 'PKR', amount_orig: parseFloat(inc.amount) || 0 });
  }

  // ── DEBITS (Expenses) ──────────────────────────────────────────────────────
  // All spending is entered on the Expenses screen. Expenses charged to a project
  // show under "Project Costs" (with the project name); the rest are business expenses.
  const expenseRows = db.prepare(`
    SELECT e.id, e.expense_date as date, e.amount, e.title as description, e.project_id,
           COALESCE(ec.name,'Expense') as category,
           COALESCE(NULLIF(TRIM(e.paid_to),''), e.paid_by) as party,
           p.title as project_title
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE 1=1 ${dateFilter('e.expense_date')}
    ORDER BY e.expense_date ASC
  `).all();
  for (const e of expenseRows) {
    const isProject = !!e.project_id;
    entries.push({ date: e.date, section: isProject ? 'Project Costs' : 'Business Expenses', category: e.category,
      description: `${e.description || e.category}${isProject && e.project_title ? ` (${e.project_title})` : ''}`,
      party: e.party || '', credit: 0, debit: parseFloat(e.amount) || 0, currency: 'PKR', amount_orig: parseFloat(e.amount) || 0 });
  }

  // Salaries
  const salaries = db.prepare(`
    SELECT pr.id, pr.paid_at as date, pr.net_pay as amount,
           emp.name as party
    FROM payroll_records pr
    LEFT JOIN employees emp ON emp.id = pr.employee_id
    WHERE pr.status = 'paid' ${dateFilter('pr.paid_at')}
    ORDER BY pr.paid_at ASC
  `).all();
  for (const s of salaries) {
    entries.push({ date: s.date, section: 'Salaries', category: 'Salary',
      description: `Salary – ${s.party || 'Employee'}`, party: s.party || '',
      credit: 0, debit: parseFloat(s.amount) || 0, currency: 'PKR', amount_orig: parseFloat(s.amount) || 0 });
  }

  // Employee advances
  const advances = db.prepare(`
    SELECT ea.id, ea.date, ea.amount, ea.reason, emp.name as party
    FROM employee_advances ea
    LEFT JOIN employees emp ON emp.id = ea.employee_id
    WHERE 1=1 ${dateFilter('ea.date')}
    ORDER BY ea.date ASC
  `).all();
  for (const a of advances) {
    entries.push({ date: a.date, section: 'Salaries', category: 'Advance',
      description: `Advance${a.reason ? ` – ${a.reason}` : ''}`, party: a.party || '',
      credit: 0, debit: parseFloat(a.amount) || 0, currency: 'PKR', amount_orig: parseFloat(a.amount) || 0 });
  }

  // Final date filter — some sources (fabric/process/extra costs) build entries
  // in JS from JSON fields and cannot be filtered in SQL, so we filter here to
  // guarantee nothing outside the requested range leaks through. Entries dated
  // before `from` aren't discarded — they're rolled into the carried-forward
  // opening balance below instead (applying any overrides encountered along the
  // way), so every month's balance connects continuously to the one before it.
  const normDay = e => (e.date || '').replace(' ', 'T').split('T')[0];
  entries.sort((a, b) => normDay(a).localeCompare(normDay(b)));

  const filtered = [];
  let carryForward = 0;
  let oi = 0; // cursor into `overrides`, applied strictly before `from`
  for (const e of entries) {
    const d = normDay(e);
    while (oi < overrides.length && overrides[oi].date <= d && (!from || overrides[oi].date < from)) {
      carryForward = overrides[oi].amount; oi++;
    }
    if (to && d > to) continue;
    if (from && d < from) {
      carryForward += (e.credit - e.debit);
      continue;
    }
    filtered.push(e);
  }
  while (oi < overrides.length && (!from || overrides[oi].date < from)) {
    carryForward = overrides[oi].amount; oi++;
  }

  // If a manual override exists for exactly the month being viewed, show it
  // directly. Otherwise show the balance carried forward into this period.
  const rawOverride  = from ? overrides.find(o => o.date === from) : null;
  const showCarried  = !rawOverride && !!from;
  const openingEntry = rawOverride ? [{
    date: rawOverride.date, section: 'Opening Balance', category: 'Opening Balance',
    description: 'Opening Balance', party: '',
    credit: rawOverride.amount, debit: 0, currency: 'PKR', amount_orig: rawOverride.amount,
    isOpeningBalance: true, carried: false, manual: true,
  }] : showCarried ? [{
    date: from, section: 'Opening Balance', category: 'Opening Balance',
    description: 'Opening Balance (carried forward)', party: '',
    credit: carryForward, debit: 0, currency: 'PKR', amount_orig: carryForward,
    isOpeningBalance: true, carried: true, manual: false,
  }] : [];

  // Any other overrides that fall inside the displayed range (e.g. viewing "All
  // Time" or a quarter spanning multiple override months) show up inline as
  // additional reset points, in chronological order alongside the transactions.
  const inlineOverrides = overrides
    .filter(o => o.date !== openingEntry[0]?.date && (!from || o.date >= from) && (!to || o.date <= to))
    .map(o => ({ date: o.date, __reset: o.amount }));

  let balance = openingEntry[0]?.credit || 0;
  const merged = [...filtered.map(e => ({ ...e, __sort: 0 })), ...inlineOverrides.map(o => ({ ...o, __sort: -1 }))]
    .sort((a, b) => {
      const d = normDay(a).localeCompare(normDay(b));
      return d !== 0 ? d : a.__sort - b.__sort; // resets before same-day transactions
    });

  const ledgerBody = merged.map(e => {
    if (e.__reset !== undefined) {
      const delta = e.__reset - balance;
      balance = e.__reset;
      return {
        date: e.date, section: 'Opening Balance', category: 'Opening Balance',
        description: 'Opening Balance', party: '',
        credit: delta >= 0 ? delta : 0, debit: delta < 0 ? -delta : 0,
        currency: 'PKR', isOpeningBalance: true, manual: true, balance,
      };
    }
    balance += (e.credit - e.debit);
    const { __sort, ...row } = e;
    return { ...row, balance };
  });

  const ledger = [...openingEntry, ...ledgerBody];

  // Summary — sum straight from what's actually displayed, so it always matches
  // the table (reset rows contribute their delta, not their raw override amount).
  const openingForSummary = openingEntry[0]?.credit || 0;
  const totalCredit = ledgerBody.reduce((s, e) => s + (e.credit || 0), 0) + openingForSummary;
  const totalDebit  = ledgerBody.reduce((s, e) => s + (e.debit  || 0), 0);
  const summary = {
    totalCredit, totalDebit, netBalance: ledger.length ? ledger[ledger.length - 1].balance : 0,
    openingBalance: openingForSummary, openingDate: openingEntry[0]?.date || null,
    openingCarried: !!openingEntry[0]?.carried,
    openingManual: !!rawOverride,
    bySection: {},
  };
  for (const e of filtered) {
    if (!summary.bySection[e.section]) summary.bySection[e.section] = { credit: 0, debit: 0 };
    summary.bySection[e.section].credit += e.credit;
    summary.bySection[e.section].debit  += e.debit;
  }

  res.json({ ledger, summary });
});

// ── Monthly opening-balance overrides ───────────────────────────────────────
// One manual override per calendar month ('YYYY-MM'). A month with no override
// simply carries its balance forward from the month before it (see /ledger).
router.get('/monthly-opening-balances', (req, res) => {
  res.json(db.prepare('SELECT month, amount, updated_at FROM monthly_opening_balances ORDER BY month ASC').all());
});

router.put('/monthly-opening-balances/:month', (req, res) => {
  const { month } = req.params;
  const { amount } = req.body;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (amount === '' || amount === null || amount === undefined || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'amount is required' });
  }
  db.prepare(`
    INSERT INTO monthly_opening_balances (month, amount, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
  `).run(month, parseFloat(amount));
  res.json(db.prepare('SELECT month, amount, updated_at FROM monthly_opening_balances WHERE month = ?').get(month));
});

router.delete('/monthly-opening-balances/:month', (req, res) => {
  db.prepare('DELETE FROM monthly_opening_balances WHERE month = ?').run(req.params.month);
  res.json({ ok: true });
});

// ── Capital: Investments ───────────────────────────────────────────────────
router.get('/investments', (req, res) => {
  const rows = db.prepare('SELECT * FROM capital_investments ORDER BY date DESC').all();
  res.json(rows);
});

router.post('/investments', (req, res) => {
  const { investor_name, amount, date, equity_pct = 0, notes = '', status = 'active' } = req.body;
  if (!investor_name || !amount || !date) return res.status(400).json({ error: 'investor_name, amount, date required' });
  const r = db.prepare(
    'INSERT INTO capital_investments (investor_name, amount, date, equity_pct, notes, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(investor_name, amount, date, equity_pct, notes, status);
  res.json(db.prepare('SELECT * FROM capital_investments WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/investments/:id', (req, res) => {
  const { investor_name, amount, date, equity_pct, notes, status } = req.body;
  db.prepare(
    'UPDATE capital_investments SET investor_name=?, amount=?, date=?, equity_pct=?, notes=?, status=?, updated_at=datetime("now") WHERE id=?'
  ).run(investor_name, amount, date, equity_pct ?? 0, notes ?? '', status ?? 'active', req.params.id);
  res.json(db.prepare('SELECT * FROM capital_investments WHERE id = ?').get(req.params.id));
});

router.delete('/investments/:id', (req, res) => {
  db.prepare('DELETE FROM capital_investments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
