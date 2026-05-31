import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function genNumber() {
  const year = new Date().getFullYear();
  const row  = db.prepare(`SELECT MAX(CAST(SUBSTR(number, -4) AS INTEGER)) as n FROM invoices WHERE number LIKE 'INV-${year}-%'`).get();
  const seq  = ((row?.n) || 0) + 1;
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

function calcTotals(items, taxRate, discount) {
  const subtotal    = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const discountAmt = parseFloat(discount) || 0;
  const taxable     = subtotal - discountAmt;
  const taxAmount   = taxable * ((parseFloat(taxRate) || 0) / 100);
  const total       = taxable + taxAmount;
  return { subtotal, tax_amount: taxAmount, total };
}

const WITH_CLIENT = `
  SELECT i.*,
    COALESCE(c.display_name, c.company, c.name) as client_name,
    c.email as client_email, c.phone as client_phone,
    c.address as client_address, c.city as client_city, c.country as client_country
  FROM invoices i
  LEFT JOIN clients c ON i.client_id = c.id
`;

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = WITH_CLIENT + ' WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND i.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (i.number LIKE ? OR client_name LIKE ? OR i.subject LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY i.created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(WITH_CLIENT + ' WHERE i.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC').all(req.params.id);
    res.json({ ...row, payments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const {
      client_id, company_id, quotation_id, status = 'unpaid', items = [], tax_rate = 0, discount = 0,
      notes, due_date, currency = 'USD', subject, is_sampling = 0,
      shipping_name, shipping_address, shipping_city, shipping_country, shipping_phone,
      bank_details, customer_notes, terms_conditions,
    } = req.body;
    const number      = req.body.number?.trim() || genNumber();
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const { subtotal, tax_amount, total } = calcTotals(parsedItems, tax_rate, discount);

    const result = db.prepare(`
      INSERT INTO invoices (
        number, client_id, company_id, quotation_id, status, items,
        subtotal, tax_rate, tax_amount, discount, total,
        notes, due_date, currency, subject, is_sampling,
        shipping_name, shipping_address, shipping_city, shipping_country, shipping_phone,
        bank_details, customer_notes, terms_conditions
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      number, client_id || null, company_id || null, quotation_id || null, status, JSON.stringify(parsedItems),
      subtotal, parseFloat(tax_rate) || 0, tax_amount, parseFloat(discount) || 0, total,
      notes || null, due_date || null, currency, subject || null, is_sampling ? 1 : 0,
      shipping_name || null, shipping_address || null, shipping_city || null,
      shipping_country || null, shipping_phone || null,
      bank_details || null, customer_notes || null, terms_conditions || null,
    );
    res.status(201).json(db.prepare(WITH_CLIENT + ' WHERE i.id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Invoice number already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const {
      client_id, company_id, status, items = [], tax_rate = 0, discount = 0,
      notes, due_date, number, currency = 'USD', subject, is_sampling = 0,
      shipping_name, shipping_address, shipping_city, shipping_country, shipping_phone,
      bank_details, customer_notes, terms_conditions,
    } = req.body;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const { subtotal, tax_amount, total } = calcTotals(parsedItems, tax_rate, discount);

    db.prepare(`
      UPDATE invoices SET
        number=?, client_id=?, company_id=?, status=?, items=?,
        subtotal=?, tax_rate=?, tax_amount=?, discount=?, total=?,
        notes=?, due_date=?, currency=?, subject=?, is_sampling=?,
        shipping_name=?, shipping_address=?, shipping_city=?, shipping_country=?, shipping_phone=?,
        bank_details=?, customer_notes=?, terms_conditions=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      number, client_id || null, company_id || null, status, JSON.stringify(parsedItems),
      subtotal, parseFloat(tax_rate) || 0, tax_amount, parseFloat(discount) || 0, total,
      notes || null, due_date || null, currency, subject || null, is_sampling ? 1 : 0,
      shipping_name || null, shipping_address || null, shipping_city || null,
      shipping_country || null, shipping_phone || null,
      bank_details || null, customer_notes || null, terms_conditions || null,
      req.params.id,
    );
    const row = db.prepare(WITH_CLIENT + ' WHERE i.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare(`UPDATE invoices SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, req.params.id);
    res.json(db.prepare(WITH_CLIENT + ' WHERE i.id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Payments ──────────────────────────────────────────────────────────────────

router.get('/:id/payments', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC').all(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/payments', (req, res) => {
  try {
    const { amount, method = 'cash', reference, notes, paid_at } = req.body;
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const payResult = db.prepare(`
      INSERT INTO payments (invoice_id, client_id, amount, method, reference, notes, paid_at, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, invoice.client_id,
      parseFloat(amount), method, reference || null, notes || null,
      paid_at || new Date().toISOString(),
      invoice.currency || 'USD',
    );

    const totalPaid = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE invoice_id = ?').get(req.params.id).t;
    const newStatus = totalPaid >= invoice.total ? 'paid'
                    : totalPaid > 0              ? 'partial'
                                                 : 'unpaid';
    db.prepare(`UPDATE invoices SET amount_paid=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(totalPaid, newStatus, req.params.id);

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payResult.lastInsertRowid);
    res.status(201).json({ payment, amount_paid: totalPaid, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:invoiceId/payments/:paymentId', (req, res) => {
  try {
    db.prepare('DELETE FROM payments WHERE id = ? AND invoice_id = ?').run(req.params.paymentId, req.params.invoiceId);
    const invoice  = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.invoiceId);
    const totalPaid = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE invoice_id = ?').get(req.params.invoiceId).t;
    const newStatus = totalPaid >= invoice.total ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';
    db.prepare(`UPDATE invoices SET amount_paid=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(totalPaid, newStatus, req.params.invoiceId);
    res.json({ success: true, amount_paid: totalPaid, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/duplicate', (req, res) => {
  try {
    const orig = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Not found' });
    const number = genNumber();
    const result = db.prepare(`
      INSERT INTO invoices (
        number, client_id, company_id, quotation_id, status, items,
        subtotal, tax_rate, tax_amount, discount, total,
        notes, due_date, currency, subject, is_sampling,
        shipping_name, shipping_address, shipping_city, shipping_country, shipping_phone,
        bank_details, customer_notes, terms_conditions
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      number, orig.client_id, orig.company_id || null, null, 'unpaid', orig.items,
      orig.subtotal, orig.tax_rate, orig.tax_amount, orig.discount, orig.total,
      orig.notes, null, orig.currency, orig.subject, orig.is_sampling,
      orig.shipping_name, orig.shipping_address, orig.shipping_city,
      orig.shipping_country, orig.shipping_phone,
      orig.bank_details, orig.customer_notes, orig.terms_conditions,
    );
    res.status(201).json(db.prepare(WITH_CLIENT + ' WHERE i.id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
