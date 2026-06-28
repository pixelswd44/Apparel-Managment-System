import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import db from '../db/index.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Tables in dependency-safe insertion order (parents before children).
// IMPORTANT: keep project_shipping BEFORE project_vendor_payments — pvp has a FK → shipping.
const TABLES_ORDERED = [
  // ── Config / lookup tables ──────────────────────────────────────────────
  'settings',
  'currencies',
  'users',
  'companies',
  'categories',
  'expense_categories',
  'cost_breakdown_items',
  'document_templates',
  'calculator_templates',
  // ── People ──────────────────────────────────────────────────────────────
  'employees',
  'clients',
  'vendors',
  // ── Products & inventory ────────────────────────────────────────────────
  'products',
  'product_prices',
  'product_sales',
  'inventory_items',
  'inventory',                   // legacy table — kept for compat
  'inventory_transactions',
  // ── Quotations & invoices ────────────────────────────────────────────────
  'quotation_templates',
  'quotations',
  'invoices',
  'payments',
  'purchases',
  // ── Projects (strict FK order) ───────────────────────────────────────────
  'projects',
  'project_products',
  'project_stages',
  'project_boxes',
  'project_vendors',
  'project_shipping',            // ← must be before project_vendor_payments
  'project_vendor_payments',
  'project_workers',
  // ── Finance / HR ────────────────────────────────────────────────────────
  'expenses',
  'payroll_records',
  'employee_advances',
  'capital_investments',
  'capital_loans',
  'loan_repayments',
  // ── Other ───────────────────────────────────────────────────────────────
  'reminders',
];

// ─── GET /api/backup/export ───────────────────────────────────────────────────
router.get('/export', (req, res) => {
  try {
    // Optional filters: ?tables=clients,invoices&files=0
    const tableFilter = req.query.tables
      ? new Set(req.query.tables.split(',').map(t => t.trim()).filter(Boolean))
      : null; // null = all tables
    const includeFiles = req.query.files !== '0';

    // 1. Snapshot selected tables
    const tablesToExport = tableFilter
      ? TABLES_ORDERED.filter(t => tableFilter.has(t))
      : TABLES_ORDERED;

    const tables = {};
    const tableMeta = {};
    for (const name of tablesToExport) {
      try {
        const rows = db.prepare(`SELECT * FROM ${name}`).all();
        tables[name]    = rows;
        tableMeta[name] = rows.length;
      } catch {
        tables[name]    = [];
        tableMeta[name] = 0;
      }
    }

    // 2. Read every file under uploads/ and base64-encode it
    const files = {};
    if (includeFiles && fs.existsSync(UPLOADS_DIR)) {
      for (const fname of fs.readdirSync(UPLOADS_DIR)) {
        if (fname.startsWith('.')) continue;
        const fullPath = path.join(UPLOADS_DIR, fname);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          files[fname] = {
            data: fs.readFileSync(fullPath).toString('base64'),
            size: stat.size,
          };
        } catch { /* unreadable — skip */ }
      }
    }

    // 3. Build backup envelope
    const totalRows = Object.values(tableMeta).reduce((s, n) => s + n, 0);
    const backup = {
      app:         'apparel-crm',
      version:     2,
      exported_at: new Date().toISOString(),
      row_count:   totalRows,
      table_meta:  tableMeta,
      file_count:  Object.keys(files).length,
      tables,
      files,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    const compressed = zlib.gzipSync(JSON.stringify(backup));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Encoding', 'identity'); // prevent Express from double-decompressing
    res.setHeader('Content-Disposition', `attachment; filename="apparel-crm-backup-${stamp}.json.gz"`);
    res.send(compressed);
  } catch (err) {
    console.error('[backup/export]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/backup/import ──────────────────────────────────────────────────
router.post('/import', (req, res) => {
  try {
    const backup = req.body;

    // ── Validation ────────────────────────────────────────────────────────
    if (!backup || backup.app !== 'apparel-crm') {
      return res.status(400).json({ error: 'Not a valid Apparel CRM backup file.' });
    }
    if (!backup.tables || typeof backup.tables !== 'object') {
      return res.status(400).json({ error: 'Backup is missing table data.' });
    }

    const stats     = { tables: {}, files: 0, errors: [] };
    const startedAt = Date.now();

    // ── Wipe + insert ─────────────────────────────────────────────────────
    // SQLite restriction: foreign_keys pragma is ignored inside a transaction,
    // so we set it BEFORE calling db.transaction().
    db.pragma('foreign_keys = OFF');

    const restore = db.transaction(() => {
      // Fast path: use the underlying sql.js Database directly so we can prepare
      // each INSERT once and reuse it per row (stmt.run = bind+step+reset). The
      // compat wrapper re-prepares the statement — plus a SELECT last_insert_rowid()
      // — on EVERY row, which makes a multi-thousand-row restore extremely slow.
      const raw  = db._db;
      const fast = raw && typeof raw.prepare === 'function';

      // 1. Wipe in reverse order (children before parents)
      for (const name of [...TABLES_ORDERED].reverse()) {
        try {
          if (fast) raw.run(`DELETE FROM "${name}"`);
          else      db.prepare(`DELETE FROM "${name}"`).run();
        } catch { /* table may not exist in older schema — skip */ }
      }

      // 2. Re-insert from backup in forward order (parents before children)
      for (const name of TABLES_ORDERED) {
        const rows = Array.isArray(backup.tables[name]) ? backup.tables[name] : [];
        if (rows.length === 0) { stats.tables[name] = 0; continue; }

        const cols = Object.keys(rows[0]);
        if (cols.length === 0) { stats.tables[name] = 0; continue; }

        const colList      = cols.map(c => `"${c}"`).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT OR IGNORE INTO "${name}" (${colList}) VALUES (${placeholders})`;

        let stmt;
        try {
          stmt = fast ? raw.prepare(sql) : db.prepare(sql);
        } catch (e) {
          stats.tables[name] = -1;
          stats.errors.push(`${name}: prepare failed — ${e.message}`);
          continue;
        }

        let inserted = 0, skipped = 0;
        for (const row of rows) {
          try {
            // Both raw sql.js Statement.run() and the compat wrapper accept an
            // array of positional values; raw resets the statement for reuse.
            stmt.run(cols.map(c => row[c] ?? null));
            inserted++;
          } catch (e) {
            skipped++;
            if (skipped <= 3) stats.errors.push(`${name} row skip: ${e.message}`);
          }
        }
        if (fast && typeof stmt.free === 'function') stmt.free();

        stats.tables[name] = inserted;
        if (skipped > 0) stats.errors.push(`${name}: skipped ${skipped} row(s)`);
      }
    });

    restore();
    db.pragma('foreign_keys = ON');

    // ── Restore uploaded files (outside the DB transaction) ───────────────
    if (backup.files && typeof backup.files === 'object') {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      for (const [fname, payload] of Object.entries(backup.files)) {
        try {
          const buf = Buffer.from(payload.data, 'base64');
          fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
          stats.files++;
        } catch (e) {
          stats.errors.push(`file "${fname}": ${e.message}`);
        }
      }
    }

    const totalRows = Object.values(stats.tables).reduce((s, v) => s + Math.max(v, 0), 0);

    res.json({
      success:      true,
      exported_at:  backup.exported_at,
      duration_ms:  Date.now() - startedAt,
      total_rows:   totalRows,
      stats,
      message:      'Restore complete. Reload the app to see your data.',
    });
  } catch (err) {
    console.error('[backup/import]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
