import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function genNumber() {
  const year = new Date().getFullYear();
  const row  = db.prepare(`SELECT MAX(CAST(SUBSTR(number, -4) AS INTEGER)) as n FROM quotations WHERE number LIKE 'QT-${year}-%'`).get();
  const seq  = ((row?.n) || 0) + 1;
  return `QT-${year}-${String(seq).padStart(4, '0')}`;
}

function calcTotals(items, taxRate, discount) {
  const subtotal    = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const discountAmt = parseFloat(discount) || 0;
  const taxable     = subtotal - discountAmt;
  const taxAmount   = taxable * ((parseFloat(taxRate) || 0) / 100);
  const total       = taxable + taxAmount;
  return { subtotal, tax_amount: taxAmount, total };
}

const EXTRA_FIELDS = [
  'currency','shipping_name','shipping_address','shipping_city','shipping_country',
  'shipping_phone','bank_details','customer_notes','terms_conditions',
];

const WITH_CLIENT = `
  SELECT q.*,
    COALESCE(c.display_name, c.company, c.name) as client_name,
    c.email as client_email, c.phone as client_phone,
    c.address as client_address, c.city as client_city, c.country as client_country,
    CASE WHEN EXISTS (SELECT 1 FROM invoices WHERE quotation_id = q.id) THEN 1 ELSE 0 END as has_invoice
  FROM quotations q
  LEFT JOIN clients c ON q.client_id = c.id
`;

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = WITH_CLIENT + ' WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND q.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (q.number LIKE ? OR client_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY q.created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(WITH_CLIENT + ' WHERE q.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const {
      client_id, company_id, status = 'draft', items = [], tax_rate = 0, discount = 0,
      notes, valid_until, is_sampling = 0,
      currency = 'USD', shipping_name, shipping_address, shipping_city, shipping_country,
      shipping_phone, bank_details, customer_notes, terms_conditions, subject,
    } = req.body;
    const number      = req.body.number?.trim() || genNumber();
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const { subtotal, tax_amount, total } = calcTotals(parsedItems, tax_rate, discount);

    const result = db.prepare(`
      INSERT INTO quotations (
        number, client_id, company_id, status, items, subtotal, tax_rate, tax_amount, discount, total,
        notes, valid_until, is_sampling,
        currency, shipping_name, shipping_address, shipping_city, shipping_country,
        shipping_phone, bank_details, customer_notes, terms_conditions, subject
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      number, client_id || null, company_id || null, status, JSON.stringify(parsedItems),
      subtotal, parseFloat(tax_rate) || 0, tax_amount, parseFloat(discount) || 0, total,
      notes || null, valid_until || null, is_sampling ? 1 : 0,
      currency, shipping_name || null, shipping_address || null,
      shipping_city || null, shipping_country || null,
      shipping_phone || null, bank_details || null, customer_notes || null,
      terms_conditions || null, subject || null,
    );
    res.status(201).json(db.prepare(WITH_CLIENT + ' WHERE q.id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Quotation number already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const {
      client_id, company_id, status, items = [], tax_rate = 0, discount = 0,
      notes, valid_until, number, is_sampling = 0,
      currency = 'USD', shipping_name, shipping_address, shipping_city, shipping_country,
      shipping_phone, bank_details, customer_notes, terms_conditions, subject,
    } = req.body;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const { subtotal, tax_amount, total } = calcTotals(parsedItems, tax_rate, discount);

    db.prepare(`
      UPDATE quotations SET
        number=?, client_id=?, company_id=?, status=?, items=?,
        subtotal=?, tax_rate=?, tax_amount=?, discount=?, total=?,
        notes=?, valid_until=?, is_sampling=?,
        currency=?, shipping_name=?, shipping_address=?, shipping_city=?, shipping_country=?,
        shipping_phone=?, bank_details=?, customer_notes=?, terms_conditions=?, subject=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      number, client_id || null, company_id || null, status, JSON.stringify(parsedItems),
      subtotal, parseFloat(tax_rate) || 0, tax_amount, parseFloat(discount) || 0, total,
      notes || null, valid_until || null, is_sampling ? 1 : 0,
      currency, shipping_name || null, shipping_address || null,
      shipping_city || null, shipping_country || null,
      shipping_phone || null, bank_details || null, customer_notes || null,
      terms_conditions || null, subject || null,
      req.params.id,
    );
    const row = db.prepare(WITH_CLIENT + ' WHERE q.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare(`UPDATE quotations SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, req.params.id);
    res.json(db.prepare(WITH_CLIENT + ' WHERE q.id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/duplicate', (req, res) => {
  try {
    const orig = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Not found' });
    const number = genNumber();
    const result = db.prepare(`
      INSERT INTO quotations (
        number, client_id, company_id, status, items, subtotal, tax_rate, tax_amount, discount, total,
        notes, valid_until, is_sampling,
        currency, shipping_name, shipping_address, shipping_city, shipping_country,
        shipping_phone, bank_details, customer_notes, terms_conditions, subject
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      number, orig.client_id, orig.company_id || null, 'draft', orig.items,
      orig.subtotal, orig.tax_rate, orig.tax_amount, orig.discount, orig.total,
      orig.notes, null, orig.is_sampling,
      orig.currency, orig.shipping_name, orig.shipping_address, orig.shipping_city,
      orig.shipping_country, orig.shipping_phone, orig.bank_details,
      orig.customer_notes, orig.terms_conditions, orig.subject,
    );
    res.status(201).json(db.prepare(WITH_CLIENT + ' WHERE q.id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const invCount = db.prepare('SELECT COUNT(*) as n FROM invoices WHERE quotation_id = ?').get(req.params.id).n;
    if (invCount > 0)
      return res.status(400).json({ error: 'This quotation has been converted to an invoice. Delete the invoice first.' });
    db.prepare('DELETE FROM quotations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
