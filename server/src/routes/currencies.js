import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/currencies
router.get('/', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM currencies ORDER BY is_default DESC, code ASC').all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/currencies
router.post('/', (req, res) => {
  try {
    const { code, name, symbol, rate_to_pkr } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
    const rPkr = parseFloat(rate_to_pkr) || 1;

    // Derive rate_to_usd from USD's rate_to_pkr for backward compat
    const usdRow = db.prepare("SELECT rate_to_pkr FROM currencies WHERE code = 'USD'").get();
    const usdPkr = usdRow ? (parseFloat(usdRow.rate_to_pkr) || 280) : 280;
    const rUsd   = rPkr / usdPkr;

    const result = db.prepare(
      'INSERT INTO currencies (code, name, symbol, rate_to_usd, rate_to_pkr) VALUES (?, ?, ?, ?, ?)'
    ).run(code.toUpperCase().trim(), name.trim(), (symbol || '').trim(), rUsd, rPkr);

    res.status(201).json(db.prepare('SELECT * FROM currencies WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Currency code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/currencies/:id
router.put('/:id', (req, res) => {
  try {
    const { code, name, symbol, rate_to_pkr } = req.body;
    const rPkr = parseFloat(rate_to_pkr);
    if (!rPkr || rPkr <= 0) return res.status(400).json({ error: 'Valid rate_to_pkr is required' });

    const usdRow = db.prepare("SELECT rate_to_pkr FROM currencies WHERE code = 'USD'").get();
    const usdPkr = usdRow ? (parseFloat(usdRow.rate_to_pkr) || 280) : 280;
    const rUsd   = rPkr / usdPkr;

    db.prepare(
      'UPDATE currencies SET code = ?, name = ?, symbol = ?, rate_to_usd = ?, rate_to_pkr = ? WHERE id = ?'
    ).run(code.toUpperCase().trim(), name.trim(), (symbol || '').trim(), rUsd, rPkr, req.params.id);

    const row = db.prepare('SELECT * FROM currencies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Currency code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/currencies/:id/set-default
router.put('/:id/set-default', (req, res) => {
  try {
    db.prepare('UPDATE currencies SET is_default = 0').run();
    db.prepare('UPDATE currencies SET is_default = 1 WHERE id = ?').run(req.params.id);
    res.json(db.prepare('SELECT * FROM currencies WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/currencies/:id
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM currencies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.is_default) return res.status(400).json({ error: 'Cannot delete the default currency' });
    if (row.code === 'PKR') return res.status(400).json({ error: 'PKR is the base currency and cannot be deleted' });
    db.prepare('DELETE FROM currencies WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
