import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/payments — all payments with invoice + client info
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        p.*,
        i.number        AS invoice_number,
        i.currency      AS currency,
        i.total         AS invoice_total,
        i.shipping_phone AS shipping_phone,
        COALESCE(c.display_name, c.company, c.name) AS client_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN clients  c ON p.client_id  = c.id
      ORDER BY p.paid_at DESC, p.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
