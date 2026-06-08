import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
  // ── Other ───────────────────────────────────────────────────────────────
  'reminders',
];

// ─── GET /api/backup/export ───────────────────────────────────────────────────
router.get('/export', (req, res) => {
  try {
    // 1. Snapshot every table
    const tables = {};
    const tableMeta = {};
    for (const name of TABLES_ORDERED) {
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
    if (fs.existsSync(UPLOADS_DIR)) {
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
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="apparel-crm-backup-${stamp}.json"`);
    res.send(JSON.stringify(backup, null, 2));
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
      // 1. Wipe in reverse order (children before parents)
      for (const name of [...TABLES_ORDERED].reverse()) {
        try {
          db.prepare(`DELETE FROM "${name}"`).run();
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
          stmt = db.prepare(sql);
        } catch (e) {
          stats.tables[name] = -1;
          stats.errors.push(`${name}: prepare failed — ${e.message}`);
          continue;
        }

        let inserted = 0, skipped = 0;
        for (const row of rows) {
          try {
            stmt.run(cols.map(c => row[c] ?? null));
            inserted++;
          } catch (e) {
            skipped++;
            if (skipped <= 3) stats.errors.push(`${name} row skip: ${e.message}`);
          }
        }
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
