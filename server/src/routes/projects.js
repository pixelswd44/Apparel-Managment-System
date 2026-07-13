import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const DEFAULT_STAGES = [
  { key: 'cutting',    name: 'Cutting Hall', enabled: 1, sort_order: 1, tasks: '[]' },
  {
    key: 'decoration', name: 'Decoration',   enabled: 1, sort_order: 2,
    tasks: JSON.stringify([
      { id: 1, label: 'Sublimation',             enabled: false, done: false },
      { id: 2, label: 'Embroidery',              enabled: false, done: false },
      { id: 3, label: 'Screen Print / Stickers', enabled: false, done: false },
    ]),
  },
  { key: 'stitching',  name: 'Stitching',    enabled: 1, sort_order: 3, tasks: '[]' },
  { key: 'press_pack', name: 'Press & Pack', enabled: 1, sort_order: 4, tasks: '[]' },
];

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

function parseProduct(p) {
  return {
    ...p,
    sizes:          JSON.parse(p.sizes          || '[]'),
    costs:          JSON.parse(p.costs          || '[]'),
    external_costs: JSON.parse(p.external_costs || '[]'),
    fabrics:        JSON.parse(p.fabrics        || '[]'),
  };
}

function enrichProject(project) {
  if (!project) return null;
  const products = db.prepare(
    'SELECT * FROM project_products WHERE project_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(project.id).map(parseProduct);

  const stages = db.prepare(
    'SELECT * FROM project_stages WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(project.id);

  const boxes = db.prepare(
    'SELECT * FROM project_boxes WHERE project_id = ? ORDER BY box_number ASC'
  ).all(project.id).map(b => ({ ...b, contents: JSON.parse(b.contents || '[]') }));

  // Vendors with payment sub-entries
  const vendors = db.prepare(`
    SELECT pv.*,
      v.type as vendor_type, v.phone as vendor_phone, v.bank_details as vendor_bank,
      COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE project_vendor_id = pv.id), 0) as total_paid
    FROM project_vendors pv
    LEFT JOIN vendors v ON pv.vendor_id = v.id
    WHERE pv.project_id = ?
    ORDER BY pv.created_at ASC
  `).all(project.id).map(pv => ({
    ...pv,
    tasks:    JSON.parse(pv.tasks || '[]'),
    payments: db.prepare(
      'SELECT * FROM project_vendor_payments WHERE project_vendor_id = ? ORDER BY paid_at DESC'
    ).all(pv.id),
  }));

  // Workers (employees + contract)
  const workers = db.prepare(
    'SELECT pw.*, e.name as employee_name FROM project_workers pw LEFT JOIN employees e ON pw.employee_id = e.id WHERE pw.project_id = ? ORDER BY pw.created_at ASC'
  ).all(project.id);

  const extra_costs = JSON.parse(project.extra_costs || '[]');
  const images      = JSON.parse(project.images      || '[]');
  const shipping    = db.prepare(`
    SELECT ps.*, v.name as vendor_name, v.phone as vendor_phone, v.contact_name as vendor_contact
    FROM project_shipping ps LEFT JOIN vendors v ON v.id = ps.vendor_id
    WHERE ps.project_id = ? ORDER BY ps.shipping_date DESC, ps.id DESC
  `).all(project.id);
  return { ...project, products, stages, boxes, vendors, workers, extra_costs, images, shipping };
}

// ── GET list ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*,
        c.name as client_name, c.company as client_company,
        i.number as invoice_number, i.amount_paid as invoice_amount_paid,
        i.total as invoice_total, i.currency as invoice_currency,
        (SELECT COUNT(*) FROM project_products WHERE project_id = p.id)                    as product_count,
        (SELECT COUNT(*) FROM project_stages  WHERE project_id = p.id AND enabled = 1)     as stages_total,
        (SELECT COUNT(*) FROM project_stages  WHERE project_id = p.id AND enabled = 1 AND status = 'done') as stages_done,
        COALESCE((SELECT SUM(pvp.amount) FROM project_vendor_payments pvp
          JOIN project_vendors pv ON pvp.project_vendor_id = pv.id
          WHERE pv.project_id = p.id), 0) as fin_vendor_paid,
        COALESCE((SELECT SUM(paid_amount) FROM project_workers
          WHERE project_id = p.id AND paid_amount > 0), 0) as fin_worker_paid,
        COALESCE((SELECT SUM(paid_amount) FROM project_shipping
          WHERE project_id = p.id AND paid_amount > 0), 0) as fin_shipping_paid
      FROM projects p
      LEFT JOIN clients  c ON p.client_id  = c.id
      LEFT JOIN invoices i ON p.invoice_id = i.id
      ORDER BY p.updated_at DESC
    `).all();

    // Build currency rate map for PKR conversion
    const currencyRates = {};
    try {
      db.prepare('SELECT code, rate_to_pkr FROM currencies').all().forEach(c => {
        currencyRates[c.code] = parseFloat(c.rate_to_pkr) || 1;
      });
    } catch {}
    const getRateToPKR = code => (!code || code === 'PKR') ? 1 : (currencyRates[code] || 1);

    // Compute per-project financials — mirrors client calcProject() exactly
    const enrichedRows = rows.map(row => {

      // ── Products: fabric rate×qty + process cost×qty + external costs ──
      const products = db.prepare('SELECT fabrics, costs, external_costs, total_quantity, fabric_per_piece, fabric_price_per_unit FROM project_products WHERE project_id = ?').all(row.id);
      let productCost = 0;
      let fabricPaid  = 0;
      for (const pp of products) {
        try {
          const fabrics  = JSON.parse(pp.fabrics        || '[]');
          const costs    = JSON.parse(pp.costs          || '[]');
          const extCosts = JSON.parse(pp.external_costs || '[]');
          const qty      = parseFloat(pp.total_quantity) || 0;
          // Fabric cost: new multi-fabric format OR legacy single-fabric fields
          const fabricCost = fabrics.length > 0
            ? fabrics.reduce((s, f) => s + (parseFloat(f.qty)||0) * (parseFloat(f.rate)||0), 0)
            : (parseFloat(pp.fabric_per_piece)||0) * (parseFloat(pp.fabric_price_per_unit)||0) * qty;
          const procCost = costs.reduce((s, c) => s + (parseFloat(c.cost_per_piece)||0), 0) * qty;
          const extCost  = extCosts.reduce((s, c) => s + (parseFloat(c.total)||0), 0);
          productCost += fabricCost + procCost + extCost;
          fabricPaid  += fabrics.reduce((s, f) => s + (parseFloat(f.amount_paid)||0), 0)
                       + costs.reduce((s, c) => s + (parseFloat(c.amount_paid)||0), 0)
                       + extCosts.reduce((s, c) => s + (parseFloat(c.amount_paid)||0), 0);
        } catch {}
      }

      // ── Vendor billed: tasks total, fallback to invoice_amount ──
      const vendorRows = db.prepare('SELECT tasks, invoice_amount FROM project_vendors WHERE project_id = ?').all(row.id);
      let vendorBilled = 0;
      for (const pv of vendorRows) {
        try {
          const tasks = JSON.parse(pv.tasks || '[]');
          const tasksTotal = tasks.reduce((s, t) =>
            s + (t.type === 'per_piece' ? (parseFloat(t.agreed)||0)*(parseFloat(t.qty)||0) : (parseFloat(t.agreed)||0)), 0);
          vendorBilled += tasksTotal > 0 ? tasksTotal : Number(pv.invoice_amount || 0);
        } catch {}
      }

      // ── Worker agreed ──
      const workerAgreed = db.prepare('SELECT COALESCE(SUM(agreed_amount),0) as total FROM project_workers WHERE project_id = ?').get(row.id).total;

      // ── Shipping total (full billed amount) ──
      const shippingTotal = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM project_shipping WHERE project_id = ?').get(row.id).total;

      // ── Extra costs ──
      let extraCosts = 0;
      try { extraCosts = JSON.parse(row.extra_costs || '[]').reduce((s, c) => s + (parseFloat(c.amount)||0), 0); }
      catch {}

      // ── Received: mirrors calcProject — use exchange_rate_actual if set ──
      const receivedCurrency = row.invoice_id ? (row.invoice_currency || 'USD') : (row.currency || 'PKR');
      const receivedRaw      = row.invoice_id ? (parseFloat(row.invoice_amount_paid)||0) : (parseFloat(row.amount_received)||0);
      const exchangeRate     = (row.exchange_rate_actual && row.exchange_rate_actual > 0)
        ? row.exchange_rate_actual
        : getRateToPKR(receivedCurrency);
      const fin_received     = receivedRaw * exchangeRate;

      const invoiceTotalRaw  = parseFloat(row.invoice_total) || 0;
      const fin_outstanding  = Math.max(0, invoiceTotalRaw * exchangeRate - fin_received);

      // ── Totals ──
      const fin_total_expense = productCost + vendorBilled + workerAgreed + extraCosts + shippingTotal;
      const fin_paid          = fabricPaid + row.fin_vendor_paid + row.fin_worker_paid + row.fin_shipping_paid + extraCosts;
      const fin_net           = fin_received - fin_total_expense;

      return { ...row, fin_received, fin_outstanding, fin_total_expense, fin_paid, fin_net };
    });

    res.json(enrichedRows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET single ────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { title, client_id, invoice_id, currency = 'PKR', amount_received = 0, exchange_rate_actual = 0, notes = '' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Project title is required.' });

    const result = db.prepare(`
      INSERT INTO projects (title, client_id, invoice_id, currency, amount_received, exchange_rate_actual, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'planning')
    `).run(title.trim(), client_id || null, invoice_id || null, currency,
           parseFloat(amount_received) || 0, parseFloat(exchange_rate_actual) || 0, notes || '');

    const pid = result.lastInsertRowid;

    const insertStage = db.prepare(
      'INSERT INTO project_stages (project_id, stage_key, stage_name, enabled, status, sort_order, tasks) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const s of DEFAULT_STAGES) {
      insertStage.run(pid, s.key, s.name, s.enabled, 'pending', s.sort_order, s.tasks || '[]');
    }

    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(pid);
    res.status(201).json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT update ────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { title, client_id, invoice_id, currency, amount_received, exchange_rate_actual = 0, status, notes, images } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Project title is required.' });
    const imagesStr = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : '[]';
    const newStatus = status || 'planning';

    // completed_at tracks when status actually became 'completed' — separate from
    // updated_at, which changes on every edit. Set it the moment status first
    // becomes 'completed'; clear it if the project is moved off 'completed'.
    const existing = db.prepare('SELECT status, completed_at FROM projects WHERE id = ?').get(req.params.id);
    let completedAt = existing?.completed_at ?? null;
    // Match SQLite's own datetime('now') format ("YYYY-MM-DD HH:MM:SS") so every
    // timestamp column in this table stays consistent.
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

    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Images (tech-packs / reference photos) ────────────────────────────────────
router.put('/:id/images', (req, res) => {
  try {
    const images = req.body.images || [];
    const imagesStr = typeof images === 'string' ? images : JSON.stringify(images);
    db.prepare("UPDATE projects SET images=?, updated_at=datetime('now') WHERE id=?")
      .run(imagesStr, req.params.id);
    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Extra Costs ───────────────────────────────────────────────────────────────

// POST /projects/:id/extra-costs  — add a new extra cost entry
router.post('/:id/extra-costs', (req, res) => {
  try {
    const row = db.prepare('SELECT extra_costs FROM projects WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const list = JSON.parse(row.extra_costs || '[]');
    const entry = {
      id:         Date.now(),
      cost_type:  req.body.cost_type === 'per_piece' ? 'per_piece' : 'fixed',
      label:      (req.body.label || '').trim() || 'Extra Cost',
      amount:     parseFloat(req.body.amount)    || 0,
      rate:       parseFloat(req.body.rate)      || 0,
      applies_to: req.body.applies_to            || 'all',
      date:       req.body.date || new Date().toISOString().slice(0, 10),
      notes:      req.body.notes || '',
    };
    list.push(entry);
    db.prepare('UPDATE projects SET extra_costs = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(JSON.stringify(list), req.params.id);
    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(req.params.id);
    res.status(201).json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /projects/:id/extra-costs/:ecId  — update an entry
router.put('/:id/extra-costs/:ecId', (req, res) => {
  try {
    const row = db.prepare('SELECT extra_costs FROM projects WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const ecId = Number(req.params.ecId);
    const list = JSON.parse(row.extra_costs || '[]').map(e =>
      e.id === ecId
        ? { ...e,
            cost_type:  req.body.cost_type  !== undefined ? (req.body.cost_type === 'per_piece' ? 'per_piece' : 'fixed') : e.cost_type,
            label:      (req.body.label || e.label).trim(),
            amount:     parseFloat(req.body.amount)    || e.amount,
            rate:       parseFloat(req.body.rate)      || e.rate || 0,
            applies_to: req.body.applies_to            || e.applies_to || 'all',
            date:       req.body.date  || e.date,
            notes:      req.body.notes ?? e.notes,
          }
        : e
    );
    db.prepare('UPDATE projects SET extra_costs = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(JSON.stringify(list), req.params.id);
    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(req.params.id);
    res.json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /projects/:id/extra-costs/:ecId  — remove an entry
router.delete('/:id/extra-costs/:ecId', (req, res) => {
  try {
    const row = db.prepare('SELECT extra_costs FROM projects WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const ecId = Number(req.params.ecId);
    const list = JSON.parse(row.extra_costs || '[]').filter(e => e.id !== ecId);
    db.prepare('UPDATE projects SET extra_costs = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(JSON.stringify(list), req.params.id);
    const project = db.prepare(`${PROJECT_WITH_CLIENT} WHERE p.id = ?`).get(req.params.id);
    res.json(enrichProject(project));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Products ──────────────────────────────────────────────────────────

function ppBody(body) {
  const {
    product_id, product_name, unit = 'pcs', sizes = '[]', total_quantity = 0,
    fabric_material = '', fabric_unit = 'yards',
    fabric_total_purchased = 0, fabric_per_piece = 0, fabric_price_per_unit = 0,
    fabric_amount_paid = 0,
    fabrics = '[]',
    costs = '[]', external_costs = '[]', notes = '', sort_order = 0,
  } = body;
  return {
    product_id:             product_id || null,
    product_name:           (product_name || '').trim(),
    unit,
    sizes:                  typeof sizes          === 'string' ? sizes          : JSON.stringify(sizes),
    total_quantity:         parseFloat(total_quantity)         || 0,
    fabric_material:        fabric_material || '',
    fabric_unit:            fabric_unit || 'yards',
    fabric_total_purchased: parseFloat(fabric_total_purchased) || 0,
    fabric_per_piece:       parseFloat(fabric_per_piece)       || 0,
    fabric_price_per_unit:  parseFloat(fabric_price_per_unit)  || 0,
    fabric_amount_paid:     parseFloat(fabric_amount_paid)     || 0,
    fabrics:                typeof fabrics        === 'string' ? fabrics        : JSON.stringify(fabrics),
    costs:                  typeof costs          === 'string' ? costs          : JSON.stringify(costs),
    external_costs:         typeof external_costs === 'string' ? external_costs : JSON.stringify(external_costs),
    notes:                  notes || '',
    sort_order:             parseInt(sort_order) || 0,
  };
}

router.post('/:id/products', (req, res) => {
  try {
    const b = ppBody(req.body);
    if (!b.product_name) return res.status(400).json({ error: 'Product name is required.' });
    const result = db.prepare(`
      INSERT INTO project_products
        (project_id, product_id, product_name, unit, sizes, total_quantity,
         fabric_material, fabric_unit, fabric_total_purchased, fabric_per_piece, fabric_price_per_unit,
         fabric_amount_paid, fabrics, costs, external_costs, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, b.product_id, b.product_name, b.unit, b.sizes, b.total_quantity,
           b.fabric_material, b.fabric_unit, b.fabric_total_purchased, b.fabric_per_piece, b.fabric_price_per_unit,
           b.fabric_amount_paid, b.fabrics, b.costs, b.external_costs, b.notes, b.sort_order);
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
      SET product_id=?, product_name=?, unit=?, sizes=?, total_quantity=?,
          fabric_material=?, fabric_unit=?, fabric_total_purchased=?, fabric_per_piece=?, fabric_price_per_unit=?,
          fabric_amount_paid=?, fabrics=?, costs=?, external_costs=?, notes=?, sort_order=?
      WHERE id=? AND project_id=?
    `).run(b.product_id, b.product_name, b.unit, b.sizes, b.total_quantity,
           b.fabric_material, b.fabric_unit, b.fabric_total_purchased, b.fabric_per_piece, b.fabric_price_per_unit,
           b.fabric_amount_paid, b.fabrics, b.costs, b.external_costs, b.notes, b.sort_order,
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

// ── Project Stages ────────────────────────────────────────────────────────────

router.put('/:id/stages/:stageId', (req, res) => {
  try {
    const { enabled, status, notes, tasks } = req.body;
    const stage = db.prepare('SELECT * FROM project_stages WHERE id=? AND project_id=?').get(req.params.stageId, req.params.id);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const newStatus      = status  !== undefined ? status  : stage.status;
    const newEnabled     = enabled !== undefined ? (enabled ? 1 : 0) : stage.enabled;
    const newNotes       = notes   !== undefined ? notes   : stage.notes;
    const newTasks       = tasks   !== undefined ? (typeof tasks === 'string' ? tasks : JSON.stringify(tasks)) : (stage.tasks || '[]');
    const newStartedAt   = newStatus === 'in_progress' && !stage.started_at   ? now : stage.started_at;
    const newCompletedAt = newStatus === 'done'        && !stage.completed_at ? now : (newStatus !== 'done' ? null : stage.completed_at);

    db.prepare(`
      UPDATE project_stages
      SET enabled=?, status=?, notes=?, tasks=?, started_at=?, completed_at=?
      WHERE id=? AND project_id=?
    `).run(newEnabled, newStatus, newNotes, newTasks, newStartedAt, newCompletedAt,
           req.params.stageId, req.params.id);

    // Auto-derive project status from enabled stages
    const stages = db.prepare(
      'SELECT * FROM project_stages WHERE project_id=? AND enabled=1 ORDER BY sort_order ASC'
    ).all(req.params.id);

    let projectStatus = 'planning';
    const stageId = parseInt(req.params.stageId);
    if (stages.length > 0) {
      const effectiveStatus = s => (s.id === stageId ? newStatus : s.status);
      if (stages.every(s => effectiveStatus(s) === 'done')) {
        projectStatus = 'completed';
      } else {
        const active = [...stages].reverse().find(s =>
          effectiveStatus(s) === 'in_progress' || effectiveStatus(s) === 'done'
        );
        if (active) {
          // Map stage keys to friendly project status labels
          const keyMap = {
            cutting: 'cutting', decoration: 'decoration',
            stitching: 'stitching', press_pack: 'press_pack',
            // legacy keys for old projects
            sublimation: 'sublimation', embroidery: 'embroidery', screen_print: 'screen_print',
          };
          projectStatus = keyMap[active.stage_key] ?? active.stage_key;
        }
      }
    }
    db.prepare("UPDATE projects SET status=?, updated_at=datetime('now') WHERE id=?").run(projectStatus, req.params.id);

    res.json(db.prepare('SELECT * FROM project_stages WHERE id=?').get(req.params.stageId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Boxes ─────────────────────────────────────────────────────────────

router.post('/:id/boxes', (req, res) => {
  try {
    const { contents = '[]', notes = '' } = req.body;
    const contentsStr = typeof contents === 'string' ? contents : JSON.stringify(contents);
    const last = db.prepare('SELECT MAX(box_number) as n FROM project_boxes WHERE project_id=?').get(req.params.id);
    const boxNumber = (last?.n ?? 0) + 1;
    const result = db.prepare(
      'INSERT INTO project_boxes (project_id, box_number, contents, notes) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, boxNumber, contentsStr, notes);
    const box = db.prepare('SELECT * FROM project_boxes WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ ...box, contents: JSON.parse(box.contents || '[]') });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/boxes/:boxId', (req, res) => {
  try {
    const { contents = '[]', notes = '' } = req.body;
    const contentsStr = typeof contents === 'string' ? contents : JSON.stringify(contents);
    db.prepare('UPDATE project_boxes SET contents=?, notes=? WHERE id=? AND project_id=?').run(
      contentsStr, notes, req.params.boxId, req.params.id
    );
    const box = db.prepare('SELECT * FROM project_boxes WHERE id=?').get(req.params.boxId);
    if (!box) return res.status(404).json({ error: 'Not found' });
    res.json({ ...box, contents: JSON.parse(box.contents || '[]') });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle shipped status
router.put('/:id/boxes/:boxId/ship', (req, res) => {
  try {
    const box = db.prepare('SELECT * FROM project_boxes WHERE id=? AND project_id=?').get(req.params.boxId, req.params.id);
    if (!box) return res.status(404).json({ error: 'Not found' });
    const newShipped = box.shipped ? 0 : 1;
    db.prepare('UPDATE project_boxes SET shipped=? WHERE id=?').run(newShipped, req.params.boxId);
    res.json({ ...box, shipped: newShipped, contents: JSON.parse(box.contents || '[]') });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/boxes/:boxId', (req, res) => {
  try {
    const { force_note = '' } = req.body || {};
    const box = db.prepare('SELECT * FROM project_boxes WHERE id=? AND project_id=?').get(req.params.boxId, req.params.id);
    if (!box) return res.status(404).json({ error: 'Not found' });
    // Allow deletion even if shipped, but record the note
    if (box.shipped && !force_note?.trim()) {
      return res.status(409).json({ error: 'This box has been shipped. Provide a reason to delete it.', shipped: true });
    }
    db.prepare('DELETE FROM project_boxes WHERE id=? AND project_id=?').run(req.params.boxId, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Shipping ──────────────────────────────────────────────────────────

router.get('/:id/shipping', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ps.*, v.name as vendor_name, v.phone as vendor_phone, v.contact_name as vendor_contact
      FROM project_shipping ps
      LEFT JOIN vendors v ON v.id = ps.vendor_id
      WHERE ps.project_id=? ORDER BY ps.shipping_date DESC, ps.id DESC
    `).all(req.params.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/shipping', (req, res) => {
  try {
    const { carrier='', tracking_number='', shipping_date='', amount=0, paid=0, paid_amount=0, notes='', vendor_id=null } = req.body;
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const paidAmt  = parseFloat(paid_amount) || 0;
    const vendorId = vendor_id ? parseInt(vendor_id) : null;

    const result = db.prepare(`
      INSERT INTO project_shipping (project_id, carrier, tracking_number, shipping_date, amount, paid, paid_amount, notes, vendor_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(req.params.id, carrier, tracking_number, shipping_date, parseFloat(amount)||0, paid?1:0, paidAmt, notes, vendorId);

    const row = db.prepare(`
      SELECT ps.*, v.name as vendor_name, v.phone as vendor_phone
      FROM project_shipping ps LEFT JOIN vendors v ON v.id = ps.vendor_id WHERE ps.id=?
    `).get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/shipping/:shipId', (req, res) => {
  try {
    const { carrier='', tracking_number='', shipping_date='', amount=0, notes='', vendor_id=null } = req.body;
    const row = db.prepare('SELECT * FROM project_shipping WHERE id=? AND project_id=?').get(req.params.shipId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const vendorId = vendor_id ? parseInt(vendor_id) : null;
    // Never overwrite paid_amount / paid from the form — payments are recorded via the vendor module
    const paidAmt = row.paid_amount || 0;
    const isPaid  = row.paid || 0;

    db.prepare(`
      UPDATE project_shipping SET carrier=?, tracking_number=?, shipping_date=?, amount=?, paid=?, paid_amount=?, notes=?, vendor_id=?
      WHERE id=? AND project_id=?
    `).run(carrier, tracking_number, shipping_date, parseFloat(amount)||0, isPaid, paidAmt, notes, vendorId, req.params.shipId, req.params.id);

    const updated = db.prepare(`
      SELECT ps.*, v.name as vendor_name, v.phone as vendor_phone
      FROM project_shipping ps LEFT JOIN vendors v ON v.id = ps.vendor_id WHERE ps.id=?
    `).get(req.params.shipId);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/shipping/:shipId', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM project_shipping WHERE id=? AND project_id=?').get(req.params.shipId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM project_shipping WHERE id=?').run(row.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Vendors ───────────────────────────────────────────────────────────

// Per-piece task total helper (mirrors frontend taskAmt)
function taskAmt(t) {
  if (t.type === 'per_piece') return (parseFloat(t.agreed) || 0) * (parseFloat(t.qty) || 0);
  return parseFloat(t.agreed) || 0;
}

router.post('/:id/vendors', (req, res) => {
  try {
    let { vendor_id, vendor_name, service_description = '', invoice_amount = 0, currency = 'PKR', notes = '', tasks = [] } = req.body;
    if (!vendor_name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });

    // Auto-register in global vendors catalog if no vendor_id is provided
    if (!vendor_id) {
      const existing = db.prepare("SELECT id FROM vendors WHERE LOWER(name) = LOWER(?)").get(vendor_name.trim());
      if (existing) {
        vendor_id = existing.id;
      } else {
        const vRes = db.prepare(
          "INSERT INTO vendors (name, type, status) VALUES (?, 'process', 'active')"
        ).run(vendor_name.trim());
        vendor_id = vRes.lastInsertRowid;
      }
    }

    const tasksJson = typeof tasks === 'string' ? tasks : JSON.stringify(tasks);
    const parsedTasks = typeof tasks === 'string' ? JSON.parse(tasks) : tasks;
    // Use the invoice_amount already computed by the frontend (tasksTotal); recalculate as fallback
    const autoAmount = parseFloat(invoice_amount) > 0
      ? parseFloat(invoice_amount)
      : parsedTasks.length > 0
        ? parsedTasks.reduce((s, t) => s + taskAmt(t), 0)
        : 0;
    const result = db.prepare(`
      INSERT INTO project_vendors (project_id, vendor_id, vendor_name, service_description, invoice_amount, currency, notes, tasks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, vendor_id || null, vendor_name.trim(), service_description, autoAmount, currency, notes, tasksJson);
    const pv = db.prepare(`
      SELECT pv.*, v.type as vendor_type, v.phone as vendor_phone, v.bank_details as vendor_bank,
        0 as total_paid
      FROM project_vendors pv
      LEFT JOIN vendors v ON pv.vendor_id = v.id
      WHERE pv.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ ...pv, tasks: parsedTasks, payments: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/vendors/:pvId', (req, res) => {
  try {
    let { vendor_id, vendor_name, service_description = '', invoice_amount = 0, currency = 'PKR', notes = '', tasks = [] } = req.body;
    if (!vendor_name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });

    // Auto-register in global vendors catalog if no vendor_id provided
    if (!vendor_id) {
      const existing = db.prepare("SELECT id FROM vendors WHERE LOWER(name) = LOWER(?)").get(vendor_name.trim());
      if (existing) {
        vendor_id = existing.id;
      } else {
        const vRes = db.prepare(
          "INSERT INTO vendors (name, type, status) VALUES (?, 'process', 'active')"
        ).run(vendor_name.trim());
        vendor_id = vRes.lastInsertRowid;
      }
    }

    const tasksJson   = typeof tasks === 'string' ? tasks : JSON.stringify(tasks);
    const parsedTasks = typeof tasks === 'string' ? JSON.parse(tasks) : tasks;
    const autoAmount = parseFloat(invoice_amount) > 0
      ? parseFloat(invoice_amount)
      : parsedTasks.length > 0
        ? parsedTasks.reduce((s, t) => s + taskAmt(t), 0)
        : 0;
    db.prepare(`
      UPDATE project_vendors SET vendor_id=?, vendor_name=?, service_description=?, invoice_amount=?, currency=?, notes=?, tasks=?
      WHERE id=? AND project_id=?
    `).run(vendor_id || null, vendor_name.trim(), service_description, autoAmount, currency, notes, tasksJson,
           req.params.pvId, req.params.id);
    const pv = db.prepare(`
      SELECT pv.*,
        v.type as vendor_type, v.phone as vendor_phone, v.bank_details as vendor_bank,
        COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE project_vendor_id = pv.id), 0) as total_paid
      FROM project_vendors pv LEFT JOIN vendors v ON pv.vendor_id = v.id
      WHERE pv.id = ?
    `).get(req.params.pvId);
    if (!pv) return res.status(404).json({ error: 'Not found' });
    const payments = db.prepare('SELECT * FROM project_vendor_payments WHERE project_vendor_id = ? ORDER BY paid_at DESC').all(pv.id);
    res.json({ ...pv, tasks: parsedTasks, payments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/vendors/:pvId', (req, res) => {
  try {
    db.prepare('DELETE FROM project_vendors WHERE id=? AND project_id=?').run(req.params.pvId, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/vendors/:pvId/payments', (req, res) => {
  try {
    const { amount, method = 'cash', reference = '', notes = '', paid_at, receipt_url = '' } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Valid amount is required.' });
    const paidDate = paid_at || new Date().toISOString().slice(0, 10);
    const result = db.prepare(`
      INSERT INTO project_vendor_payments (project_vendor_id, project_id, amount, method, reference, notes, paid_at, receipt_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.pvId, req.params.id, parseFloat(amount), method, reference, notes, paidDate, receipt_url);
    res.status(201).json(db.prepare('SELECT * FROM project_vendor_payments WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/vendors/:pvId/payments/:payId', (req, res) => {
  try {
    db.prepare('DELETE FROM project_vendor_payments WHERE id=? AND project_vendor_id=?').run(req.params.payId, req.params.pvId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Project Workers ───────────────────────────────────────────────────────────

router.post('/:id/workers', (req, res) => {
  try {
    const { worker_type = 'contract', employee_id, worker_name, worker_phone = '', task_description = '', agreed_amount = 0, paid_amount = 0, notes = '' } = req.body;
    if (!worker_name?.trim()) return res.status(400).json({ error: 'Worker name is required.' });
    const result = db.prepare(`
      INSERT INTO project_workers (project_id, worker_type, employee_id, worker_name, worker_phone, task_description, agreed_amount, paid_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, worker_type, employee_id || null, worker_name.trim(), worker_phone, task_description,
           parseFloat(agreed_amount) || 0, parseFloat(paid_amount) || 0, notes);
    const pw = db.prepare('SELECT pw.*, e.name as employee_name FROM project_workers pw LEFT JOIN employees e ON pw.employee_id = e.id WHERE pw.id = ?').get(result.lastInsertRowid);
    res.status(201).json(pw);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/workers/:wId', (req, res) => {
  try {
    const { worker_type = 'contract', employee_id, worker_name, worker_phone = '', task_description = '', agreed_amount = 0, paid_amount = 0, notes = '' } = req.body;
    if (!worker_name?.trim()) return res.status(400).json({ error: 'Worker name is required.' });
    db.prepare(`
      UPDATE project_workers SET worker_type=?, employee_id=?, worker_name=?, worker_phone=?, task_description=?, agreed_amount=?, paid_amount=?, notes=?
      WHERE id=? AND project_id=?
    `).run(worker_type, employee_id || null, worker_name.trim(), worker_phone, task_description,
           parseFloat(agreed_amount) || 0, parseFloat(paid_amount) || 0, notes,
           req.params.wId, req.params.id);
    const pw = db.prepare('SELECT pw.*, e.name as employee_name FROM project_workers pw LEFT JOIN employees e ON pw.employee_id = e.id WHERE pw.id = ?').get(req.params.wId);
    if (!pw) return res.status(404).json({ error: 'Not found' });
    res.json(pw);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/workers/:wId', (req, res) => {
  try {
    db.prepare('DELETE FROM project_workers WHERE id=? AND project_id=?').run(req.params.wId, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
