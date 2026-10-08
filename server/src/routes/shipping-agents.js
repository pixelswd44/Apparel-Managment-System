import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Shipping agency profiles. A project shipment (project_shipping) links to an
// agent; the agent's name is also kept on the shipment so its history still
// reads correctly if the agent is later deleted.

const FIELDS = ['name', 'contact_name', 'phone', 'email', 'address', 'city', 'country', 'notes'];

function body(req) {
  const b = {};
  for (const f of FIELDS) b[f] = String(req.body[f] ?? '').trim();
  return b;
}

const duplicate = (name, exceptId = 0) =>
  db.prepare('SELECT id FROM shipping_agents WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ?').get(name, exceptId);

// ── GET list (with how many shipments each agent handled) ────────────────────
router.get('/', (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT sa.*,
        (SELECT COUNT(*) FROM project_shipping ps WHERE ps.agent_id = sa.id) as shipment_count,
        (SELECT MAX(ps.shipping_date) FROM project_shipping ps WHERE ps.agent_id = sa.id) as last_shipped,
        (SELECT COALESCE(SUM(sc.amount), 0) FROM shipping_costs sc JOIN project_shipping ps ON ps.id = sc.shipment_id
           WHERE ps.agent_id = sa.id) as total_cost
      FROM shipping_agents sa
      ORDER BY sa.name COLLATE NOCASE ASC
    `).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET profile with its shipments ───────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM shipping_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    const shipments = db.prepare(`
      SELECT ps.id, ps.project_id, ps.tracking_number, ps.shipping_date, ps.notes,
             p.title as project_title, c.name as client_name,
             COALESCE((SELECT SUM(amount) FROM shipping_costs WHERE shipment_id = ps.id), 0) as cost_total
      FROM project_shipping ps
      LEFT JOIN projects p ON p.id = ps.project_id
      LEFT JOIN clients  c ON c.id = p.client_id
      WHERE ps.agent_id = ?
      ORDER BY ps.shipping_date DESC, ps.id DESC
    `).all(agent.id);
    res.json({ ...agent, shipments, total_cost: shipments.reduce((t, s) => t + (s.cost_total || 0), 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const b = body(req);
    if (!b.name) return res.status(400).json({ error: 'Agency name is required.' });
    if (duplicate(b.name)) return res.status(409).json({ error: 'A shipping agent with this name already exists.' });
    const r = db.prepare(`INSERT INTO shipping_agents (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`)
      .run(...FIELDS.map(f => b[f]));
    res.status(201).json(db.prepare('SELECT * FROM shipping_agents WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update (a rename also updates the name shown on its shipments) ────────
router.put('/:id', (req, res) => {
  try {
    const b = body(req);
    if (!b.name) return res.status(400).json({ error: 'Agency name is required.' });
    if (duplicate(b.name, req.params.id)) return res.status(409).json({ error: 'A shipping agent with this name already exists.' });
    db.transaction(() => {
      const r = db.prepare(`UPDATE shipping_agents SET ${FIELDS.map(f => `${f}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`)
        .run(...FIELDS.map(f => b[f]), req.params.id);
      if (!r.changes) throw Object.assign(new Error('Not found'), { status: 404 });
      db.prepare('UPDATE project_shipping SET carrier = ? WHERE agent_id = ?').run(b.name, req.params.id);
    })();
    res.json(db.prepare('SELECT * FROM shipping_agents WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── DELETE — past shipments keep the agent's name as plain text ──────────────
router.delete('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT id FROM shipping_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    db.transaction(() => {
      db.prepare('UPDATE project_shipping SET agent_id = NULL WHERE agent_id = ?').run(agent.id);
      db.prepare('DELETE FROM shipping_agents WHERE id = ?').run(agent.id);
    })();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
