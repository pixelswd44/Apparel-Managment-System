import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function enrich(item) {
  return {
    ...item,
    qty_available: Math.max(0, (item.qty_total || 0) - (item.qty_used || 0)),
  };
}

// ── GET all items ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const items = db.prepare(`
    SELECT * FROM inventory_items ORDER BY category, name
  `).all().map(enrich);
  res.json(items);
});

// ── GET single item ───────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const item = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(enrich(item));
});

// ── GET transactions for an item ──────────────────────────────────────────────
router.get('/:id/transactions', (req, res) => {
  const txns = db.prepare(`
    SELECT * FROM inventory_transactions WHERE item_id = ? ORDER BY created_at DESC
  `).all(req.params.id);
  res.json(txns);
});

// ── POST create item ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, category = 'fabric', unit = 'Yards', qty_total = 0, qty_used = 0, rate = 0, notes = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const stmt = db.prepare(`
    INSERT INTO inventory_items (name, category, unit, qty_total, qty_used, rate, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name.trim(), category, unit, qty_total, qty_used, rate, notes);
  const item = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(result.lastInsertRowid);

  // Log opening stock transaction
  if (parseFloat(qty_total) > 0) {
    db.prepare(`
      INSERT INTO inventory_transactions (item_id, type, qty, reference, notes)
      VALUES (?, 'in', ?, 'Opening stock', ?)
    `).run(result.lastInsertRowid, qty_total, notes || 'Initial entry');
  }

  res.status(201).json(enrich(item));
});

// ── PUT update item ───────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { name, category, unit, qty_total, qty_used, rate, notes } = req.body;
  const existing = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE inventory_items
    SET name = ?, category = ?, unit = ?, qty_total = ?, qty_used = ?, rate = ?, notes = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? existing.name,
    category ?? existing.category,
    unit ?? existing.unit,
    qty_total ?? existing.qty_total,
    qty_used  ?? existing.qty_used,
    rate      ?? existing.rate,
    notes     ?? existing.notes,
    req.params.id,
  );

  const updated = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  res.json(enrich(updated));
});

// ── POST add stock (incoming) ─────────────────────────────────────────────────
router.post('/:id/stock-in', (req, res) => {
  const { qty, reference = '', notes = '', unit_price } = req.body;
  const item = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const addQty   = parseFloat(qty)        || 0;
  const newRate  = parseFloat(unit_price);          // may be NaN if not provided
  if (addQty <= 0) return res.status(400).json({ error: 'qty must be > 0' });

  // Update qty_total; also update rate if a price was provided (tracks latest purchase price)
  if (newRate > 0) {
    db.prepare(`UPDATE inventory_items SET qty_total = qty_total + ?, rate = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(addQty, newRate, req.params.id);
  } else {
    db.prepare(`UPDATE inventory_items SET qty_total = qty_total + ?, updated_at = datetime('now') WHERE id = ?`)
      .run(addQty, req.params.id);
  }

  // Record transaction with unit_price for price history
  db.prepare(`INSERT INTO inventory_transactions (item_id, type, qty, reference, notes, unit_price) VALUES (?, 'in', ?, ?, ?, ?)`)
    .run(req.params.id, addQty, reference, notes, newRate > 0 ? newRate : 0);

  const updated = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  res.json(enrich(updated));
});

// ── POST deduct stock (use) ───────────────────────────────────────────────────
router.post('/:id/use', (req, res) => {
  const { qty, reference = '', notes = '' } = req.body;
  const item = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const useQty = parseFloat(qty) || 0;
  if (useQty <= 0) return res.status(400).json({ error: 'qty must be > 0' });

  db.prepare(`UPDATE inventory_items SET qty_used = qty_used + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(useQty, req.params.id);
  db.prepare(`INSERT INTO inventory_transactions (item_id, type, qty, reference, notes) VALUES (?, 'out', ?, ?, ?)`)
    .run(req.params.id, useQty, reference, notes);

  const updated = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(req.params.id);
  res.json(enrich(updated));
});

// ── DELETE item ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM inventory_items WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ── POST sync-project-fabric-purchase ────────────────────────────────────────
// Called when a project product is saved.
// Tracks fabric purchased quantities as stock-in, auto-creates items if needed.
// Idempotent: reverses previous purchase transactions and re-applies fresh ones.
router.post('/sync-project-fabric-purchase', (req, res) => {
  const { project_product_id, fabrics } = req.body;
  if (!project_product_id) return res.status(400).json({ error: 'project_product_id required' });

  const ref = `pp-${project_product_id}-purchase`;

  const sync = db.transaction(() => {
    // 1. Reverse previous stock-in transactions for this project product
    const prev = db.prepare(
      `SELECT item_id, qty FROM inventory_transactions WHERE reference = ? AND type = 'in'`
    ).all(ref);
    for (const { item_id, qty } of prev) {
      db.prepare(
        `UPDATE inventory_items SET qty_total = MAX(0, qty_total - ?), updated_at = datetime('now') WHERE id = ?`
      ).run(qty, item_id);
    }
    db.prepare(`DELETE FROM inventory_transactions WHERE reference = ? AND type = 'in'`).run(ref);

    // 2. Apply fresh stock-in for current fabric rows
    const synced = [];
    for (const fabric of (fabrics || [])) {
      const qty  = parseFloat(fabric.qty)  || 0;
      const rate = parseFloat(fabric.rate) || 0;
      const name = (fabric.name || '').trim();
      if (qty <= 0 || !name) continue;

      // Find or auto-create the inventory item
      let item = fabric.inventory_item_id
        ? db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(fabric.inventory_item_id)
        : null;

      if (!item) {
        // Try exact name match (case-insensitive)
        item = db.prepare(
          `SELECT * FROM inventory_items WHERE LOWER(name) = LOWER(?)`
        ).get(name);
      }

      if (!item) {
        // Auto-create the inventory item
        const ins = db.prepare(
          `INSERT INTO inventory_items (name, category, unit, qty_total, qty_used, rate, notes)
           VALUES (?, 'fabric', ?, 0, 0, ?, 'Auto-created from project')`
        ).run(name, fabric.unit || 'KG', rate);
        item = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(ins.lastInsertRowid);
      }

      // Add stock-in
      db.prepare(
        `UPDATE inventory_items SET qty_total = qty_total + ?, rate = CASE WHEN ? > 0 THEN ? ELSE rate END, updated_at = datetime('now') WHERE id = ?`
      ).run(qty, rate, rate, item.id);
      db.prepare(
        `INSERT INTO inventory_transactions (item_id, type, qty, reference, notes, unit_price) VALUES (?, 'in', ?, ?, ?, ?)`
      ).run(item.id, qty, ref, `Project fabric purchase: ${name}`, rate);

      synced.push({ inventory_item_id: item.id, name: item.name, qty });
    }
    return synced;
  });

  try {
    res.json({ ok: true, synced: sync() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST sync-project-product ─────────────────────────────────────────────────
// Called every time a project product is saved.
// Atomically replaces previous deductions for this product with the new ones.
// This means re-saving never double-counts; removing a fabric row auto-reverses it.
router.post('/sync-project-product', (req, res) => {
  const { project_product_id, items } = req.body;
  if (!project_product_id) return res.status(400).json({ error: 'project_product_id required' });

  const ref = `pp-${project_product_id}`;

  const sync = db.transaction(() => {
    // 1. Find all previous 'out' transactions logged for this project product
    const prev = db.prepare(
      `SELECT item_id, qty FROM inventory_transactions WHERE reference = ? AND type = 'out'`
    ).all(ref);

    // 2. Reverse previous qty_used (add back to available)
    for (const { item_id, qty } of prev) {
      db.prepare(
        `UPDATE inventory_items SET qty_used = MAX(0, qty_used - ?), updated_at = datetime('now') WHERE id = ?`
      ).run(qty, item_id);
    }

    // 3. Delete those old transactions
    db.prepare(`DELETE FROM inventory_transactions WHERE reference = ? AND type = 'out'`).run(ref);

    // 4. Apply fresh deductions for current fabric rows
    const synced = [];
    for (const { inventory_item_id, qty, name } of (items || [])) {
      const useQty = parseFloat(qty) || 0;
      if (useQty <= 0) continue;
      const item = db.prepare(`SELECT id FROM inventory_items WHERE id = ?`).get(inventory_item_id);
      if (!item) continue;

      db.prepare(
        `UPDATE inventory_items SET qty_used = qty_used + ?, updated_at = datetime('now') WHERE id = ?`
      ).run(useQty, inventory_item_id);
      db.prepare(
        `INSERT INTO inventory_transactions (item_id, type, qty, reference, notes) VALUES (?, 'out', ?, ?, ?)`
      ).run(inventory_item_id, useQty, ref, `Project product: ${name}`);

      synced.push({ inventory_item_id, qty: useQty });
    }
    return synced;
  });

  try {
    res.json({ ok: true, synced: sync() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
