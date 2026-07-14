import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/index.js';

const router = Router();

const FIELDS = ['name','type','contact_name','phone','email','address','city','country','bank_details','notes','rating','status','opening_balance'];

// ── GET list ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.*,
        (SELECT COUNT(DISTINCT pv.project_id) FROM project_vendors pv WHERE pv.vendor_id = v.id)
          + (SELECT COUNT(DISTINCT ps.project_id) FROM project_shipping ps WHERE ps.vendor_id = v.id) as project_count,
        COALESCE(v.opening_balance, 0)
          + (SELECT COALESCE(SUM(pv.invoice_amount), 0) FROM project_vendors pv WHERE pv.vendor_id = v.id)
          + (SELECT COALESCE(SUM(ps.amount), 0) FROM project_shipping ps WHERE ps.vendor_id = v.id) as total_billed,
        (SELECT COALESCE(SUM(pvp.amount), 0) FROM project_vendor_payments pvp
           JOIN project_vendors pv ON pvp.project_vendor_id = pv.id WHERE pv.vendor_id = v.id)
          + (SELECT COALESCE(SUM(ps.paid_amount), 0) FROM project_shipping ps WHERE ps.vendor_id = v.id) as total_paid
      FROM vendors v
      ORDER BY v.name ASC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET single with payment history ───────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Not found' });

    // Get all projects this vendor worked on
    const projectVendors = db.prepare(`
      SELECT pv.*,
        p.title as project_title, p.status as project_status,
        COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE project_vendor_id = pv.id), 0) as total_paid
      FROM project_vendors pv
      JOIN projects p ON pv.project_id = p.id
      WHERE pv.vendor_id = ?
      ORDER BY pv.created_at DESC
    `).all(req.params.id);

    // Get payments for each project_vendor
    const withPayments = projectVendors.map(pv => ({
      ...pv,
      payments: db.prepare(
        'SELECT * FROM project_vendor_payments WHERE project_vendor_id = ? ORDER BY paid_at DESC'
      ).all(pv.id),
    }));

    // Shipping records for this vendor — include individual payment history
    const shippingRows = db.prepare(`
      SELECT ps.*, p.title as project_title, p.status as project_status
      FROM project_shipping ps
      JOIN projects p ON p.id = ps.project_id
      WHERE ps.vendor_id = ?
      ORDER BY ps.shipping_date DESC
    `).all(req.params.id);

    const shippingProjects = shippingRows.map(ps => ({
      ...ps,
      payments: db.prepare(
        `SELECT * FROM project_vendor_payments WHERE shipping_id = ? ORDER BY paid_at DESC`
      ).all(ps.id),
    }));

    // Flat payment history: all payments sorted by date DESC with project + service context
    const allPayments = db.prepare(`
      SELECT
        pvp.id,
        pvp.amount,
        pvp.method,
        pvp.reference,
        pvp.notes,
        pvp.paid_at,
        pvp.batch_id,
        p.title        as project_title,
        pv.service_description,
        pv.invoice_amount,
        ps.carrier     as shipping_carrier,
        ps.tracking_number,
        CASE WHEN pvp.shipping_id IS NOT NULL THEN 'shipping' ELSE 'service' END as payment_type
      FROM project_vendor_payments pvp
      LEFT JOIN project_vendors   pv ON pv.id  = pvp.project_vendor_id
      LEFT JOIN project_shipping  ps ON ps.id  = pvp.shipping_id
      LEFT JOIN projects          p  ON p.id   = COALESCE(pvp.project_id, pv.project_id)
      WHERE
        pv.vendor_id = ? OR ps.vendor_id = ?
      ORDER BY pvp.paid_at DESC, pvp.id DESC
    `).all(req.params.id, req.params.id);

    // Group into payment batches — a single lump-sum payment that got auto-distributed
    // across several projects/shipments shares one batch_id and should read as one
    // transaction, not several unrelated ones. Rows from before batch_id existed (or the
    // legacy shipping/global routes that didn't set it) each become their own batch.
    const batchMap = new Map();
    for (const p of allPayments) {
      const key = p.batch_id || `single-${p.id}`;
      if (!batchMap.has(key)) {
        batchMap.set(key, {
          batch_id: key, paid_at: p.paid_at, method: p.method,
          reference: p.reference, notes: p.notes, total_amount: 0, applications: [],
        });
      }
      const batch = batchMap.get(key);
      batch.total_amount += parseFloat(p.amount) || 0;
      // Full row kept per-application (not just id/amount) so editing/deleting a single
      // application within a batch still has the method/reference/notes/paid_at it needs.
      batch.applications.push({ ...p });
    }
    const paymentBatches = [...batchMap.values()].sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));

    // Total billed/paid across both service (project_vendors) and shipping work —
    // mirrors the list endpoint's computation so the summary cards aren't stuck at 0.
    const totals = db.prepare(`
      SELECT
        COALESCE(v.opening_balance, 0)
          + (SELECT COALESCE(SUM(pv.invoice_amount), 0) FROM project_vendors pv WHERE pv.vendor_id = v.id)
          + (SELECT COALESCE(SUM(ps.amount), 0) FROM project_shipping ps WHERE ps.vendor_id = v.id) as total_billed,
        (SELECT COALESCE(SUM(pvp.amount), 0) FROM project_vendor_payments pvp
           JOIN project_vendors pv ON pvp.project_vendor_id = pv.id WHERE pv.vendor_id = v.id)
          + (SELECT COALESCE(SUM(ps.paid_amount), 0) FROM project_shipping ps WHERE ps.vendor_id = v.id) as total_paid
      FROM vendors v WHERE v.id = ?
    `).get(req.params.id);

    res.json({ ...vendor, ...totals, projects: withPayments, shippingProjects, allPayments, paymentBatches });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });
    const vals = FIELDS.map(f => {
      if (f === 'rating') return parseInt(req.body[f]) || 0;
      if (f === 'opening_balance') return parseFloat(req.body[f]) || 0;
      if (f === 'status' && !req.body[f]) return 'active';
      if (f === 'type'   && !req.body[f]) return 'process';
      return req.body[f] ?? '';
    });
    const result = db.prepare(
      `INSERT INTO vendors (${FIELDS.join(',')}) VALUES (${FIELDS.map(() => '?').join(',')})`
    ).run(...vals);
    res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update ────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });
    const vals = FIELDS.map(f => {
      if (f === 'rating') return parseInt(req.body[f]) || 0;
      if (f === 'opening_balance') return parseFloat(req.body[f]) || 0;
      return req.body[f] ?? '';
    });
    db.prepare(
      `UPDATE vendors SET ${FIELDS.map(f => `${f}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`
    ).run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST shipping payment — auto-distributes across outstanding shipments (oldest first) ──
router.post('/:id/shipping-payments', (req, res) => {
  try {
    const vendorId = req.params.id;
    const vendor   = db.prepare('SELECT id FROM vendors WHERE id = ?').get(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    let remaining = parseFloat(req.body.amount) || 0;
    if (remaining <= 0) return res.status(400).json({ error: 'Amount must be greater than 0.' });

    const method    = req.body.method    || 'cash';
    const reference = req.body.reference || '';
    const notes     = req.body.notes     || '';
    const paidAt    = req.body.paid_at   || new Date().toISOString().slice(0, 10);

    // All outstanding shipping records for this vendor, oldest shipping_date first
    const outstanding = db.prepare(`
      SELECT *, (COALESCE(amount,0) - COALESCE(paid_amount,0)) as due
      FROM project_shipping
      WHERE vendor_id = ? AND (COALESCE(amount,0) - COALESCE(paid_amount,0)) > 0
      ORDER BY shipping_date ASC, id ASC
    `).all(vendorId);

    const applied  = [];
    const batchId  = randomUUID();

    db.transaction(() => {
      for (const ship of outstanding) {
        if (remaining <= 0) break;
        const due   = parseFloat(ship.due) || 0;
        const apply = Math.min(remaining, due);

        db.prepare(
          `INSERT INTO project_vendor_payments (project_vendor_id, project_id, amount, method, reference, notes, paid_at, shipping_id, batch_id)
           VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(ship.project_id, apply, method, reference, notes, paidAt, ship.id, batchId);

        const newPaid = (parseFloat(ship.paid_amount) || 0) + apply;
        db.prepare(
          `UPDATE project_shipping SET paid_amount = ?, paid = CASE WHEN ? >= amount THEN 1 ELSE 0 END WHERE id = ?`
        ).run(newPaid, newPaid, ship.id);

        applied.push({ shipping_id: ship.id, project_id: ship.project_id, amount: apply });
        remaining -= apply;
      }

      // Surplus after all outstanding → apply to most recent shipping record
      if (remaining > 0) {
        const lastShip = db.prepare(
          `SELECT * FROM project_shipping WHERE vendor_id = ? ORDER BY shipping_date DESC, id DESC LIMIT 1`
        ).get(vendorId);
        if (lastShip) {
          db.prepare(
            `INSERT INTO project_vendor_payments (project_vendor_id, project_id, amount, method, reference, notes, paid_at, shipping_id, batch_id)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(lastShip.project_id, remaining, method, reference, notes, paidAt, lastShip.id, batchId);
          const newPaid = (parseFloat(lastShip.paid_amount) || 0) + remaining;
          db.prepare(
            `UPDATE project_shipping SET paid_amount = ?, paid = CASE WHEN ? >= amount THEN 1 ELSE 0 END WHERE id = ?`
          ).run(newPaid, newPaid, lastShip.id);
          applied.push({ shipping_id: lastShip.id, project_id: lastShip.project_id, amount: remaining });
          remaining = 0;
        }
      }
    })();

    res.status(201).json({ applied, leftover: Math.max(0, remaining), batch_id: batchId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST global payment — auto-distributes across outstanding project_vendors ──
router.post('/:id/payments', (req, res) => {
  try {
    const vendorId = req.params.id;
    const vendor   = db.prepare('SELECT id FROM vendors WHERE id = ?').get(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    let remaining = parseFloat(req.body.amount) || 0;
    if (remaining <= 0) return res.status(400).json({ error: 'Amount must be greater than 0.' });

    const method    = req.body.method    || 'cash';
    const reference = req.body.reference || '';
    const notes     = req.body.notes     || '';
    const paid_at   = req.body.paid_at   || new Date().toISOString().slice(0, 10);

    // Get all outstanding project_vendors for this vendor, oldest first
    const pvRows = db.prepare(`
      SELECT pv.id,
             pv.project_id,
             COALESCE(pv.invoice_amount, 0) as invoice_amount,
             COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE project_vendor_id = pv.id), 0) as paid_so_far
      FROM project_vendors pv
      WHERE pv.vendor_id = ?
      ORDER BY pv.created_at ASC
    `).all(vendorId);

    const batchId = randomUUID();
    const insStmt = db.prepare(
      `INSERT INTO project_vendor_payments (project_vendor_id, project_id, amount, method, reference, notes, paid_at, batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const applied = [];
    db.transaction(() => {
      for (const pv of pvRows) {
        if (remaining <= 0) break;
        const due = pv.invoice_amount - pv.paid_so_far;
        if (due <= 0) continue;
        const apply = Math.min(remaining, due);
        const r = insStmt.run(pv.id, pv.project_id, apply, method, reference, notes, paid_at, batchId);
        applied.push({ project_vendor_id: pv.id, amount: apply, payment_id: r.lastInsertRowid });
        remaining -= apply;
      }
      // If amount exceeds all outstanding, record surplus on the most recent pv
      if (remaining > 0 && pvRows.length > 0) {
        const lastPv = pvRows[pvRows.length - 1];
        const r = insStmt.run(lastPv.id, lastPv.project_id, remaining, method, reference, notes, paid_at, batchId);
        applied.push({ project_vendor_id: lastPv.id, amount: remaining, payment_id: r.lastInsertRowid });
      }
    })();

    res.status(201).json({ applied, leftover: Math.max(0, remaining), batch_id: batchId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update a single payment ───────────────────────────────────────────────
router.put('/:id/payments/:paymentId', (req, res) => {
  try {
    // Find the payment — works for both process vendors (via project_vendors join) and shipping payments (shipping_id set)
    const payment = db.prepare(`SELECT * FROM project_vendor_payments WHERE id = ?`).get(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });

    // Verify ownership: either via project_vendors or via project_shipping.vendor_id
    if (payment.shipping_id) {
      const ship = db.prepare('SELECT vendor_id FROM project_shipping WHERE id = ?').get(payment.shipping_id);
      if (!ship || String(ship.vendor_id) !== String(req.params.id)) return res.status(404).json({ error: 'Payment not found.' });
    } else {
      const pv = db.prepare('SELECT vendor_id FROM project_vendors WHERE id = ?').get(payment.project_vendor_id);
      if (!pv || String(pv.vendor_id) !== String(req.params.id)) return res.status(404).json({ error: 'Payment not found.' });
    }

    const oldAmt = parseFloat(payment.amount) || 0;
    const newAmt = parseFloat(req.body.amount);
    if (!newAmt || newAmt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0.' });
    const method    = req.body.method    || payment.method;
    const reference = req.body.reference ?? payment.reference;
    const notes     = req.body.notes     ?? payment.notes;
    const paid_at   = req.body.paid_at   || payment.paid_at;

    db.transaction(() => {
      db.prepare(`UPDATE project_vendor_payments SET amount=?, method=?, reference=?, notes=?, paid_at=? WHERE id=?`)
        .run(newAmt, method, reference, notes, paid_at, req.params.paymentId);
      // If it's a shipping payment, keep paid_amount in sync
      if (payment.shipping_id) {
        const diff = newAmt - oldAmt;
        db.prepare(`UPDATE project_shipping SET paid_amount = MAX(0, COALESCE(paid_amount,0) + ?), paid = CASE WHEN COALESCE(paid_amount,0) + ? >= amount THEN 1 ELSE 0 END WHERE id = ?`)
          .run(diff, diff, payment.shipping_id);
      }
    })();

    res.json(db.prepare('SELECT * FROM project_vendor_payments WHERE id = ?').get(req.params.paymentId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE a single payment ───────────────────────────────────────────────────
router.delete('/:id/payments/:paymentId', (req, res) => {
  try {
    const payment = db.prepare(`SELECT * FROM project_vendor_payments WHERE id = ?`).get(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });

    db.transaction(() => {
      // If shipping payment, reverse the paid_amount
      if (payment.shipping_id) {
        const amt = parseFloat(payment.amount) || 0;
        db.prepare(`UPDATE project_shipping SET paid_amount = MAX(0, COALESCE(paid_amount,0) - ?), paid = 0 WHERE id = ?`)
          .run(amt, payment.shipping_id);
      }
      db.prepare('DELETE FROM project_vendor_payments WHERE id = ?').run(req.params.paymentId);
    })();

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE vendor ─────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM vendors WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
