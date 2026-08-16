import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import multer from 'multer';
import db from '../db/index.js';

const router = Router();

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const DATA_DIR    = path.join(__dirname, '..', '..', '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');   // timestamped server-side snapshots
const LATEST_PATH = path.join(DATA_DIR, 'latest-backup.json.gz'); // git-committable pointer
const KEEP_SNAPSHOTS = parseInt(process.env.BACKUP_KEEP || '20', 10);

// Accept the raw .json.gz file (max 500 MB) — far more robust than a JSON body
// once the uploads folder grows, and it never has to be gunzipped in the browser.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

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
  'other_income',
  'monthly_opening_balances',
  'payroll_records',
  'employee_advances',
  'capital_investments',
  'capital_loans',
  'loan_repayments',
  // ── Other ───────────────────────────────────────────────────────────────
  'reminders',
];

// Any table that exists in the DB but isn't listed above gets appended at the
// end, so a newly-added table is never silently dropped from backups.
function allTablesOrdered() {
  let live = [];
  try {
    live = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  } catch { /* ignore */ }
  const known = new Set(TABLES_ORDERED);
  return [...TABLES_ORDERED.filter(t => live.includes(t) || live.length === 0), ...live.filter(t => !known.has(t))];
}

// ─── Shared: build a backup envelope ─────────────────────────────────────────
function buildBackup({ tableFilter = null, includeFiles = true } = {}) {
  const order  = allTablesOrdered();
  const wanted = tableFilter ? order.filter(t => tableFilter.has(t)) : order;

  const tables = {}, tableMeta = {};
  for (const name of wanted) {
    try {
      const rows = db.prepare(`SELECT * FROM "${name}"`).all();
      tables[name] = rows; tableMeta[name] = rows.length;
    } catch { tables[name] = []; tableMeta[name] = 0; }
  }

  const files = {};
  if (includeFiles && fs.existsSync(UPLOADS_DIR)) {
    for (const fname of fs.readdirSync(UPLOADS_DIR)) {
      if (fname.startsWith('.')) continue;
      const full = path.join(UPLOADS_DIR, fname);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        files[fname] = { data: fs.readFileSync(full).toString('base64'), size: st.size };
      } catch { /* unreadable — skip */ }
    }
  }

  const row_count = Object.values(tableMeta).reduce((s, n) => s + n, 0);
  return {
    app: 'apparel-crm', version: 3, exported_at: new Date().toISOString(),
    row_count, table_meta: tableMeta, file_count: Object.keys(files).length,
    tables, files,
  };
}

// ─── Shared: restore a backup envelope into the DB (+ optional files) ────────
function restoreBackup(backup, { restoreFiles = true } = {}) {
  if (!backup || backup.app !== 'apparel-crm') throw Object.assign(new Error('Not a valid Apparel CRM backup file.'), { status: 400 });
  if (!backup.tables || typeof backup.tables !== 'object') throw Object.assign(new Error('Backup is missing table data.'), { status: 400 });

  const stats = { tables: {}, files: 0, errors: [] };
  const started = Date.now();
  const order = allTablesOrdered();
  // Also restore any table present in the backup but unknown locally (schema drift)
  const inBackup = Object.keys(backup.tables).filter(t => !order.includes(t));
  const wipeOrder = [...order, ...inBackup].reverse();
  const insertOrder = [...order, ...inBackup];

  // SQLite: the foreign_keys pragma is ignored inside a transaction — set it before.
  db.pragma('foreign_keys = OFF');
  const raw  = db._db;
  const fast = raw && typeof raw.prepare === 'function';

  const tx = db.transaction(() => {
    for (const name of wipeOrder) {
      try { fast ? raw.run(`DELETE FROM "${name}"`) : db.prepare(`DELETE FROM "${name}"`).run(); }
      catch { /* table may not exist — skip */ }
    }
    for (const name of insertOrder) {
      const rows = Array.isArray(backup.tables[name]) ? backup.tables[name] : [];
      if (rows.length === 0) { stats.tables[name] = 0; continue; }
      // Union of columns across rows (older rows may miss newer columns), then keep
      // only the columns that exist locally so a newer/older schema still restores.
      let localCols = null;
      try { localCols = new Set(db.prepare(`PRAGMA table_info("${name}")`).all().map(c => c.name)); } catch {}
      const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => !localCols || localCols.has(c));
      if (cols.length === 0) { stats.tables[name] = 0; continue; }
      const sql = `INSERT OR IGNORE INTO "${name}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      let stmt;
      try { stmt = fast ? raw.prepare(sql) : db.prepare(sql); }
      catch (e) { stats.tables[name] = -1; stats.errors.push(`${name}: prepare failed — ${e.message}`); continue; }
      let inserted = 0, skipped = 0;
      for (const row of rows) {
        try { stmt.run(cols.map(c => row[c] ?? null)); inserted++; }
        catch (e) { skipped++; if (skipped <= 3) stats.errors.push(`${name} row skip: ${e.message}`); }
      }
      if (fast && typeof stmt.free === 'function') stmt.free();
      stats.tables[name] = inserted;
      if (skipped > 0) stats.errors.push(`${name}: skipped ${skipped} row(s)`);
    }
  });
  tx();
  db.pragma('foreign_keys = ON');
  // Persist to disk immediately (sql.js keeps the DB in memory until saved)
  try { if (typeof db._save === 'function') db._save(); } catch {}

  if (restoreFiles && backup.files && typeof backup.files === 'object') {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    for (const [fname, payload] of Object.entries(backup.files)) {
      // Never let a crafted filename escape the uploads dir
      const safe = path.basename(fname);
      if (!safe || safe !== fname) { stats.errors.push(`file "${fname}": rejected name`); continue; }
      try { fs.writeFileSync(path.join(UPLOADS_DIR, safe), Buffer.from(payload.data, 'base64')); stats.files++; }
      catch (e) { stats.errors.push(`file "${fname}": ${e.message}`); }
    }
  }

  const total_rows = Object.values(stats.tables).reduce((s, v) => s + Math.max(v, 0), 0);
  return { success: true, exported_at: backup.exported_at, duration_ms: Date.now() - started, total_rows, stats,
           message: 'Restore complete. Reload the app to see your data.' };
}

function parseGz(buf) {
  let raw = buf;
  // Accept both gzipped and plain-JSON payloads
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) raw = zlib.gunzipSync(buf);
  return JSON.parse(raw.toString('utf8'));
}

function snapshotName(d = new Date()) {
  return `backup-${d.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json.gz`;
}
function listSnapshots() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.json.gz'))
    .map(f => { const st = fs.statSync(path.join(BACKUPS_DIR, f)); return { name: f, size_kb: Math.round(st.size / 1024), saved_at: st.mtime.toISOString() }; })
    .sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}
function pruneSnapshots() {
  const all = listSnapshots();
  for (const s of all.slice(KEEP_SNAPSHOTS)) { try { fs.unlinkSync(path.join(BACKUPS_DIR, s.name)); } catch {} }
}
function safeSnapshotPath(name) {
  const base = path.basename(name || '');
  if (!base || !base.endsWith('.json.gz') || base !== name) return null;
  return path.join(BACKUPS_DIR, base);
}

// ─── GET /api/backup/export — download a fresh backup ────────────────────────
router.get('/export', (req, res) => {
  try {
    const tableFilter  = req.query.tables ? new Set(req.query.tables.split(',').map(t => t.trim()).filter(Boolean)) : null;
    const includeFiles = req.query.files !== '0';
    const backup = buildBackup({ tableFilter, includeFiles });
    const stamp  = new Date().toISOString().slice(0, 10);
    const gz     = zlib.gzipSync(JSON.stringify(backup));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('Content-Disposition', `attachment; filename="apparel-crm-backup-${stamp}.json.gz"`);
    res.send(gz);
  } catch (err) { console.error('[backup/export]', err); res.status(500).json({ error: err.message }); }
});

// ─── POST /api/backup/import-file — restore from an uploaded .json.gz ────────
// multipart/form-data: file=<backup.json.gz>, restore_files=1|0
router.post('/import-file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No backup file uploaded.' });
    const backup = parseGz(req.file.buffer);
    const result = restoreBackup(backup, { restoreFiles: req.body?.restore_files !== '0' });
    res.json(result);
  } catch (err) {
    console.error('[backup/import-file]', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /api/backup/import — legacy JSON-body restore (kept for compatibility) ─
router.post('/import', (req, res) => {
  try { res.json(restoreBackup(req.body, { restoreFiles: true })); }
  catch (err) { console.error('[backup/import]', err); res.status(err.status || 500).json({ error: err.message }); }
});

// ─── Server-side snapshots ───────────────────────────────────────────────────

// POST /api/backup/save-snapshot — write a timestamped snapshot + refresh latest
router.post('/save-snapshot', (req, res) => {
  try {
    const backup = buildBackup();
    const gz = zlib.gzipSync(JSON.stringify(backup));
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const name = snapshotName();
    fs.writeFileSync(path.join(BACKUPS_DIR, name), gz);
    fs.writeFileSync(LATEST_PATH, gz);
    pruneSnapshots();
    res.json({ success: true, name, row_count: backup.row_count, file_count: backup.file_count,
               size_kb: Math.round(gz.length / 1024), saved_at: backup.exported_at,
               message: `Snapshot saved (${name}) and data/latest-backup.json.gz refreshed.` });
  } catch (err) { console.error('[backup/save-snapshot]', err); res.status(500).json({ error: err.message }); }
});

// GET /api/backup/snapshots — list timestamped snapshots on this server
router.get('/snapshots', (req, res) => {
  try { res.json({ keep: KEEP_SNAPSHOTS, snapshots: listSnapshots() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/backup/snapshots/:name/download
router.get('/snapshots/:name/download', (req, res) => {
  const p = safeSnapshotPath(req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Snapshot not found.' });
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(p)}"`);
  fs.createReadStream(p).pipe(res);
});

// POST /api/backup/snapshots/:name/restore
router.post('/snapshots/:name/restore', (req, res) => {
  try {
    const p = safeSnapshotPath(req.params.name);
    if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Snapshot not found.' });
    const backup = parseGz(fs.readFileSync(p));
    res.json(restoreBackup(backup, { restoreFiles: req.body?.restore_files !== false }));
  } catch (err) { console.error('[backup/snapshot-restore]', err); res.status(err.status || 500).json({ error: err.message }); }
});

// DELETE /api/backup/snapshots/:name
router.delete('/snapshots/:name', (req, res) => {
  const p = safeSnapshotPath(req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Snapshot not found.' });
  try { fs.unlinkSync(p); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/backup/snapshot-meta — metadata of data/latest-backup.json.gz
router.get('/snapshot-meta', (req, res) => {
  try {
    if (!fs.existsSync(LATEST_PATH)) return res.json({ exists: false });
    const backup = parseGz(fs.readFileSync(LATEST_PATH));
    const st = fs.statSync(LATEST_PATH);
    res.json({ exists: true, exported_at: backup.exported_at, row_count: backup.row_count,
               file_count: backup.file_count ?? 0, table_meta: backup.table_meta, size_kb: Math.round(st.size / 1024) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/backup/restore-snapshot — restore data/latest-backup.json.gz
router.post('/restore-snapshot', (req, res) => {
  try {
    if (!fs.existsSync(LATEST_PATH)) return res.status(404).json({ error: 'No snapshot found on server.' });
    const backup = parseGz(fs.readFileSync(LATEST_PATH));
    res.json(restoreBackup(backup, { restoreFiles: req.body?.restore_files !== false }));
  } catch (err) { console.error('[backup/restore-snapshot]', err); res.status(err.status || 500).json({ error: err.message }); }
});

// ─── Optional: automatic daily snapshot ──────────────────────────────────────
// Set BACKUP_AUTO_DAILY=1 in the server .env to enable. Runs once ~24h after
// boot and then every 24h; keeps BACKUP_KEEP (default 20) newest snapshots.
if (process.env.BACKUP_AUTO_DAILY === '1') {
  const DAY = 24 * 60 * 60 * 1000;
  const run = () => {
    try {
      const backup = buildBackup();
      const gz = zlib.gzipSync(JSON.stringify(backup));
      if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUPS_DIR, snapshotName()), gz);
      fs.writeFileSync(LATEST_PATH, gz);
      pruneSnapshots();
      console.log(`[backup] auto snapshot saved (${backup.row_count} rows, ${backup.file_count} files)`);
    } catch (e) { console.error('[backup] auto snapshot failed:', e.message); }
  };
  setTimeout(() => { run(); setInterval(run, DAY); }, DAY).unref?.();
}

export default router;
