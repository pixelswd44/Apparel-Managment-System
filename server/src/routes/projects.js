import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// A project is an order: its invoice (what the client pays), the products and
// sizes to make, where it shipped, and the expenses charged to it on the
// Expenses screen. Cost = those expenses; profit = received − cost.

const PROJECT_WITH_CLIENT = `
  SELECT p.*,
    c.name        as client_name,
    c.company     as client_company,
    c.email       as client_email,
    c.phone       as client_phone,
    c.shipping_receiver_name  as client_ship_name,
    c.shipping_receiver_phone as client_ship_phone,
    c.shipping_address  as client_ship_address,
    c.shipping_city     as client_ship_city,
    c.shipping_country  as client_ship_country,
    i.number      as invoice_number,
    i.total       as invoice_total,
    i.amount_paid as invoice_amount_paid,
    i.currency    as invoice_currency
  FROM projects p
  LEFT JOIN clients c ON p.client_id = c.id
  LEFT JOIN invoices i ON p.invoice_id = i.id
`;

const normStatus = s => (s === 'completed' ? 'completed' : 'active');

function parseProduct(p) {
  return { ...p, sizes: JSON.parse(p.sizes || '[]') };
}

function enrichProject(project) {
  if (!project) return null;
  const products = db.prepare(
    'SELECT * FROM project_products WHERE project_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(project.id).map(parseProduct);

  const shipping = db.prepare(`
    SELECT id, project_id, carrier, tracking_number, shipping_date, notes, created_at
    FROM project_shipping WHERE project_id = ? ORDER BY shipping_date DESC, id DESC
  `).all(project.id);

  const expenses = db.prepare(`
    SELECT e.*, ec.name as category_name, ec.color as category_color
    FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    WHERE e.project_id = ? ORDER BY e.expense_date DESC, e.id DESC
  `).all(project.id);

  // Client payments on the linked invoice — calcProject() uses each payment's
  // actual PKR received (when entered) instead of re-converting at today's rate.
  const invoice_payments = project.invoice_id
    ? db.prepare('SELECT amount, currency, amount_pkr_actual, paid_at FROM payments WHERE invoice_id = ? ORDER BY paid_at ASC, id ASC').all(project.invoice_id)
    : [];

  let images = [];
  try { images = JSON.parse(project.images || '[]'); } catch {}
  return { ...project, status: normStatus(project.status), products, shipping, expenses, images, invoice_payments };
}

function loadProject(id) {
  return enrichProject(db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(id));
}

// PKR actually received against an invoice — mirrors financials.js paymentToPKR():
// a payment's manually entered amount_pkr_actual wins, otherwise amount × rate.
// Any amount_paid not backed by payment rows is converted at the current rate.
function invoiceReceivedPKR(invoiceId, amountPaid, invoiceCurrency, getRateToPKR) {
  const pays = db.prepare('SELECT amount, currency, amount_pkr_actual FROM payments WHERE invoice_id = ?').all(invoiceId);
  let pkr = 0, raw = 0;
  for (const p of pays) {
    const amt = parseFloat(p.amount) || 0;
    raw += amt;
    pkr += (p.amount_pkr_actual !== null && p.amount_pkr_actual !== undefined && p.amount_pkr_actual !== '')
      ? (parseFloat(p.amount_pkr_actual) || 0)
      : amt * getRateToPKR(p.currency || invoiceCurrency);
  }
  const rest = (parseFloat(amountPaid) || 0) - raw;
  if (rest > 0.005) pkr += rest * getRateToPKR(invoiceCurrency);
  return pkr;
}

// ── GET list ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*,
        c.name as client_name, c.company as client_company,
        i.number as invoice_number, i.amount_paid as invoice_amount_paid,
        i.total as invoice_total, i.currency as invoice_currency,
        (SELECT COUNT(*) FROM project_products WHERE project_id = p.id) as product_count,
        (SELECT COUNT(*) FROM expenses WHERE project_id = p.id) as expense_count,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE project_id = p.id), 0) as fin_total_expense
      FROM projects p
      LEFT JOIN clients  c ON p.client_id  = c.id
      LEFT JOIN invoices i ON p.invoice_id = i.id
      ORDER BY p.updated_at DESC
    `).all();

    const currencyRates = {};
    try {
      db.prepare('SELECT code, rate_to_pkr FROM currencies').all().forEach(c => {
        currencyRates[c.code] = parseFloat(c.rate_to_pkr) || 1;
      });
    } catch {}
    const getRateToPKR = code => (!code || code === 'PKR') ? 1 : (currencyRates[code] || 1);

    // Received mirrors calcProject() on the client: exchange_rate_actual override
    // if set, else the invoice payments' actual PKR (same as Financials).
    res.json(rows.map(row => {
      const receivedCurrency = row.invoice_id ? (row.invoice_currency || 'USD') : (row.currency || 'PKR');
      const receivedRaw      = row.invoice_id ? (parseFloat(row.invoice_amount_paid)||0) : (parseFloat(row.amount_received)||0);
      const rateOverride     = row.exchange_rate_actual && row.exchange_rate_actual > 0;
      const exchangeRate     = rateOverride ? row.exchange_rate_actual : getRateToPKR(receivedCurrency);
      const fin_received     = (row.invoice_id && !rateOverride)
        ? invoiceReceivedPKR(row.invoice_id, row.invoice_amount_paid, receivedCurrency, getRateToPKR)
        : receivedRaw * exchangeRate;
      const fin_outstanding  = Math.max(0, ((parseFloat(row.invoice_total) || 0) - receivedRaw) * exchangeRate);
      return { ...row, status: normStatus(row.status), fin_received, fin_outstanding, fin_net: fin_received - row.fin_total_expense };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET single ────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const project = loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { title, client_id, invoice_id, currency = 'PKR', amount_received = 0, exchange_rate_actual = 0, notes = '' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Project title is required.' });

    // Only the client's FINAL DESIGNS flow into the project's reference images —
    // the full tech-pack pile stays on the client so the floor only sees the
    // approved artwork. Falls back to tech_packs for clients with no finals set.
    let images = [];
    if (client_id) {
      try {
        const c = db.prepare('SELECT final_designs, tech_packs FROM clients WHERE id = ?').get(client_id);
        let packs = JSON.parse(c?.final_designs || '[]');
        if (!Array.isArray(packs) || packs.length === 0) packs = JSON.parse(c?.tech_packs || '[]');
        images = (Array.isArray(packs) ? packs : []).filter(p => p && p.filename).map(p => ({ ...p, from_client: true }));
      } catch { /* ignore */ }
    }

    const result = db.prepare(`
      INSERT INTO projects (title, client_id, invoice_id, currency, amount_received, exchange_rate_actual, notes, status, images)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(title.trim(), client_id || null, invoice_id || null, currency,
           parseFloat(amount_received) || 0, parseFloat(exchange_rate_actual) || 0, notes || '', JSON.stringify(images));

    res.status(201).json(loadProject(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update ────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { title, client_id, invoice_id, currency, amount_received, exchange_rate_actual = 0, status, notes, images } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Project title is required.' });
    const imagesStr = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : '[]';

    // completed_at records when the project was marked completed — set it the
    // moment it first becomes completed, clear it when it's reopened.
    const existing = db.prepare('SELECT status, completed_at FROM projects WHERE id = ?').get(req.params.id);
    // The edit form doesn't send a status — keep the current one then
    const newStatus = normStatus(status === undefined ? existing?.status : status);
    let completedAt = existing?.completed_at ?? null;
    if (newStatus === 'completed' && existing?.status !== 'completed') completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    else if (newStatus !== 'completed') completedAt = null;

    db.prepare(`
      UPDATE projects
      SET title=?, client_id=?, invoice_id=?, currency=?, amount_received=?, exchange_rate_actual=?, status=?, notes=?, images=?,
          completed_at=?, updated_at=datetime('now')
      WHERE id=?
    `).run(title.trim(), client_id || null, invoice_id || null, currency || 'PKR',
           parseFloat(amount_received) || 0, parseFloat(exchange_rate_actual) || 0,
           newStatus, notes || '', imagesStr, completedAt,
           req.params.id);

    const project = loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT status only (Mark completed / Reopen) ────────────────────────────────
router.put('/:id/status', (req, res) => {
  try {
    const existing = db.prepare('SELECT status, completed_at FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const newStatus = normStatus(req.body.status);
    const completedAt = newStatus === 'completed'
      ? (existing.status === 'completed' && existing.completed_at ? existing.completed_at : new Date().toISOString().slice(0, 19).replace('T', ' '))
      : null;
    db.prepare("UPDATE projects SET status=?, completed_at=?, updated_at=datetime('now') WHERE id=?")
      .run(newStatus, completedAt, req.params.id);
    res.json(loadProject(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST sync the client's FINAL DESIGNS into project images ─────────────────
router.post('/:id/sync-tech-packs', (req, res) => {
  try {
    const p = db.prepare('SELECT id, client_id, images FROM projects WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (!p.client_id) return res.status(400).json({ error: 'Project has no client linked.' });
    const c = db.prepare('SELECT final_designs, tech_packs FROM clients WHERE id = ?').get(p.client_id);
    let packs = [], images = [];
    try {
      packs = JSON.parse(c?.final_designs || '[]');
      if (!Array.isArray(packs) || packs.length === 0) packs = JSON.parse(c?.tech_packs || '[]');
    } catch {}
    try { images = JSON.parse(p.images || '[]'); } catch {}
    const have = new Set(images.map(i => i.filename));
    const added = packs.filter(tp => tp?.filename && !have.has(tp.filename)).map(tp => ({ ...tp, from_client: true }));
    if (added.length) {
      db.prepare("UPDATE projects SET images=?, updated_at=datetime('now') WHERE id=?")
        .run(JSON.stringify([...images, ...added]), p.id);
    }
    res.json({ added: added.length, project: loadProject(p.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Images (final designs / reference photos) ─────────────────────────────────
router.put('/:id/images', (req, res) => {
  try {
    const images = req.body.images || [];
    const imagesStr = typeof images === 'string' ? images : JSON.stringify(images);
    db.prepare("UPDATE projects SET images=?, updated_at=datetime('now') WHERE id=?")
      .run(imagesStr, req.params.id);
    const project = loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
// The project's expenses are real money already spent, so they are kept and
// become ordinary business expenses rather than being deleted with it.
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.transaction(() => {
      db.prepare('UPDATE expenses SET project_id = NULL WHERE project_id = ?').run(row.id);
      db.prepare('DELETE FROM project_products WHERE project_id = ?').run(row.id);
      db.prepare('DELETE FROM project_shipping WHERE project_id = ?').run(row.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(row.id);
    })();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Products (what to make: product + size breakdown) ────────────────

function ppBody(body) {
  const { product_id, product_name, unit = 'pcs', sizes = '[]', total_quantity = 0, notes = '', sort_order = 0 } = body;
  return {
    product_id:     product_id || null,
    product_name:   (product_name || '').trim(),
    unit,
    sizes:          typeof sizes === 'string' ? sizes : JSON.stringify(sizes),
    total_quantity: parseFloat(total_quantity) || 0,
    notes:          notes || '',
    sort_order:     parseInt(sort_order) || 0,
  };
}

router.post('/:id/products', (req, res) => {
  try {
    const b = ppBody(req.body);
    if (!b.product_name) return res.status(400).json({ error: 'Product name is required.' });
    const result = db.prepare(`
      INSERT INTO project_products (project_id, product_id, product_name, unit, sizes, total_quantity, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, b.product_id, b.product_name, b.unit, b.sizes, b.total_quantity, b.notes, b.sort_order);
    const pp = db.prepare('SELECT * FROM project_products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(parseProduct(pp));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/products/:ppId', (req, res) => {
  try {
    const b = ppBody(req.body);
    if (!b.product_name) return res.status(400).json({ error: 'Product name is required.' });
    db.prepare(`
      UPDATE project_products
      SET product_id=?, product_name=?, unit=?, sizes=?, total_quantity=?, notes=?, sort_order=?
      WHERE id=? AND project_id=?
    `).run(b.product_id, b.product_name, b.unit, b.sizes, b.total_quantity, b.notes, b.sort_order,
           req.params.ppId, req.params.id);
    const pp = db.prepare('SELECT * FROM project_products WHERE id = ?').get(req.params.ppId);
    if (!pp) return res.status(404).json({ error: 'Not found' });
    res.json(parseProduct(pp));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/products/:ppId', (req, res) => {
  try {
    db.prepare('DELETE FROM project_products WHERE id=? AND project_id=?').run(req.params.ppId, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Shipping (shipping agent + tracking number; cost goes in Expenses) ─

function shipBody(body) {
  return {
    carrier:         (body.carrier || '').trim(),
    tracking_number: (body.tracking_number || '').trim(),
    shipping_date:   body.shipping_date || '',
    notes:           body.notes || '',
  };
}

router.post('/:id/shipping', (req, res) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id=?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const b = shipBody(req.body);
    if (!b.carrier) return res.status(400).json({ error: 'Shipping agent is required.' });
    const result = db.prepare(`
      INSERT INTO project_shipping (project_id, carrier, tracking_number, shipping_date, notes, amount, paid, paid_amount)
      VALUES (?, ?, ?, ?, ?, 0, 0, 0)
    `).run(project.id, b.carrier, b.tracking_number, b.shipping_date, b.notes);
    res.status(201).json(db.prepare('SELECT id, project_id, carrier, tracking_number, shipping_date, notes FROM project_shipping WHERE id=?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/shipping/:shipId', (req, res) => {
  try {
    const b = shipBody(req.body);
    if (!b.carrier) return res.status(400).json({ error: 'Shipping agent is required.' });
    const r = db.prepare('UPDATE project_shipping SET carrier=?, tracking_number=?, shipping_date=?, notes=? WHERE id=? AND project_id=?')
      .run(b.carrier, b.tracking_number, b.shipping_date, b.notes, req.params.shipId, req.params.id);
    if (!r.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT id, project_id, carrier, tracking_number, shipping_date, notes FROM project_shipping WHERE id=?').get(req.params.shipId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/shipping/:shipId', (req, res) => {
  try {
    db.prepare('DELETE FROM project_shipping WHERE id=? AND project_id=?').run(req.params.shipId, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
