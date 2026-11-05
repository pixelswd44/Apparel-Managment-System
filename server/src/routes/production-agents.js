import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// People paid per project for one production job — embroidery, sublimation,
// cutting & threads, belts. A payment to one is an ordinary expense (charged to
// a project) with agent_id set; the agent's name is also kept in paid_to so the
// expense still reads correctly if the agent is later deleted.

// kind → the expense Type label it pairs with (must match EXPENSE_PRESETS on the client)
export const KINDS = {
  embroidery:  'Embroidery',
  sublimation: 'Sublimation',
  cutting:     'Cutting & Threads',
  belts:       'Belts',
};

const FIELDS = ['name', 'phone', 'city', 'notes'];

function body(req) {
  const b = {};
  for (const f of FIELDS) b[f] = String(req.body[f] ?? '').trim();
  return b;
}

const duplicate = (kind, name, exceptId = 0) =>
  db.prepare('SELECT id FROM production_agents WHERE kind = ? AND LOWER(TRIM(name)) = LOWER(?) AND id != ?').get(kind, name, exceptId);

// Payments of one kind: expenses linked to an agent of that kind, plus older
// expenses of that type saved before agents existed (they show with no agent).
const PAYMENTS = `
  SELECT e.id, e.title, e.amount, e.expense_date, e.payment_method, e.notes, e.project_id, e.agent_id,
         COALESCE(a.name, NULLIF(e.paid_to, '')) as agent_name,
         p.title as project_title, c.name as client_name
  FROM expenses e
  LEFT JOIN production_agents a ON a.id = e.agent_id
  LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN clients  c ON c.id = p.client_id
`;

// ── GET agents of a kind (with what was paid to each) ────────────────────────
router.get('/', (req, res) => {
  try {
    const { kind } = req.query;
    res.json(db.prepare(`
      SELECT pa.*,
        (SELECT COUNT(*) FROM expenses e WHERE e.agent_id = pa.id) as payment_count,
        (SELECT COUNT(DISTINCT e.project_id) FROM expenses e WHERE e.agent_id = pa.id AND e.project_id IS NOT NULL) as project_count,
        (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.agent_id = pa.id) as total_paid,
        (SELECT MAX(e.expense_date) FROM expenses e WHERE e.agent_id = pa.id) as last_paid
      FROM production_agents pa
      ${KINDS[kind] ? 'WHERE pa.kind = ?' : ''}
      ORDER BY pa.name COLLATE NOCASE ASC
    `).all(...(KINDS[kind] ? [kind] : [])));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET payments of a kind. Optional ?from=&to=. Must stay above '/:id'. ─────
router.get('/payments', (req, res) => {
  try {
    const { kind, from, to } = req.query;
    if (!KINDS[kind]) return res.status(400).json({ error: 'Unknown kind.' });
    const params = [kind, KINDS[kind]];
    let sql = `${PAYMENTS} WHERE (a.kind = ? OR (e.agent_id IS NULL AND LOWER(TRIM(e.title)) = LOWER(?)))`;
    if (from) { sql += ' AND e.expense_date >= ?'; params.push(from); }
    if (to)   { sql += ' AND e.expense_date <= ?'; params.push(to); }
    res.json(db.prepare(`${sql} ORDER BY e.expense_date DESC, e.id DESC`).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET profile with its payments ────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM production_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    const payments = db.prepare(`${PAYMENTS} WHERE e.agent_id = ? ORDER BY e.expense_date DESC, e.id DESC`).all(agent.id);
    res.json({ ...agent, payments, total_paid: payments.reduce((t, p) => t + (p.amount || 0), 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const kind = req.body.kind;
    if (!KINDS[kind]) return res.status(400).json({ error: 'Unknown kind.' });
    const b = body(req);
    if (!b.name) return res.status(400).json({ error: 'Name is required.' });
    if (duplicate(kind, b.name)) return res.status(409).json({ error: `${b.name} is already on the ${KINDS[kind]} list.` });
    const r = db.prepare(`INSERT INTO production_agents (kind, ${FIELDS.join(', ')}) VALUES (?, ${FIELDS.map(() => '?').join(', ')})`)
      .run(kind, ...FIELDS.map(f => b[f]));
    res.status(201).json(db.prepare('SELECT * FROM production_agents WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update (a rename also updates the name on its payments) ──────────────
router.put('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM production_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    const b = body(req);
    if (!b.name) return res.status(400).json({ error: 'Name is required.' });
    if (duplicate(agent.kind, b.name, agent.id)) return res.status(409).json({ error: `${b.name} is already on the ${KINDS[agent.kind]} list.` });
    db.transaction(() => {
      db.prepare(`UPDATE production_agents SET ${FIELDS.map(f => `${f}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`)
        .run(...FIELDS.map(f => b[f]), agent.id);
      db.prepare('UPDATE expenses SET paid_to = ? WHERE agent_id = ?').run(b.name, agent.id);
    })();
    res.json(db.prepare('SELECT * FROM production_agents WHERE id = ?').get(agent.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE — past payments stay, keeping the name in paid_to ──────────────────
router.delete('/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT id FROM production_agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    db.transaction(() => {
      db.prepare('UPDATE expenses SET agent_id = NULL WHERE agent_id = ?').run(agent.id);
      db.prepare('DELETE FROM production_agents WHERE id = ?').run(agent.id);
    })();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
