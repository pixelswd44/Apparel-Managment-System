import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/index.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Tables to back up — in dependency-safe insertion order
// (parents before children, so FK constraints don't fail on import)
const TABLES_ORDERED = [
  'settings',
  'currencies',
  'users',
  'companies',
  'categories',
  'cost_breakdown_items',
  'document_templates',
  'expense_categories',
  'employees',
  'clients',
  'vendors',
  'products',
  'product_prices',
  'product_sales',
  'inventory_items',
  'inventory',
  'inventory_transactions',
  'quotations',
  'quotation_templates',
  'invoices',
  'payments',
  'purchases',
  'projects',
  'project_products',
  'project_stages',
  'project_boxes',
  'project_vendors',
  'project_vendor_payments',
  'project_workers',
  'expenses',
  'payroll_records',
  'employee_advances',
  'calculator_templates',
  'reminders',
];

// ─── GET /api/backup/export ───────────────────────────────────────────────────
// Returns a single JSON file with all DB rows + uploaded files (base64).
// Triggered by the "Download Backup" button in Settings.
router.get('/export', (req, res) => {
  try {
    // 1. Snapshot every table
    const tables = {};
    for (const name of TABLES_ORDERED) {
      try {
        tables[name] = db.prepare(`SELECT * FROM ${name}`).all();
      } catch (err) {
        // Table might not exist (older schema) — skip silently
        tables[name] = [];
      }
    }

    // 2. Read every file under uploads/ and base64-encode it
    const files = {};
    if (fs.existsSync(UPLOADS_DIR)) {
      const fileNames = fs.readdirSync(UPLOADS_DIR);
      for (const fname of fileNames) {
        if (fname.startsWith('.')) continue; // skip .gitkeep etc
        const fullPath = path.join(UPLOADS_DIR, fname);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          files[fname] = {
            data: fs.readFileSync(fullPath).toString('base64'),
            size: stat.size,
          };
        } catch { /* unreadable file — skip */ }
      }
    }

    // 3. Wrap with metadata
    const backup = {
      app:         'apparel-crm',
      version:     1,
      exported_at: new Date().toISOString(),
      table_count: Object.keys(tables).length,
      file_count:  Object.keys(files).length,
      tables,
      files,
    };

    // 4. Stream as downloadable JSON
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="apparel-crm-backup-${stamp}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/backup/import ──────────────────────────────────────────────────
// Wipes every table listed in TABLES_ORDERED, then inserts the rows from the
// supplied backup file. Also restores uploaded files.
// IMPORTANT: This is destructive. The frontend confirms heavily before calling.
router.post('/import', (req, res) => {
  try {
    const backup = req.body;
    if (!backup || backup.app !== 'apparel-crm') {
      return res.status(400).json({ error: 'Not a valid Apparel CRM backup file.' });
    }
    if (!backup.tables || typeof backup.tables !== 'object') {
      return res.status(400).json({ error: 'Backup is missing table data.' });
    }

    const stats = { tables: {}, files: 0 };

    // Wrap everything in a single transaction so a partial failure rolls back
    const restore = db.transaction(() => {
      db.pragma('foreign_keys = OFF');

      // 1. Wipe tables (children → parents so FKs stay valid mid-wipe)
      for (const name of [...TABLES_ORDERED].reverse()) {
        try { db.prepare(`DELETE FROM ${name}`).run(); }
        catch { /* missing table — ignore */ }
      }

      // 2. Insert backup rows
      for (const name of TABLES_ORDERED) {
        const rows = Array.isArray(backup.tables[name]) ? backup.tables[name] : [];
        if (rows.length === 0) { stats.tables[name] = 0; continue; }

        // Build a parameterised INSERT from the first row's keys
        const cols = Object.keys(rows[0]);
        if (cols.length === 0) { stats.tables[name] = 0; continue; }

        const placeholders = cols.map(() => '?').join(',');
        const sql = `INSERT INTO ${name} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;

        let stmt;
        try { stmt = db.prepare(sql); }
        catch { stats.tables[name] = -1; continue; /* table doesn't exist anymore */ }

        let inserted = 0;
        for (const row of rows) {
          try {
            stmt.run(...cols.map(c => row[c] ?? null));
            inserted++;
          } catch { /* row skip on conflict */ }
        }
        stats.tables[name] = inserted;
      }

      db.pragma('foreign_keys = ON');
    });

    restore();

    // 3. Restore uploaded files (outside the DB transaction)
    if (backup.files && typeof backup.files === 'object') {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      for (const [fname, payload] of Object.entries(backup.files)) {
        try {
          const buf = Buffer.from(payload.data, 'base64');
          fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
          stats.files++;
        } catch { /* skip bad file */ }
      }
    }

    res.json({
      success:     true,
      exported_at: backup.exported_at,
      stats,
      message:     'Restore complete. Reload the app to see your data.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
