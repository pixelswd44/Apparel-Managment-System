import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const FIELDS = [
  'name', 'article_number', 'sku', 'category_id', 'description', 'unit',
  'unit_cost', 'selling_price', 'stock_quantity', 'reorder_level',
  'status', 'images', 'notes', 'product_type',
];

const NUM_FIELDS = ['unit_cost', 'selling_price', 'stock_quantity', 'reorder_level'];

const withCategory = `
  SELECT p.*,
    c.name as category_name,
    c.color as category_color,
    COALESCE((SELECT SUM(quantity) FROM product_sales WHERE product_id = p.id), 0) as total_sold,
    COALESCE((SELECT SUM(quantity * unit_price) FROM product_sales WHERE product_id = p.id), 0) as total_revenue,
    COALESCE((SELECT json_group_array(json_object('id', pp.id, 'currency', pp.currency, 'unit_cost', pp.unit_cost, 'selling_price', pp.selling_price))
              FROM product_prices pp WHERE pp.product_id = p.id), '[]') as prices_json
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
`;

function coerce(f, v) {
  if (f === 'images') return typeof v === 'string' ? v : JSON.stringify(v ?? []);
  if (NUM_FIELDS.includes(f)) return parseFloat(v) || 0;
  if (f === 'category_id') return v ? parseInt(v) : null;
  return v ?? null;
}

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`${withCategory} ORDER BY p.created_at DESC`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`${withCategory} WHERE p.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const vals = FIELDS.map(f => {
      const v = req.body[f];
      if (f === 'status' && !v) return 'active';
      if (f === 'product_type' && !v) return 'physical';
      return coerce(f, v);
    });
    const result = db.prepare(
      `INSERT INTO products (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`
    ).run(...vals);
    const row = db.prepare(`${withCategory} WHERE p.id = ?`).get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const vals = FIELDS.map(f => coerce(f, req.body[f]));
    const sets = FIELDS.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE products SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, req.params.id);
    const row = db.prepare(`${withCategory} WHERE p.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/duplicate', (req, res) => {
  try {
    const orig = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Product not found' });
    const vals = FIELDS.map(f => {
      if (f === 'name')           return `${orig.name} (Copy)`;
      if (f === 'stock_quantity') return 0;
      if (f === 'status')         return 'active';
      return coerce(f, orig[f]);
    });
    const result = db.prepare(
      `INSERT INTO products (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`
    ).run(...vals);
    res.status(201).json(db.prepare(`${withCategory} WHERE p.id = ?`).get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check whether a product is referenced anywhere — used by the UI to decide
// whether to enable/disable the delete button before the user clicks.
router.get('/:id/usage', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const quotRefs = db.prepare(`
      SELECT DISTINCT q.id, q.number
      FROM quotations q, json_each(q.items) AS li
      WHERE CAST(json_extract(li.value, '$.product_id') AS INTEGER) = ?
    `).all(id);
    const invRefs = db.prepare(`
      SELECT DISTINCT i.id, i.number
      FROM invoices i, json_each(i.items) AS li
      WHERE CAST(json_extract(li.value, '$.product_id') AS INTEGER) = ?
    `).all(id);
    res.json({
      quotation_count: quotRefs.length,
      invoice_count:   invRefs.length,
      can_delete:      quotRefs.length === 0 && invRefs.length === 0,
      quotations:      quotRefs.slice(0, 10),
      invoices:        invRefs.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Check if product is referenced in any quotation line items (stored as JSON)
    const quotRefs = db.prepare(`
      SELECT q.number
      FROM quotations q, json_each(q.items) AS li
      WHERE CAST(json_extract(li.value, '$.product_id') AS INTEGER) = ?
      LIMIT 5
    `).all(id);

    // Check if product is referenced in any invoice line items
    const invRefs = db.prepare(`
      SELECT i.number
      FROM invoices i, json_each(i.items) AS li
      WHERE CAST(json_extract(li.value, '$.product_id') AS INTEGER) = ?
      LIMIT 5
    `).all(id);

    const quotCount = new Set(quotRefs.map(r => r.number)).size;
    const invCount  = new Set(invRefs.map(r => r.number)).size;

    if (quotCount > 0 || invCount > 0) {
      const parts = [];
      if (quotCount > 0) parts.push(`${quotCount} quotation${quotCount === 1 ? '' : 's'}`);
      if (invCount  > 0) parts.push(`${invCount} invoice${invCount === 1 ? '' : 's'}`);
      return res.status(409).json({
        error: `Cannot delete — this product is used in ${parts.join(' and ')}. Remove or replace it in those documents first, or set the product to Inactive instead.`,
        details: {
          quotation_count: quotCount,
          invoice_count:   invCount,
          example_quotations: [...new Set(quotRefs.map(r => r.number))].slice(0, 3),
          example_invoices:   [...new Set(invRefs.map(r => r.number))].slice(0, 3),
        },
      });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Product Prices (multi-currency) ──────────────────────────────────────────

router.get('/:id/prices', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM product_prices WHERE product_id = ? ORDER BY currency ASC').all(req.params.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upsert: creates or updates price for a currency
// If `auto_convert: true` is passed, also creates/updates prices for ALL other
// active currencies using their exchange rates (rate_to_pkr field).
router.post('/:id/prices', (req, res) => {
  try {
    const { currency, unit_cost, selling_price, auto_convert } = req.body;
    if (!currency) return res.status(400).json({ error: 'currency is required' });

    const code   = currency.toUpperCase();
    const cost   = parseFloat(unit_cost)     || 0;
    const sell   = parseFloat(selling_price) || 0;
    const productId = req.params.id;

    // Always upsert the entered currency
    db.prepare(`
      INSERT INTO product_prices (product_id, currency, unit_cost, selling_price)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(product_id, currency) DO UPDATE SET
        unit_cost     = excluded.unit_cost,
        selling_price = excluded.selling_price,
        updated_at    = datetime('now')
    `).run(productId, code, cost, sell);

    let createdCurrencies = [code];

    // If auto-convert requested, populate prices for other currencies
    if (auto_convert) {
      // Get rate of the entered currency (rate_to_pkr = how many units of default currency per 1 unit of this currency)
      const sourceRate = db.prepare('SELECT rate_to_pkr FROM currencies WHERE code = ?').get(code);
      const sourceR    = parseFloat(sourceRate?.rate_to_pkr) || 1;

      // Convert to "base default currency" units first
      const baseCost = cost * sourceR;
      const baseSell = sell * sourceR;

      // Fetch all OTHER active currencies
      const others = db.prepare("SELECT code, rate_to_pkr FROM currencies WHERE code != ?").all(code);

      const stmt = db.prepare(`
        INSERT INTO product_prices (product_id, currency, unit_cost, selling_price)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(product_id, currency) DO UPDATE SET
          unit_cost     = excluded.unit_cost,
          selling_price = excluded.selling_price,
          updated_at    = datetime('now')
      `);

      for (const oc of others) {
        const ocRate = parseFloat(oc.rate_to_pkr) || 1;
        if (ocRate <= 0) continue;
        const ocCost = baseCost / ocRate;
        const ocSell = baseSell / ocRate;
        stmt.run(productId, oc.code, +ocCost.toFixed(4), +ocSell.toFixed(4));
        createdCurrencies.push(oc.code);
      }
    }

    const rows = db.prepare('SELECT * FROM product_prices WHERE product_id = ? ORDER BY currency ASC').all(productId);
    res.json({ saved: createdCurrencies, prices: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/prices/:currency', (req, res) => {
  try {
    db.prepare('DELETE FROM product_prices WHERE product_id = ? AND currency = ?').run(req.params.id, req.params.currency.toUpperCase());
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sales sub-routes ──────────────────────────────────────────────────────────

router.get('/:id/sales', (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM product_sales WHERE product_id = ?';
    const params = [req.params.id];
    if (from) { sql += ' AND sale_date >= ?'; params.push(from); }
    if (to)   { sql += ' AND sale_date <= ?'; params.push(to); }
    sql += ' ORDER BY sale_date DESC, created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/sales', (req, res) => {
  try {
    const { quantity, unit_price, sale_date, notes } = req.body;
    const result = db.prepare(
      'INSERT INTO product_sales (product_id, quantity, unit_price, sale_date, notes) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, parseFloat(quantity), parseFloat(unit_price), sale_date, notes ?? null);
    res.status(201).json(db.prepare('SELECT * FROM product_sales WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/sales/:saleId', (req, res) => {
  try {
    db.prepare('DELETE FROM product_sales WHERE id = ? AND product_id = ?').run(req.params.saleId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Order history: scan invoices + quotations for this product ────────────────

router.get('/:id/order-history', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const productName = (product.name || '').toLowerCase().trim();
    const articleNum  = (product.article_number || '').toLowerCase().trim();

    // Match a line-item name against this product
    function matchItem(itemName) {
      const n = (itemName || '').toLowerCase();
      if (productName && n.includes(productName)) return true;
      if (articleNum  && n.includes(articleNum))  return true;
      return false;
    }

    // Pull all invoices with client info
    const allInvoices = db.prepare(`
      SELECT i.id, i.number, i.status, i.items, i.currency, i.created_at, i.due_date,
             COALESCE(c.display_name, c.company, c.name) as client_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC
    `).all();

    // Pull all quotations with client info
    const allQuotations = db.prepare(`
      SELECT q.id, q.number, q.status, q.items, q.currency, q.created_at,
             COALESCE(c.display_name, c.company, c.name) as client_name
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      ORDER BY q.created_at DESC
    `).all();

    // Load exchange rates from the currencies table (rate_to_usd = how many USD 1 unit of this currency is)
    const rateMap = {}; // { 'AED': 0.272, 'PKR': 0.00358, 'USD': 1, ... }
    db.prepare('SELECT code, rate_to_usd FROM currencies').all().forEach(r => {
      rateMap[r.code] = parseFloat(r.rate_to_usd) || 1;
    });
    // USD always = 1
    if (!rateMap['USD']) rateMap['USD'] = 1;

    const toUSD = (amount, currency) => amount * (rateMap[currency] || 1);

    const invoiceOrders = [];
    for (const inv of allInvoices) {
      let items = [];
      try { items = JSON.parse(inv.items || '[]'); } catch { items = []; }
      const matched = items.filter(it => matchItem(it.name));
      if (matched.length === 0) continue;
      const quantity   = matched.reduce((s, it) => s + (parseFloat(it.quantity) || 0), 0);
      const revenue    = matched.reduce((s, it) => s + (parseFloat(it.total)    || 0), 0);
      const revenue_usd = toUSD(revenue, inv.currency || 'USD');
      invoiceOrders.push({
        type: 'invoice',
        id: inv.id, number: inv.number, status: inv.status,
        client_name: inv.client_name, currency: inv.currency || 'USD',
        created_at: inv.created_at, due_date: inv.due_date,
        quantity, revenue, revenue_usd,
      });
    }

    const quotationOrders = [];
    for (const q of allQuotations) {
      let items = [];
      try { items = JSON.parse(q.items || '[]'); } catch { items = []; }
      const matched = items.filter(it => matchItem(it.name));
      if (matched.length === 0) continue;
      const quantity    = matched.reduce((s, it) => s + (parseFloat(it.quantity) || 0), 0);
      const revenue     = matched.reduce((s, it) => s + (parseFloat(it.total)    || 0), 0);
      const revenue_usd = toUSD(revenue, q.currency || 'USD');
      quotationOrders.push({
        type: 'quotation',
        id: q.id, number: q.number, status: q.status,
        client_name: q.client_name, currency: q.currency || 'USD',
        created_at: q.created_at,
        quantity, revenue, revenue_usd,
      });
    }

    // Per-currency revenue groups (native amounts)
    const invoiceByCurrency    = {};
    const quotationByCurrency  = {};
    for (const o of invoiceOrders) {
      invoiceByCurrency[o.currency] = (invoiceByCurrency[o.currency] || 0) + o.revenue;
    }
    for (const o of quotationOrders) {
      quotationByCurrency[o.currency] = (quotationByCurrency[o.currency] || 0) + o.revenue;
    }

    // USD-equivalent totals
    const totalQtyInvoiced   = invoiceOrders.reduce((s, o) => s + o.quantity,    0);
    const totalQtyQuoted     = quotationOrders.reduce((s, o) => s + o.quantity,  0);
    const invoiceUSDEquiv    = invoiceOrders.reduce((s, o) => s + o.revenue_usd, 0);
    const quotationUSDEquiv  = quotationOrders.reduce((s, o) => s + o.revenue_usd, 0);
    const mixedInvoice       = Object.keys(invoiceByCurrency).length > 1;
    const mixedQuotation     = Object.keys(quotationByCurrency).length > 1;

    res.json({
      invoices:   invoiceOrders,
      quotations: quotationOrders,
      stats: {
        invoice_count:         invoiceOrders.length,
        quotation_count:       quotationOrders.length,
        total_qty_invoiced:    totalQtyInvoiced,
        total_qty_quoted:      totalQtyQuoted,
        invoice_by_currency:   invoiceByCurrency,    // { AED: 45000, USD: 500 }
        quotation_by_currency: quotationByCurrency,
        invoice_usd_equiv:     invoiceUSDEquiv,      // AED→USD + PKR→USD + …
        quotation_usd_equiv:   quotationUSDEquiv,
        mixed_invoice:         mixedInvoice,         // true if >1 currency used
        mixed_quotation:       mixedQuotation,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
