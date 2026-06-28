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

  // ── Total Projects Paid ────────────────────────────────────────────────────
  // Matches the "Paid" shown on each project card:
  //   product fabrics paid + process costs paid + external costs paid
  //   + vendor payments + worker payments + shipping paid + extra costs
  const allProducts = db.prepare(`SELECT fabrics, costs, external_costs FROM project_products`).all();
  const productsPaid = allProducts.reduce((sum, pp) => {
    try {
      const fabs = JSON.parse(pp.fabrics         || '[]').reduce((s, f) => s + (parseFloat(f.amount_paid) || 0), 0);
      const prcs = JSON.parse(pp.costs           || '[]').reduce((s, c) => s + (parseFloat(c.amount_paid) || 0), 0);
      const exts = JSON.parse(pp.external_costs  || '[]').reduce((s, e) => s + (parseFloat(e.amount_paid) || 0), 0);
      return sum + fabs + prcs + exts;
    } catch { return sum; }
  }, 0);

  const vendorPayments = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM project_vendor_payments`).get().total;
  const workerPayments = db.prepare(`SELECT COALESCE(SUM(paid_amount),0) as total FROM project_workers WHERE paid_amount > 0`).get().total;
  const shippingPaid   = db.prepare(`SELECT COALESCE(SUM(paid_amount),0) as total FROM project_shipping WHERE paid_amount > 0`).get().total;

  const allProjectsExtra = db.prepare(`SELECT extra_costs FROM projects WHERE extra_costs IS NOT NULL`).all();
  const extraCosts = allProjectsExtra.reduce((sum, p) => {
    try { return sum + JSON.parse(p.extra_costs || '[]').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0); }
    catch { return sum; }
  }, 0);

  const totalProjectsPaid = productsPaid + vendorPayments + workerPayments + shippingPaid + extraCosts;

  // ── Total Projects Expense (Billed/Projected — mirrors fin_total_expense in projects route) ──
  // productCost: fabric rate×qty + process cost_per_piece×qty + external_costs total
  const allProductsFull = db.prepare(`SELECT fabrics, costs, external_costs, total_quantity, fabric_per_piece, fabric_price_per_unit FROM project_products`).all();
  const totalProductCost = allProductsFull.reduce((sum, pp) => {
    try {
      const fabrics  = JSON.parse(pp.fabrics        || '[]');
      const costs    = JSON.parse(pp.costs          || '[]');
      const extCosts = JSON.parse(pp.external_costs || '[]');
      const qty      = parseFloat(pp.total_quantity) || 0;
      const fabricCost = fabrics.length > 0
        ? fabrics.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0)
        : (parseFloat(pp.fabric_per_piece)||0) * (parseFloat(pp.fabric_price_per_unit)||0) * qty;
      const procCost = costs.reduce((s, c) => s + (parseFloat(c.cost_per_piece)||0), 0) * qty;
      const extCost  = extCosts.reduce((s, c) => s + (parseFloat(c.total)||0), 0);
      return sum + fabricCost + procCost + extCost;
    } catch { return sum; }
  }, 0);

  // vendorBilled: tasks total or invoice_amount fallback
  const allVendorRows = db.prepare(`SELECT tasks, invoice_amount FROM project_vendors`).all();
  const totalVendorBilled = allVendorRows.reduce((sum, pv) => {
    try {
      const tasks = JSON.parse(pv.tasks || '[]');
      const tasksTotal = tasks.reduce((s, t) =>
        s + (t.type === 'per_piece' ? (parseFloat(t.agreed)||0)*(parseFloat(t.qty)||0) : (parseFloat(t.agreed)||0)), 0);
      return sum + (tasksTotal > 0 ? tasksTotal : Number(pv.invoice_amount || 0));
    } catch { return sum; }
  }, 0);

  const totalWorkerAgreed  = db.prepare(`SELECT COALESCE(SUM(agreed_amount),0) as total FROM project_workers`).get().total;
  const totalShippingBilled = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM project_shipping`).get().total;

  // totalProjectsExpense = full projected cost (what projects are expected to cost when all paid)
  const totalProjectsExpense = totalProductCost + totalVendorBilled + totalWorkerAgreed + totalShippingBilled + extraCosts;

  const totalExpenses = totalProjectsPaid + businessExpenses + salariesPaid;

  // Out of Pocket = cash already paid out minus cash received (positive = money from your pocket)
  const outOfPocket = totalExpenses - invoiceRevenue;

  // Projected P&L = (received + outstanding) minus full projected costs
  const projectedPL = (invoiceRevenue + outstanding) - (totalProjectsExpense + businessExpenses + salariesPaid);

  // Legacy netProfit kept for compatibility (same as projectedPL)
  const netProfit = projectedPL;

  // Per-currency revenue breakdown for display
  const revenueByCC = {};
  for (const p of rawPayments) {
    const cc = p.currency || 'PKR';
    revenueByCC[cc] = (revenueByCC[cc] || 0) + (parseFloat(p.amount) || 0);
  }

  res.json({ invoiceRevenue, outstanding, businessExpenses, salariesPaid, totalProjectsPaid, totalProjectsExpense, totalExpenses, outOfPocket, projectedPL, netProfit, revenueByCC });
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

    const workerPay = db.prepare(
      `SELECT COALESCE(SUM(paid_amount), 0) as total FROM project_workers WHERE paid_amount > 0 AND strftime('%Y-%m', created_at) = ?`
    ).get(month).total;

    const shippingPay = db.prepare(
      `SELECT COALESCE(SUM(paid_amount), 0) as total FROM project_shipping WHERE paid_amount > 0 AND strftime('%Y-%m', shipping_date) = ?`
    ).get(month).total;

    // Fabric costs by month — only amount_paid (cash actually paid for fabric)
    const fabricRows = db.prepare(
      `SELECT pp.fabrics FROM project_products pp JOIN projects p ON p.id=pp.project_id WHERE strftime('%Y-%m', p.updated_at) = ?`
    ).all(month);
    const fabricPay = fabricRows.reduce((sum, pp) => {
      try { return sum + JSON.parse(pp.fabrics||'[]').reduce((s,f) => s + (parseFloat(f.amount_paid)||0), 0); }
      catch { return sum; }
    }, 0);

    const extraRows = db.prepare(
      `SELECT extra_costs FROM projects WHERE strftime('%Y-%m', updated_at) = ? AND extra_costs IS NOT NULL`
    ).all(month);
    const extraPay = extraRows.reduce((sum, p) => {
      try { return sum + (JSON.parse(p.extra_costs||'[]')).reduce((s,c)=>s+(parseFloat(c.amount)||0),0); }
      catch { return sum; }
    }, 0);

    const totalOut = expenses + salaries + vendorPay + workerPay + shippingPay + fabricPay + extraPay;
    return { month, revenue, expenses, salaries, vendorPay, workerPay, shippingPay, fabricPay, extraPay, totalOut, net: revenue - totalOut };
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
           COALESCE(v.name, vs.name, 'Vendor') as reference,
           COALESCE(v.name, vs.name, 'Vendor') as party,
           pvp.amount, 'PKR' as currency,
           pvp.paid_at as date,
           COALESCE(pvp.reference,'') as tx_ref,
           COALESCE(pvp.method,'') as method
    FROM project_vendor_payments pvp
    LEFT JOIN project_vendors pv ON pv.id = pvp.project_vendor_id
    LEFT JOIN vendors v ON v.id = pv.vendor_id
    LEFT JOIN project_shipping ps ON ps.id = pvp.shipping_id
    LEFT JOIN vendors vs ON vs.id = ps.vendor_id
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

  const workerWhere = hasRange ? `AND date(pw.created_at) >= ? AND date(pw.created_at) <= ?` : '';
  const workerArgs  = hasRange ? [from, to, limit] : [limit];
  const workerPay = db.prepare(`
    SELECT pw.id, 'vendor' as type, 'Worker Payment' as category,
           pw.worker_name as reference, pw.worker_name as party,
           pw.paid_amount as amount, 'PKR' as currency,
           pw.created_at as date
    FROM project_workers pw
    WHERE pw.paid_amount > 0 ${workerWhere}
    ORDER BY pw.created_at DESC LIMIT ?
  `).all(...workerArgs).map(p => ({ ...p, amount_pkr: p.amount, amount_orig: p.amount }));

  const shippingWhere = hasRange ? `AND date(ps.shipping_date) >= ? AND date(ps.shipping_date) <= ?` : '';
  const shippingArgs  = hasRange ? [from, to, limit] : [limit];
  const shippingTx = db.prepare(`
    SELECT ps.id, 'shipping' as type, 'Shipping' as category,
           COALESCE(v.name, ps.carrier, 'Shipping') as reference,
           COALESCE(v.name, ps.carrier, 'Shipping') as party,
           ps.paid_amount as amount, 'PKR' as currency,
           ps.shipping_date as date,
           ps.carrier, ps.tracking_number,
           p.title as project_title
    FROM project_shipping ps
    LEFT JOIN projects p ON p.id = ps.project_id
    LEFT JOIN vendors v ON v.id = ps.vendor_id
    WHERE ps.paid_amount > 0 ${shippingWhere}
    ORDER BY ps.shipping_date DESC LIMIT ?
  `).all(...shippingArgs).map(s => ({ ...s, amount_pkr: s.amount, amount_orig: s.amount }));

  const all = [...payments, ...expenses, ...vendorPay, ...salaries, ...workerPay, ...shippingTx]
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

  // Opening balance setting — acts as the ledger floor date
  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('opening_balance','opening_balance_date')").all();
  const settingsMap  = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const openingAmt   = parseFloat(settingsMap.opening_balance) || 0;
  const openingDate  = settingsMap.opening_balance_date || null; // 'YYYY-MM-DD' or null

  // Only apply the opening cutoff when the viewed period is on/after the opening date.
  // If the user selects a period entirely before the opening date (e.g. June when
  // opening is July 1), show normal historical data for that period.
  const periodIsBeforeOpening = openingDate && to && to < openingDate;
  const applyOpening = openingDate && !periodIsBeforeOpening;
  const effectiveFrom = applyOpening ? ([from, openingDate].filter(Boolean).sort().pop() || from) : from;

  const dateFilter = (col) => {
    const parts = [];
    if (effectiveFrom) parts.push(`date(${col}) >= '${effectiveFrom}'`);
    if (to)            parts.push(`date(${col}) <= '${to}'`);
    return parts.length ? 'AND ' + parts.join(' AND ') : '';
  };

  const entries = [];

  // ── CREDITS (Income) ───────────────────────────────────────────────────────
  const payments = db.prepare(`
    SELECT p.id, p.paid_at as date, p.amount, COALESCE(p.currency,'PKR') as currency,
           'Income' as section, 'Invoice Payment' as category,
           i.number as reference, COALESCE(c.display_name, c.company, c.name,'') as party
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN clients  c ON c.id = p.client_id
    WHERE 1=1 ${dateFilter('p.paid_at')}
    ORDER BY p.paid_at ASC
  `).all();
  for (const p of payments) {
    entries.push({ date: p.date, section: 'Income', category: p.category,
      description: `Invoice ${p.reference || ''}`, party: p.party || '',
      credit: toPKR(p.amount, p.currency, rates), debit: 0,
      currency: p.currency, amount_orig: parseFloat(p.amount) });
  }

  // ── DEBITS (Expenses) ──────────────────────────────────────────────────────
  // Vendor payments
  const vendorPay = db.prepare(`
    SELECT pvp.id, pvp.paid_at as date, pvp.amount,
           COALESCE(v.name, vs.name, 'Vendor') as party,
           COALESCE(pvp.reference,'') as ref,
           proj.title as project_title
    FROM project_vendor_payments pvp
    LEFT JOIN project_vendors pv ON pv.id = pvp.project_vendor_id
    LEFT JOIN vendors v  ON v.id  = pv.vendor_id
    LEFT JOIN project_shipping ps ON ps.id = pvp.shipping_id
    LEFT JOIN vendors vs ON vs.id = ps.vendor_id
    LEFT JOIN projects proj ON proj.id = pvp.project_id
    WHERE 1=1 ${dateFilter('pvp.paid_at')}
    ORDER BY pvp.paid_at ASC
  `).all();
  for (const p of vendorPay) {
    entries.push({ date: p.date, section: 'Project Costs', category: 'Vendor Payment',
      description: p.project_title ? `Vendor – ${p.project_title}` : 'Vendor Payment',
      party: p.party, credit: 0, debit: parseFloat(p.amount) || 0,
      currency: 'PKR', amount_orig: parseFloat(p.amount) || 0, reference: p.ref });
  }

  // Worker payments
  const workerPay = db.prepare(`
    SELECT pw.id, pw.created_at as date, pw.paid_amount as amount,
           pw.worker_name as party, proj.title as project_title
    FROM project_workers pw
    LEFT JOIN projects proj ON proj.id = pw.project_id
    WHERE pw.paid_amount > 0 ${dateFilter('pw.created_at')}
    ORDER BY pw.created_at ASC
  `).all();
  for (const p of workerPay) {
    entries.push({ date: p.date, section: 'Project Costs', category: 'Worker Payment',
      description: p.project_title ? `Worker – ${p.project_title}` : 'Worker Payment',
      party: p.party || '', credit: 0, debit: parseFloat(p.amount) || 0,
      currency: 'PKR', amount_orig: parseFloat(p.amount) || 0 });
  }

  // Shipping paid
  const shippingPay = db.prepare(`
    SELECT ps.id, ps.shipping_date as date, ps.paid_amount as amount,
           COALESCE(v.name, ps.carrier,'Shipping') as party,
           proj.title as project_title, ps.tracking_number
    FROM project_shipping ps
    LEFT JOIN vendors v ON v.id = ps.vendor_id
    LEFT JOIN projects proj ON proj.id = ps.project_id
    WHERE ps.paid_amount > 0 ${dateFilter('ps.shipping_date')}
    ORDER BY ps.shipping_date ASC
  `).all();
  for (const p of shippingPay) {
    entries.push({ date: p.date, section: 'Project Costs', category: 'Shipping',
      description: p.project_title ? `Shipping – ${p.project_title}` : 'Shipping',
      party: p.party, credit: 0, debit: parseFloat(p.amount) || 0,
      currency: 'PKR', amount_orig: parseFloat(p.amount) || 0,
      reference: p.tracking_number || '' });
  }

  // Fabric/process/external costs — emit one row per item using item.date if set
  const allPP = db.prepare(`
    SELECT pp.fabrics, pp.costs, pp.external_costs, proj.title as project_title,
           proj.created_at
    FROM project_products pp
    LEFT JOIN projects proj ON proj.id = pp.project_id
  `).all();

  const normDate = d => {
    if (!d) return null;
    // Convert SQLite "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DD"
    return d.replace(' ', 'T').split('T')[0];
  };

  for (const pp of allPP) {
    try {
      const fallbackDate = normDate(pp.created_at);
      const fabs = JSON.parse(pp.fabrics || '[]');
      const cs   = JSON.parse(pp.costs   || '[]');
      const exts = JSON.parse(pp.external_costs || '[]');

      // One ledger row per fabric item
      for (const f of fabs) {
        const amt = parseFloat(f.amount_paid) || 0;
        if (amt <= 0) continue;
        entries.push({ date: f.date || fallbackDate, section: 'Project Costs', category: 'Materials & Process',
          description: `Fabric${f.name ? ` – ${f.name}` : ''}${pp.project_title ? ` (${pp.project_title})` : ''}`,
          party: '', credit: 0, debit: amt, currency: 'PKR', amount_orig: amt });
      }
      // One ledger row per process/cost item
      for (const c of cs) {
        const amt = parseFloat(c.amount_paid) || 0;
        if (amt <= 0) continue;
        entries.push({ date: c.date || fallbackDate, section: 'Project Costs', category: 'Materials & Process',
          description: `Process${c.label ? ` – ${c.label}` : ''}${pp.project_title ? ` (${pp.project_title})` : ''}`,
          party: '', credit: 0, debit: amt, currency: 'PKR', amount_orig: amt });
      }
      // One ledger row per external cost item
      for (const e of exts) {
        const amt = parseFloat(e.amount_paid) || 0;
        if (amt <= 0) continue;
        entries.push({ date: e.date || fallbackDate, section: 'Project Costs', category: 'Materials & Process',
          description: `External${e.label ? ` – ${e.label}` : ''}${pp.project_title ? ` (${pp.project_title})` : ''}`,
          party: '', credit: 0, debit: amt, currency: 'PKR', amount_orig: amt });
      }
    } catch {}
  }

  // Extra costs — one row per cost item using item.date
  const extraRows = db.prepare(`
    SELECT extra_costs, title, updated_at, created_at FROM projects WHERE extra_costs IS NOT NULL
  `).all();
  for (const p of extraRows) {
    try {
      const fallbackDate = normDate(p.updated_at) || normDate(p.created_at);
      const costs = JSON.parse(p.extra_costs || '[]');
      for (const c of costs) {
        const amt = parseFloat(c.amount) || 0;
        if (amt <= 0) continue;
        entries.push({ date: c.date || fallbackDate, section: 'Project Costs', category: 'Extra Costs',
          description: `${c.label || 'Extra Cost'} – ${p.title}`,
          party: '', credit: 0, debit: amt, currency: 'PKR', amount_orig: amt });
      }
    } catch {}
  }

  // Business expenses
  const bizExp = db.prepare(`
    SELECT e.id, e.expense_date as date, e.amount, e.title as description,
           COALESCE(ec.name,'Expense') as category, e.paid_by as party
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE 1=1 ${dateFilter('e.expense_date')}
    ORDER BY e.expense_date ASC
  `).all();
  for (const e of bizExp) {
    entries.push({ date: e.date, section: 'Business Expenses', category: e.category,
      description: e.description || e.category, party: e.party || '',
      credit: 0, debit: parseFloat(e.amount) || 0, currency: 'PKR', amount_orig: parseFloat(e.amount) || 0 });
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

  // Loans — borrowed (credit) and repayments of borrowed (debit)
  const borrowedLoans = db.prepare(`
    SELECT cl.id, cl.date, cl.amount, cl.lender_name as party, cl.notes
    FROM capital_loans cl WHERE cl.direction = 'borrowed' ${dateFilter('cl.date')}
  `).all();
  for (const l of borrowedLoans) {
    entries.push({ date: l.date, section: 'Loans', category: 'Borrowed',
      description: `Borrowed from ${l.party}${l.notes ? ` – ${l.notes}` : ''}`, party: l.party || '',
      credit: parseFloat(l.amount) || 0, debit: 0, currency: 'PKR', amount_orig: parseFloat(l.amount) || 0 });
  }

  const lentLoans = db.prepare(`
    SELECT cl.id, cl.date, cl.amount, cl.lender_name as party, cl.notes
    FROM capital_loans cl WHERE cl.direction = 'lent' ${dateFilter('cl.date')}
  `).all();
  for (const l of lentLoans) {
    entries.push({ date: l.date, section: 'Loans', category: 'Lent',
      description: `Lent to ${l.party}${l.notes ? ` – ${l.notes}` : ''}`, party: l.party || '',
      credit: 0, debit: parseFloat(l.amount) || 0, currency: 'PKR', amount_orig: parseFloat(l.amount) || 0 });
  }

  const loanRepayments = db.prepare(`
    SELECT lr.id, lr.date, lr.amount, lr.notes,
           cl.lender_name as party, cl.direction
    FROM loan_repayments lr
    JOIN capital_loans cl ON cl.id = lr.loan_id
    WHERE 1=1 ${dateFilter('lr.date')}
    ORDER BY lr.date ASC
  `).all();
  for (const r of loanRepayments) {
    const isBorrowed = r.direction === 'borrowed';
    entries.push({ date: r.date, section: 'Loans',
      category: isBorrowed ? 'Repaid (Borrowed)' : 'Received Back (Lent)',
      description: isBorrowed ? `Repaid to ${r.party}` : `Received back from ${r.party}`,
      party: r.party || '',
      credit: isBorrowed ? 0 : parseFloat(r.amount) || 0,
      debit:  isBorrowed ? parseFloat(r.amount) || 0 : 0,
      currency: 'PKR', amount_orig: parseFloat(r.amount) || 0 });
  }

  // Final date filter — some sources (fabric/process/extra costs) build entries
  // in JS from JSON fields and cannot be filtered in SQL, so we filter here to
  // guarantee nothing outside the requested range leaks through.
  const filtered = (from && to)
    ? entries.filter(e => {
        const d = (e.date || '').replace(' ', 'T').split('T')[0];
        return d >= from && d <= to;
      })
    : entries;

  // Sort all entries by date ASC, compute running balance
  filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Prepend opening balance entry only when the period is on/after the opening date
  const openingEntry = applyOpening && openingAmt > 0 && openingDate ? [{
    date: openingDate,
    section: 'Opening Balance',
    category: 'Opening Balance',
    description: 'Opening Balance',
    party: '',
    credit: openingAmt,
    debit: 0,
    currency: 'PKR',
    amount_orig: openingAmt,
    isOpeningBalance: true,
  }] : [];

  let balance = 0;
  const ledger = [...openingEntry, ...filtered].map(e => {
    balance += (e.credit - e.debit);
    return { ...e, balance };
  });

  // Summary
  const totalCredit = filtered.reduce((s, e) => s + e.credit, 0) + (applyOpening ? openingAmt : 0);
  const totalDebit  = filtered.reduce((s, e) => s + e.debit,  0);
  const summary = {
    totalCredit, totalDebit, netBalance: totalCredit - totalDebit,
    openingBalance: openingAmt, openingDate,
    bySection: {},
  };
  for (const e of filtered) {
    if (!summary.bySection[e.section]) summary.bySection[e.section] = { credit: 0, debit: 0 };
    summary.bySection[e.section].credit += e.credit;
    summary.bySection[e.section].debit  += e.debit;
  }

  res.json({ ledger, summary });
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

// ── Capital: Loans ─────────────────────────────────────────────────────────
router.get('/loans', (req, res) => {
  const rows = db.prepare('SELECT * FROM capital_loans ORDER BY date DESC').all();
  res.json(rows);
});

router.post('/loans', (req, res) => {
  const { lender_name, amount, date, interest_rate = 0, due_date = '', paid_amount = 0, notes = '', status = 'active' } = req.body;
  if (!lender_name || !amount || !date) return res.status(400).json({ error: 'lender_name, amount, date required' });
  const r = db.prepare(
    'INSERT INTO capital_loans (lender_name, amount, date, interest_rate, due_date, paid_amount, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(lender_name, amount, date, interest_rate, due_date, paid_amount, notes, status);
  res.json(db.prepare('SELECT * FROM capital_loans WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/loans/:id', (req, res) => {
  const { lender_name, amount, date, interest_rate, due_date, paid_amount, notes, status } = req.body;
  db.prepare(
    'UPDATE capital_loans SET lender_name=?, amount=?, date=?, interest_rate=?, due_date=?, paid_amount=?, notes=?, status=?, updated_at=datetime("now") WHERE id=?'
  ).run(lender_name, amount, date, interest_rate ?? 0, due_date ?? '', paid_amount ?? 0, notes ?? '', status ?? 'active', req.params.id);
  res.json(db.prepare('SELECT * FROM capital_loans WHERE id = ?').get(req.params.id));
});

router.delete('/loans/:id', (req, res) => {
  db.prepare('DELETE FROM capital_loans WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
