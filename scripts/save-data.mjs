/**
 * Exports the live database to data/latest-backup.json.gz
 * Run: npm run save-data
 * Then commit & push so your data is saved on GitHub.
 */

import { createRequire } from 'module';
const require   = createRequire(import.meta.url);
const initSqlJs = require('../server/node_modules/sql.js/dist/sql-wasm.js');
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DB_PATH   = join(ROOT, 'server', 'apparel.db');
const OUT_PATH  = join(ROOT, 'data', 'latest-backup.json.gz');

if (!existsSync(DB_PATH)) {
  console.error('❌  Database not found at', DB_PATH);
  process.exit(1);
}

const TABLES = [
  'settings', 'currencies', 'users', 'companies', 'categories',
  'expense_categories', 'cost_breakdown_items', 'document_templates',
  'calculator_templates', 'employees', 'clients', 'vendors',
  'products', 'product_prices', 'product_sales', 'inventory_items',
  'inventory', 'inventory_transactions', 'quotation_templates',
  'quotations', 'invoices', 'payments', 'purchases',
  'projects', 'project_products', 'project_stages', 'project_boxes',
  'project_vendors', 'project_shipping', 'project_vendor_payments',
  'project_workers', 'expenses', 'payroll_records', 'employee_advances',
  'capital_investments', 'capital_loans', 'loan_repayments', 'reminders',
];

const SQL = await initSqlJs();
const db  = new SQL.Database(readFileSync(DB_PATH));

const tables   = {};
const tableMeta = {};
let totalRows  = 0;

for (const name of TABLES) {
  try {
    const stmt = db.prepare(`SELECT * FROM "${name}"`);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    tables[name]    = rows;
    tableMeta[name] = rows.length;
    totalRows      += rows.length;
  } catch {
    tables[name]    = [];
    tableMeta[name] = 0;
  }
}

const backup = {
  app:         'apparel-crm',
  version:     2,
  exported_at: new Date().toISOString(),
  row_count:   totalRows,
  table_meta:  tableMeta,
  file_count:  0,
  tables,
  files:       {},
};

const compressed = zlib.gzipSync(JSON.stringify(backup));
writeFileSync(OUT_PATH, compressed);

const kb = (compressed.length / 1024).toFixed(1);
console.log(`✅  Saved ${totalRows} rows → data/latest-backup.json.gz (${kb} KB)`);
console.log('    git add data/ && git commit -m "Save latest data" && git push');

db.close();
