import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Convert any currency amount → PKR using rate_to_pkr map
// ratesToPkr = { USD: 280, AED: 76, PKR: 1, … }
function toPKR(amount, fromCurrency, ratesToPkr) {
  const amt  = parseFloat(amount) || 0;
  if (!amt) return 0;
  const rate = ratesToPkr[fromCurrency] ?? ratesToPkr['USD'] ?? 280;
  return amt * rate;
}

router.get('/', (req, res) => {
  try {
    const { from, to } = req.query;
    const hasRange = from && to;

    // ── Rates (PKR-based) ──────────────────────────────────────────────────
    const currencyRows = db.prepare('SELECT code, name, symbol, rate_to_pkr, rate_to_usd, is_default FROM currencies').all();

    // Build rate_to_pkr map; fallback sensible defaults
    const ratesToPkr = {};
    for (const c of currencyRows) {
      ratesToPkr[c.code] = parseFloat(c.rate_to_pkr) || 1;
    }
    if (!ratesToPkr.PKR) ratesToPkr.PKR = 1;
    if (!ratesToPkr.USD) ratesToPkr.USD = 280;

    // Legacy pkr_rate (1 PKR in USD) — derived from USD rate
    const usdPkr  = ratesToPkr.USD || 280;
    const pkrRate = 1 / usdPkr;   // e.g. 1/280 = 0.00357

    // ── Clients ────────────────────────────────────────────────────────────
    const activeClients = db.prepare(`SELECT COUNT(*) as n FROM clients WHERE status='active'`).get().n;
    const totalClients  = db.prepare(`SELECT COUNT(*) as n FROM clients`).get().n;

    // ── Quotations ─────────────────────────────────────────────────────────
    // Counts are always real-time (status-based); pipeline/accepted use range when set
    const allQuotations = db.prepare(`SELECT status, total, currency, created_at FROM quotations`).all();
    const openQ     = allQuotations.filter(q => ['draft', 'sent'].includes(q.status));
    const acceptedQ = allQuotations.filter(q => q.status === 'accepted');
    const pipelinePKR = openQ.reduce((s, q) =>
      s + toPKR(q.total, q.currency || 'USD', ratesToPkr), 0);
    const acceptedPKR = acceptedQ.reduce((s, q) =>
      s + toPKR(q.total, q.currency || 'USD', ratesToPkr), 0);

    // ── Invoices ───────────────────────────────────────────────────────────
    const allInvoices = db.prepare(`SELECT status, total, amount_paid, currency, due_date FROM invoices`).all();
    const unpaidInv   = allInvoices.filter(i => i.status !== 'paid');
    const unpaidPKR   = unpaidInv.reduce((s, i) =>
      s + toPKR((parseFloat(i.total) - parseFloat(i.amount_paid || 0)), i.currency || 'USD', ratesToPkr), 0);

    const today = new Date().toISOString().split('T')[0];
    const overdueInvoices = allInvoices.filter(i =>
      i.due_date && i.due_date < today && i.status !== 'paid'
    ).length;

    // ── Revenue from payments — filtered by date range when provided ───────
    const allPayments = hasRange
      ? db.prepare(`
          SELECT p.amount, COALESCE(p.currency, i.currency, 'USD') as currency
          FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id
          WHERE date(p.paid_at) >= ? AND date(p.paid_at) <= ?
        `).all(from, to)
      : db.prepare(`
          SELECT p.amount, COALESCE(p.currency, i.currency, 'USD') as currency
          FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id
        `).all();
    const revenuePKR = allPayments.reduce((s, p) =>
      s + toPKR(p.amount, p.currency, ratesToPkr), 0);

    // ── This month / period revenue ────────────────────────────────────────
    const now   = new Date();
    const msISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // When a range is selected, period revenue = same as filtered revenue above
    // When no range, fetch this-month separately
    const monthRevPKR = hasRange ? revenuePKR : db.prepare(`
      SELECT p.amount, COALESCE(p.currency, i.currency, 'USD') as currency
      FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id
      WHERE p.paid_at >= ?
    `).all(msISO).reduce((s, p) => s + toPKR(p.amount, p.currency, ratesToPkr), 0);

    const monthQuotations = hasRange
      ? allQuotations.filter(q => q.created_at >= from && q.created_at.slice(0,10) <= to).length
      : db.prepare(`SELECT COUNT(*) as n FROM quotations WHERE created_at >= ?`).get(msISO).n;

    // ── Revenue trend — monthly breakdown within range, or default 6 months ─
    const trend = [];
    if (hasRange) {
      let d = new Date(from + 'T00:00:00');
      const endD = new Date(to + 'T00:00:00');
      while (d <= endD) {
        const start = d.toISOString();
        const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const end   = nextD.toISOString();
        const label = d.toLocaleString('en-US', { month: 'short' });
        const pkrTotal = db.prepare(`
          SELECT p.amount, COALESCE(p.currency, i.currency, 'USD') as currency
          FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id
          WHERE p.paid_at >= ? AND p.paid_at < ?
        `).all(start, end).reduce((s, p) => s + toPKR(p.amount, p.currency, ratesToPkr), 0);
        trend.push({ month: label, pkr: Math.round(pkrTotal) });
        d = nextD;
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = d.toISOString();
        const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
        const label = d.toLocaleString('en-US', { month: 'short' });
        const pkrTotal = db.prepare(`
          SELECT p.amount, COALESCE(p.currency, i.currency, 'USD') as currency
          FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id
          WHERE p.paid_at >= ? AND p.paid_at < ?
        `).all(start, end).reduce((s, p) => s + toPKR(p.amount, p.currency, ratesToPkr), 0);
        trend.push({ month: label, pkr: Math.round(pkrTotal) });
      }
    }

    // ── Recent invoices ────────────────────────────────────────────────────
    const recentInvoices = db.prepare(`
      SELECT i.id, i.number, i.status, i.total, i.amount_paid, i.currency, i.due_date, i.created_at,
        COALESCE(c.display_name, c.company, c.name) as client_name
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC LIMIT 6
    `).all();

    // ── Recent clients ─────────────────────────────────────────────────────
    const recentClients = db.prepare(`
      SELECT id, name, company, display_name, email, status, currency, created_at
      FROM clients ORDER BY created_at DESC LIMIT 6
    `).all();

    // Build legacy `rates` map (rate_to_usd) for frontend backward compat
    const rates = Object.fromEntries(currencyRows.map(c => [c.code, parseFloat(c.rate_to_usd) || 1]));
    if (!rates.USD) rates.USD = 1;
    if (!rates.PKR) rates.PKR = pkrRate;

    res.json({
      pkr_rate:            pkrRate,
      rates,                            // backward compat
      rates_to_pkr:        ratesToPkr, // new: { USD:280, AED:76, PKR:1, … }
      currencies:          currencyRows,
      revenue_pkr:         Math.round(revenuePKR),
      month_revenue_pkr:   Math.round(monthRevPKR),
      active_clients:      activeClients,
      total_clients:       totalClients,
      total_quotations:    allQuotations.length,
      open_quotations:     openQ.length,
      accepted_quotations: acceptedQ.length,
      month_quotations:    monthQuotations,
      pipeline_pkr:        Math.round(pipelinePKR),
      accepted_pkr:        Math.round(acceptedPKR),
      unpaid_invoices:     unpaidInv.length,
      unpaid_pkr:          Math.round(unpaidPKR),
      overdue_invoices:    overdueInvoices,
      trend,
      recent_invoices:     recentInvoices,
      recent_clients:      recentClients,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
