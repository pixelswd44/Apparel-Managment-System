import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

function genCustomerNumber() {
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(customer_number, 5) AS INTEGER)) as n FROM clients WHERE customer_number LIKE 'CUS-%'"
  ).get();
  const seq = ((row?.n) || 0) + 1;
  return `CUS-${String(seq).padStart(4, '0')}`;
}

const FIELDS = [
  'customer_type', 'name', 'company', 'display_name', 'name_primary',
  'customer_number', 'email', 'phone', 'customer_language', 'currency',
  'products_origin', 'payment_terms', 'customer_owner',
  'address', 'city', 'zip', 'country',
  'shipping_receiver_name', 'shipping_receiver_phone',
  'shipping_address', 'shipping_city', 'shipping_zip', 'shipping_country',
  'documents', 'notes', 'status',
];

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM clients ORDER BY updated_at DESC, created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Client not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const autoNumber = genCustomerNumber();
    const vals = FIELDS.map(f => {
      const v = req.body[f];
      if (f === 'customer_number') return v?.trim() || autoNumber;
      if (f === 'status' && !v) return 'active';
      if (f === 'documents') return typeof v === 'string' ? v : JSON.stringify(v ?? []);
      return v ?? null;
    });
    const placeholders = FIELDS.map(() => '?').join(', ');
    const cols = FIELDS.join(', ');
    const result = db.prepare(`INSERT INTO clients (${cols}) VALUES (${placeholders})`).run(...vals);
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const vals = FIELDS.map(f => {
      const v = req.body[f];
      if (f === 'documents') return typeof v === 'string' ? v : JSON.stringify(v ?? []);
      return v ?? null;
    });
    const sets = FIELDS.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE clients SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Client not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/stats', (req, res) => {
  try {
    const id = req.params.id;

    // Get client's preferred currency (used for converting sums)
    const client = db.prepare('SELECT currency FROM clients WHERE id = ?').get(id);
    const clientCur = (client?.currency || 'USD').toUpperCase();

    // Get all currencies' rate_to_pkr (base = default currency)
    // rate_to_pkr = how many units of the DEFAULT currency equal 1 unit of this currency
    const currencyRows = db.prepare('SELECT code, rate_to_pkr FROM currencies').all();
    const rates = {};
    for (const r of currencyRows) rates[r.code.toUpperCase()] = parseFloat(r.rate_to_pkr) || 1;
    // Fallback if a currency is missing
    const rateOf = code => rates[(code || clientCur).toUpperCase()] || 1;
    const clientRate = rateOf(clientCur);

    // Convert any amount in `fromCur` to the client's preferred currency
    // Math: A → base → B  ==>  amount * rateA / rateB
    const convertTo = (amount, fromCur) => {
      const amt = parseFloat(amount) || 0;
      const fr  = rateOf(fromCur);
      if (clientRate <= 0) return amt;
      return (amt * fr) / clientRate;
    };

    const quotations = db.prepare(`
      SELECT id, number, status, total, currency, created_at
      FROM quotations WHERE client_id = ? ORDER BY created_at DESC
    `).all(id);
    const invoices = db.prepare(`
      SELECT id, number, status, total, amount_paid, currency, due_date, created_at
      FROM invoices WHERE client_id = ? ORDER BY created_at DESC
    `).all(id);
    const payments = db.prepare(`
      SELECT p.id, p.amount, p.method, p.reference, p.notes, p.paid_at, p.currency,
             i.number as invoice_number
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      WHERE p.client_id = ? ORDER BY p.paid_at DESC
    `).all(id);

    // Sum everything in the client's preferred currency
    const totalRevenue  = payments.reduce(
      (s, p) => s + convertTo(p.amount, p.currency),
      0
    );

    const outstanding = invoices.reduce((s, i) => {
      const balOriginal = (parseFloat(i.total) || 0) - (parseFloat(i.amount_paid) || 0);
      if (balOriginal <= 0) return s;
      return s + convertTo(balOriginal, i.currency);
    }, 0);

    const pipelineValue = quotations
      .filter(q => ['draft', 'sent'].includes(q.status))
      .reduce((s, q) => s + convertTo(q.total, q.currency), 0);

    res.json({
      quotations,
      invoices,
      payments,
      stats: {
        quotations_count:  quotations.length,
        invoices_count:    invoices.length,
        payments_count:    payments.length,
        total_revenue:     totalRevenue,
        outstanding,
        pipeline_value:    pipelineValue,
        currency:          clientCur,    // tells frontend which currency these sums are in
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const qCount = db.prepare('SELECT COUNT(*) as n FROM quotations WHERE client_id = ?').get(req.params.id).n;
    if (qCount > 0)
      return res.status(400).json({ error: `Cannot delete — this client has ${qCount} quotation${qCount !== 1 ? 's' : ''} linked. Delete those first.` });

    const iCount = db.prepare('SELECT COUNT(*) as n FROM invoices WHERE client_id = ?').get(req.params.id).n;
    if (iCount > 0)
      return res.status(400).json({ error: `Cannot delete — this client has ${iCount} invoice${iCount !== 1 ? 's' : ''} linked. Delete those first.` });

    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
