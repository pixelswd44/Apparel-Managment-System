import 'dotenv/config'; // ensure .env is loaded before we read DB_PATH (imports run before index.js body)
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { join, dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DB file location. Set DB_PATH in the environment to keep the database OUTSIDE
// the deploy directory so `git pull` / re-deploys on Hostinger don't wipe it.
// Relative paths are resolved from the current working directory.
const DB_PATH = process.env.DB_PATH
  ? (isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : resolve(process.cwd(), process.env.DB_PATH))
  : join(__dirname, '../../apparel.db');

// Make sure the containing folder exists (e.g. a fresh /home/user/crm-data dir).
try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}
console.log(`[DB] using ${DB_PATH}`);

// Fail fast & loud if the DB directory is not writable — a silent write failure
// means sql.js keeps data in RAM only and everything is lost on the next restart.
try {
  const probe = join(dirname(DB_PATH), '.write-test');
  writeFileSync(probe, 'ok');
  const { statSync, unlinkSync: rm } = await import('fs');
  rm(probe);
  console.log(`[DB] write check OK for ${dirname(DB_PATH)}`);
  if (existsSync(DB_PATH)) console.log(`[DB] existing file size: ${statSync(DB_PATH).size} bytes`);
} catch (e) {
  console.error(`[DB] WRITE CHECK FAILED for ${dirname(DB_PATH)}: ${e.code || ''} ${e.message}`);
}

// ── sql.js initialisation (top-level await works in ESM) ─────────────────────
const SQL = await initSqlJs();

// ── better-sqlite3 compatibility wrapper ─────────────────────────────────────
function toSqlJsParams(params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params;
  if (typeof params !== 'object') return [params];
  // Named params: {name: val} → {':name': val}  (sql.js uses colon prefix)
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[/^[:$@]/.test(k) ? k : `:${k}`] = v;
  }
  return out;
}

class Stmt {
  constructor(sqlDb, sql, wrapper) {
    this._sqlDb = sqlDb;
    this._sql   = sql;
    this._w     = wrapper;
  }
  _mk(params) {
    const st = this._sqlDb.prepare(this._sql);
    const p  = toSqlJsParams(params);
    if ((Array.isArray(p) && p.length) || (!Array.isArray(p) && p && Object.keys(p).length)) {
      st.bind(p);
    }
    return st;
  }
  all(...args) {
    const p  = args.length === 1 ? args[0] : args.length > 1 ? args : undefined;
    const st = this._mk(p);
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  }
  get(...args) {
    const p  = args.length === 1 ? args[0] : args.length > 1 ? args : undefined;
    const st = this._mk(p);
    let row;
    if (st.step()) row = st.getAsObject();
    st.free();
    return row;
  }
  run(...args) {
    const p  = args.length === 1 ? args[0] : args.length > 1 ? args : undefined;
    const st = this._mk(p);
    st.step();
    const changes = this._sqlDb.getRowsModified();
    st.free();
    // Use prepare/step (not exec) so we don't risk interfering with an open transaction
    let lastInsertRowid = 0;
    try {
      const idSt = this._sqlDb.prepare('SELECT last_insert_rowid() as id');
      if (idSt.step()) lastInsertRowid = idSt.getAsObject()['id'] ?? 0;
      idSt.free();
    } catch {}
    this._w._save();
    return { changes, lastInsertRowid };
  }
  iterate(...args) { return this.all(...args)[Symbol.iterator](); }
}

class BetterSqliteCompat {
  constructor(path) {
    this._path = path;
    this._inTx = false;
    this._db   = existsSync(path)
      ? new SQL.Database(readFileSync(path))
      : new SQL.Database();
  }
  prepare(sql)  { return new Stmt(this._db, sql, this); }
  exec(sql)     { this._db.run(sql); this._save(); return this; }
  pragma(str)   {
    try { this._db.run(`PRAGMA ${str}`); } catch { /* ignore unsupported */ }
    return this;
  }
  transaction(fn) {
    return (...args) => {
      this._db.run('BEGIN');
      this._inTx = true;
      try {
        const result = fn(...args);
        this._db.run('COMMIT');
        this._inTx = false;
        this._save();
        return result;
      } catch (e) {
        this._db.run('ROLLBACK');
        this._inTx = false;
        throw e;
      }
    };
  }
  _save() {
    if (this._inTx) return;
    try {
      writeFileSync(this._path, Buffer.from(this._db.export()));
    } catch (e) {
      // Surface disk-write failures loudly — otherwise sql.js keeps everything
      // in memory and all data is lost on restart with no visible error.
      if (!this._saveErrLogged || Date.now() - this._saveErrLogged > 30000) {
        console.error(`[DB] FAILED to write ${this._path}: ${e.code || ''} ${e.message}`);
        this._saveErrLogged = Date.now();
      }
      throw e;
    }
  }
  close() { this._save(); this._db.close(); }
}

const db = new BetterSqliteCompat(DB_PATH);
db.pragma('foreign_keys = ON');

// Save on process exit
process.on('exit',   () => { try { db._save(); } catch {} });
process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Checkpoint any pending WAL data into the main DB file on every startup.
// This is safe: SQLite replays the WAL before any read, so data is never lost.
// The checkpoint just makes the main .db file the single source of truth again.
try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore if WAL is empty */ }

// Also checkpoint cleanly on process exit so data is always in the .db file
process.on('exit', () => { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {} });
process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ── Create tables ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_type     TEXT    DEFAULT 'business',
    name              TEXT    NOT NULL,
    company           TEXT,
    display_name      TEXT,
    name_primary      TEXT,
    name_arabic       TEXT,
    customer_number   TEXT,
    email             TEXT,
    phone             TEXT,
    customer_language TEXT    DEFAULT 'English',
    currency          TEXT    DEFAULT 'USD',
    products_origin   TEXT    DEFAULT 'Pakistan',
    payment_terms     TEXT    DEFAULT 'Net 30',
    customer_owner    TEXT,
    address           TEXT,
    city              TEXT,
    zip               TEXT,
    country           TEXT,
    shipping_receiver_name  TEXT,
    shipping_receiver_phone TEXT,
    shipping_address  TEXT,
    shipping_city     TEXT,
    shipping_zip      TEXT,
    shipping_country  TEXT,
    documents         TEXT    DEFAULT '[]',
    notes             TEXT,
    status            TEXT    DEFAULT 'active',
    created_at        TEXT    DEFAULT (datetime('now')),
    updated_at        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotation_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    items       TEXT DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    number      TEXT UNIQUE NOT NULL,
    client_id   INTEGER REFERENCES clients(id),
    status      TEXT    DEFAULT 'draft',
    items       TEXT    DEFAULT '[]',
    subtotal    REAL    DEFAULT 0,
    tax_rate    REAL    DEFAULT 0,
    tax_amount  REAL    DEFAULT 0,
    discount    REAL    DEFAULT 0,
    total       REAL    DEFAULT 0,
    notes       TEXT,
    valid_until TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    number        TEXT UNIQUE NOT NULL,
    client_id     INTEGER REFERENCES clients(id),
    quotation_id  INTEGER REFERENCES quotations(id),
    status        TEXT    DEFAULT 'unpaid',
    items         TEXT    DEFAULT '[]',
    subtotal      REAL    DEFAULT 0,
    tax_rate      REAL    DEFAULT 0,
    tax_amount    REAL    DEFAULT 0,
    discount      REAL    DEFAULT 0,
    total         REAL    DEFAULT 0,
    amount_paid   REAL    DEFAULT 0,
    notes         TEXT,
    due_date      TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER REFERENCES invoices(id),
    client_id   INTEGER REFERENCES clients(id),
    amount      REAL NOT NULL,
    method      TEXT,
    reference   TEXT,
    notes       TEXT,
    paid_at     TEXT DEFAULT (datetime('now')),
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier      TEXT,
    description   TEXT,
    amount        REAL,
    category      TEXT,
    status        TEXT DEFAULT 'pending',
    purchase_date TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT DEFAULT '#6366f1',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS product_sales (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
    quantity    REAL NOT NULL,
    unit_price  REAL NOT NULL,
    sale_date   TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    article_number TEXT,
    sku            TEXT,
    category_id    INTEGER REFERENCES categories(id),
    description    TEXT,
    unit           TEXT DEFAULT 'pcs',
    unit_cost      REAL DEFAULT 0,
    selling_price  REAL DEFAULT 0,
    stock_quantity REAL DEFAULT 0,
    reorder_level  REAL DEFAULT 0,
    status         TEXT DEFAULT 'active',
    images         TEXT DEFAULT '[]',
    notes          TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS companies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    logo        TEXT    DEFAULT '',
    address     TEXT    DEFAULT '',
    city        TEXT    DEFAULT '',
    country     TEXT    DEFAULT '',
    phone       TEXT    DEFAULT '',
    email       TEXT    DEFAULT '',
    website     TEXT    DEFAULT '',
    tax_number  TEXT    DEFAULT '',
    is_default  INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cost_breakdown_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT NOT NULL,
    label      TEXT NOT NULL,
    enabled    INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calculator_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
    total_pieces REAL DEFAULT 0,
    profit_margin REAL DEFAULT 0,
    costs       TEXT DEFAULT '{}',
    size_breakdown TEXT DEFAULT '{}',
    notes       TEXT,
    currency    TEXT DEFAULT 'PKR',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS currencies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    symbol      TEXT NOT NULL DEFAULT '',
    rate_to_usd REAL DEFAULT 1,
    is_default  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id  INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    title      TEXT NOT NULL,
    note       TEXT,
    remind_at  TEXT NOT NULL,
    done       INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    invoice_id      INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    status          TEXT DEFAULT 'planning',
    currency        TEXT DEFAULT 'PKR',
    amount_received REAL DEFAULT 0,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_products (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    product_id            INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name          TEXT NOT NULL,
    unit                  TEXT DEFAULT 'pcs',
    sizes                 TEXT DEFAULT '[]',
    total_quantity        REAL DEFAULT 0,
    fabric_material       TEXT DEFAULT '',
    fabric_unit           TEXT DEFAULT 'yards',
    fabric_per_piece      REAL DEFAULT 0,
    fabric_price_per_unit REAL DEFAULT 0,
    costs                 TEXT DEFAULT '[]',
    external_costs        TEXT DEFAULT '[]',
    notes                 TEXT,
    sort_order            INTEGER DEFAULT 0,
    created_at            TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_stages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage_key    TEXT NOT NULL,
    stage_name   TEXT NOT NULL,
    enabled      INTEGER DEFAULT 1,
    status       TEXT DEFAULT 'pending',
    sort_order   INTEGER DEFAULT 0,
    notes        TEXT,
    started_at   TEXT,
    completed_at TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_boxes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    box_number INTEGER NOT NULL,
    contents   TEXT DEFAULT '[]',
    notes      TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    type         TEXT DEFAULT 'process',
    contact_name TEXT DEFAULT '',
    phone        TEXT DEFAULT '',
    email        TEXT DEFAULT '',
    address      TEXT DEFAULT '',
    city         TEXT DEFAULT '',
    country      TEXT DEFAULT '',
    bank_details TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    rating       INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'active',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_vendors (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id           INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    vendor_name         TEXT NOT NULL,
    service_description TEXT DEFAULT '',
    invoice_amount      REAL DEFAULT 0,
    currency            TEXT DEFAULT 'PKR',
    notes               TEXT DEFAULT '',
    created_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_vendor_payments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_vendor_id INTEGER NOT NULL REFERENCES project_vendors(id) ON DELETE CASCADE,
    project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    amount            REAL NOT NULL,
    method            TEXT DEFAULT 'cash',
    reference         TEXT DEFAULT '',
    notes             TEXT DEFAULT '',
    paid_at           TEXT DEFAULT (datetime('now')),
    created_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_workers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    worker_type      TEXT DEFAULT 'contract',
    employee_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    worker_name      TEXT NOT NULL,
    worker_phone     TEXT DEFAULT '',
    task_description TEXT DEFAULT '',
    agreed_amount    REAL DEFAULT 0,
    paid_amount      REAL DEFAULT 0,
    notes            TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    category     TEXT,
    amount       REAL,
    paid_by      TEXT,
    expense_date TEXT,
    notes        TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    role       TEXT,
    email      TEXT,
    phone      TEXT,
    salary     REAL DEFAULT 0,
    status     TEXT DEFAULT 'active',
    joined_at  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payroll_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES employees(id),
    period      TEXT,
    base_salary REAL,
    bonus       REAL DEFAULT 0,
    deductions  REAL DEFAULT 0,
    net_pay     REAL,
    status      TEXT DEFAULT 'pending',
    paid_at     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employee_advances (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount          REAL NOT NULL DEFAULT 0,
    date            TEXT,
    reason          TEXT DEFAULT '',
    repaid_amount   REAL DEFAULT 0,
    status          TEXT DEFAULT 'pending',
    notes           TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    color      TEXT DEFAULT '#6366f1',
    icon       TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS document_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    type          TEXT    NOT NULL,   -- 'quotation' | 'invoice' | 'voucher'
    layout        TEXT    NOT NULL DEFAULT 'classic',
    is_default    INTEGER DEFAULT 0,
    config        TEXT    NOT NULL DEFAULT '{}',
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS product_prices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    currency      TEXT    NOT NULL,
    unit_cost     REAL    DEFAULT 0,
    selling_price REAL    DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now')),
    UNIQUE(product_id, currency)
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'sales',
    status        TEXT    NOT NULL DEFAULT 'active',
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Migrate existing clients table (add new columns if missing) ────────────
const migrations = [
  `ALTER TABLE clients ADD COLUMN customer_type     TEXT    DEFAULT 'business'`,
  `ALTER TABLE clients ADD COLUMN display_name      TEXT`,
  `ALTER TABLE clients ADD COLUMN name_primary      TEXT`,
  `ALTER TABLE clients ADD COLUMN name_arabic       TEXT`,
  `ALTER TABLE clients ADD COLUMN customer_number   TEXT`,
  `ALTER TABLE clients ADD COLUMN customer_language TEXT    DEFAULT 'English'`,
  `ALTER TABLE clients ADD COLUMN currency          TEXT    DEFAULT 'USD'`,
  `ALTER TABLE clients ADD COLUMN products_origin   TEXT    DEFAULT 'Pakistan'`,
  `ALTER TABLE clients ADD COLUMN payment_terms     TEXT    DEFAULT 'Net 30'`,
  `ALTER TABLE clients ADD COLUMN customer_owner           TEXT`,
  `ALTER TABLE clients ADD COLUMN documents                TEXT    DEFAULT '[]'`,
  `ALTER TABLE clients ADD COLUMN zip                      TEXT`,
  `ALTER TABLE clients ADD COLUMN shipping_receiver_name   TEXT`,
  `ALTER TABLE clients ADD COLUMN shipping_receiver_phone  TEXT`,
  `ALTER TABLE clients ADD COLUMN shipping_zip             TEXT`,
  `ALTER TABLE products ADD COLUMN article_number TEXT`,
  `ALTER TABLE quotations ADD COLUMN currency          TEXT DEFAULT 'USD'`,
  `ALTER TABLE quotations ADD COLUMN shipping_name     TEXT`,
  `ALTER TABLE quotations ADD COLUMN shipping_address  TEXT`,
  `ALTER TABLE quotations ADD COLUMN shipping_city     TEXT`,
  `ALTER TABLE quotations ADD COLUMN shipping_country  TEXT`,
  `ALTER TABLE quotations ADD COLUMN bank_details      TEXT`,
  `ALTER TABLE quotations ADD COLUMN customer_notes    TEXT`,
  `ALTER TABLE quotations ADD COLUMN terms_conditions  TEXT`,
  `ALTER TABLE quotations ADD COLUMN subject           TEXT`,
  `ALTER TABLE quotations ADD COLUMN shipping_phone   TEXT`,
  `ALTER TABLE invoices   ADD COLUMN currency           TEXT DEFAULT 'USD'`,
  `ALTER TABLE invoices   ADD COLUMN subject            TEXT`,
  `ALTER TABLE invoices   ADD COLUMN shipping_name      TEXT`,
  `ALTER TABLE invoices   ADD COLUMN shipping_address   TEXT`,
  `ALTER TABLE invoices   ADD COLUMN shipping_city      TEXT`,
  `ALTER TABLE invoices   ADD COLUMN shipping_country   TEXT`,
  `ALTER TABLE invoices   ADD COLUMN shipping_phone     TEXT`,
  `ALTER TABLE invoices   ADD COLUMN bank_details       TEXT`,
  `ALTER TABLE invoices   ADD COLUMN customer_notes     TEXT`,
  `ALTER TABLE invoices   ADD COLUMN terms_conditions   TEXT`,
  `ALTER TABLE payments   ADD COLUMN currency           TEXT DEFAULT 'USD'`,
  `ALTER TABLE quotations ADD COLUMN is_sampling        INTEGER DEFAULT 0`,
  `ALTER TABLE invoices   ADD COLUMN is_sampling        INTEGER DEFAULT 0`,
  `ALTER TABLE quotations ADD COLUMN company_id         INTEGER REFERENCES companies(id)`,
  `ALTER TABLE invoices   ADD COLUMN company_id         INTEGER REFERENCES companies(id)`,
  `ALTER TABLE clients    ADD COLUMN avatar             TEXT    DEFAULT ''`,
  `ALTER TABLE currencies ADD COLUMN rate_to_pkr        REAL    DEFAULT 0`,
  `ALTER TABLE companies  ADD COLUMN bank_details       TEXT    DEFAULT ''`,
  `ALTER TABLE products   ADD COLUMN product_type       TEXT    DEFAULT 'physical'`,
  `ALTER TABLE project_products ADD COLUMN fabric_total_purchased REAL DEFAULT 0`,
  `ALTER TABLE projects ADD COLUMN exchange_rate_actual REAL DEFAULT 0`,
  `ALTER TABLE project_products ADD COLUMN fabric_amount_paid REAL DEFAULT 0`,
  `ALTER TABLE project_vendor_payments ADD COLUMN receipt_url TEXT DEFAULT ''`,
  `ALTER TABLE project_stages    ADD COLUMN tasks TEXT DEFAULT '[]'`,
  `ALTER TABLE project_vendors   ADD COLUMN tasks TEXT DEFAULT '[]'`,
  `ALTER TABLE project_products  ADD COLUMN fabrics TEXT DEFAULT '[]'`,
  `ALTER TABLE projects          ADD COLUMN extra_costs TEXT DEFAULT '[]'`,
  `ALTER TABLE project_boxes     ADD COLUMN shipped INTEGER DEFAULT 0`,
  `ALTER TABLE project_boxes     ADD COLUMN shipped_note TEXT DEFAULT ''`,
  `ALTER TABLE projects          ADD COLUMN images TEXT DEFAULT '[]'`,
  // Employees extended fields
  `ALTER TABLE employees ADD COLUMN designation TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN department TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN cnic TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN address TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN bank_name TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN bank_account TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN bank_iban TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`,
  // Payroll records notes
  `ALTER TABLE payroll_records ADD COLUMN notes TEXT DEFAULT ''`,
  // Expenses extended fields
  `ALTER TABLE expenses ADD COLUMN payment_method TEXT DEFAULT 'cash'`,
  `ALTER TABLE expenses ADD COLUMN receipt_url TEXT DEFAULT ''`,
  `ALTER TABLE expenses ADD COLUMN recurring INTEGER DEFAULT 0`,
  `ALTER TABLE expenses ADD COLUMN recurring_period TEXT DEFAULT 'monthly'`,
  `ALTER TABLE expenses ADD COLUMN expense_category_id INTEGER`,
  // One-screen costing: an expense can be charged to a project, and records who was paid
  `ALTER TABLE expenses ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL`,
  `ALTER TABLE expenses ADD COLUMN paid_to TEXT DEFAULT ''`,
  // An expense can be a payment to an employee (salary / advance)
  `ALTER TABLE expenses ADD COLUMN employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL`,
  // Where a converted expense came from (old project cost records) — for traceability
  `ALTER TABLE expenses ADD COLUMN source TEXT`,
  // Password reset tokens on users table
  `ALTER TABLE users ADD COLUMN reset_token TEXT`,
  `ALTER TABLE users ADD COLUMN reset_token_expires TEXT`,
  // Company logo size for printed documents (in px height)
  `ALTER TABLE companies ADD COLUMN logo_size INTEGER DEFAULT 40`,
  // Shipping cost on quotations & invoices (added to subtotal before tax)
  `ALTER TABLE quotations ADD COLUMN shipping_cost REAL DEFAULT 0`,
  `ALTER TABLE invoices   ADD COLUMN shipping_cost REAL DEFAULT 0`,
  // Custom pricing fields (e.g. "Pattern Cost") — JSON array of {label, amount}
  `ALTER TABLE quotations ADD COLUMN custom_fields TEXT DEFAULT '[]'`,
  `ALTER TABLE invoices   ADD COLUMN custom_fields TEXT DEFAULT '[]'`,
  // Tracks when a project's status was actually set to 'completed', separate
  // from updated_at (which changes on every edit, not just completion)
  `ALTER TABLE projects ADD COLUMN completed_at TEXT`,
  // Miscellaneous income outside the main invoice flow — e.g. selling scrap
  // fabric cuttings locally
  `CREATE TABLE IF NOT EXISTS other_income (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    category       TEXT    DEFAULT '',
    amount         REAL    NOT NULL DEFAULT 0,
    received_by    TEXT    DEFAULT '',
    payment_method TEXT    DEFAULT 'cash',
    income_date    TEXT    NOT NULL,
    notes          TEXT    DEFAULT '',
    created_at     TEXT    DEFAULT (datetime('now'))
  )`,
  `ALTER TABLE invoices   ADD COLUMN issued_at DATE`,
  `CREATE TABLE IF NOT EXISTS project_shipping (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    carrier         TEXT    DEFAULT '',
    tracking_number TEXT    DEFAULT '',
    shipping_date   TEXT    DEFAULT '',
    amount          REAL    DEFAULT 0,
    paid            INTEGER DEFAULT 0,
    paid_amount     REAL    DEFAULT 0,
    notes           TEXT    DEFAULT '',
    expense_id      INTEGER,
    created_at      TEXT    DEFAULT (datetime('now'))
  )`,
  // Freight vendor linking
  `ALTER TABLE project_shipping ADD COLUMN vendor_id INTEGER REFERENCES vendors(id)`,
  // Shipping-linked payment tracking
  `ALTER TABLE project_vendor_payments ADD COLUMN shipping_id INTEGER REFERENCES project_shipping(id)`,
  // Capital tracking: investments
  `CREATE TABLE IF NOT EXISTS capital_investments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_name TEXT    NOT NULL,
    amount        REAL    NOT NULL DEFAULT 0,
    date          TEXT    NOT NULL,
    equity_pct    REAL    DEFAULT 0,
    notes         TEXT    DEFAULT '',
    status        TEXT    DEFAULT 'active',
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  )`,
  // Per-month opening-balance overrides for the Ledger (one per calendar month)
  `CREATE TABLE IF NOT EXISTS monthly_opening_balances (
    month      TEXT PRIMARY KEY,
    amount     REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  // Groups the multiple project_vendor_payments rows created by a single lump-sum
  // vendor payment (auto-distributed across outstanding projects/shipments), so
  // the original paid amount can still be shown as one entry.
  `ALTER TABLE project_vendor_payments ADD COLUMN batch_id TEXT`,
  // Amount already owed to (or, if negative, prepaid by) a vendor before they were
  // added to the CRM — folded into that vendor's Total Billed so Outstanding stays accurate.
  `ALTER TABLE vendors ADD COLUMN opening_balance REAL DEFAULT 0`,
  // Actual PKR received for a payment, when it differs from amount × the configured
  // exchange rate (bank fees, tax withholding, etc.) — overrides the auto-converted
  // figure everywhere revenue is calculated, when set.
  `ALTER TABLE payments ADD COLUMN amount_pkr_actual REAL`,
  // Project-level bulk fabrics/materials — fabric is usually bought in bulk for the
  // whole project, not per product. Same row shape as project_products.fabrics.
  `ALTER TABLE projects ADD COLUMN fabrics TEXT DEFAULT '[]'`,
  // Audit trail of edits made to an accepted/invoiced quotation: [{at, note, from_total, to_total, user}]
  `ALTER TABLE quotations ADD COLUMN change_log TEXT DEFAULT '[]'`,
  // Client management: where the lead came from, deal state, and attached material
  `ALTER TABLE clients ADD COLUMN lead_source TEXT DEFAULT ''`,
  `ALTER TABLE clients ADD COLUMN deal_status TEXT DEFAULT 'open'`,
  `ALTER TABLE clients ADD COLUMN messages    TEXT DEFAULT '[]'`,
  `ALTER TABLE clients ADD COLUMN tech_packs  TEXT DEFAULT '[]'`,
  // Product category cover image (uploaded file URL)
  `ALTER TABLE categories ADD COLUMN image TEXT DEFAULT ''`,
  // Client "final designs" — the approved artwork that actually syncs into a
  // project (tech_packs stays as the broader reference/spec pile).
  `ALTER TABLE clients ADD COLUMN final_designs TEXT DEFAULT '[]'`,
  // Shipping agencies (profiles); a project shipment links to one
  `CREATE TABLE IF NOT EXISTS shipping_agents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    phone        TEXT DEFAULT '',
    email        TEXT DEFAULT '',
    address      TEXT DEFAULT '',
    city         TEXT DEFAULT '',
    country      TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  )`,
  `ALTER TABLE project_shipping ADD COLUMN agent_id INTEGER REFERENCES shipping_agents(id) ON DELETE SET NULL`,
  // Shipping costs are entered on a project's shipments (one or more payments each)
  `CREATE TABLE IF NOT EXISTS shipping_costs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id    INTEGER NOT NULL REFERENCES project_shipping(id) ON DELETE CASCADE,
    project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    amount         REAL    NOT NULL DEFAULT 0,
    cost_date      TEXT,
    payment_method TEXT    DEFAULT 'cash',
    notes          TEXT    DEFAULT '',
    source         TEXT,
    created_at     TEXT    DEFAULT (datetime('now'))
  )`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// ── Backfill dates on fabric/cost/external_cost items ──────────────────────
// Items added before date-stamping was introduced have no `date` field.
// Set their date to the project's created_at so the ledger filter works.
try {
  const ppRows = db.prepare(`
    SELECT pp.id, pp.fabrics, pp.costs, pp.external_costs,
           COALESCE(proj.created_at, pp.created_at) as best_date
    FROM project_products pp
    LEFT JOIN projects proj ON proj.id = pp.project_id
  `).all();

  const normD = d => d ? d.replace(' ', 'T').split('T')[0] : null;

  for (const r of ppRows) {
    const projectDate = normD(r.best_date);
    if (!projectDate) continue;

    const fabs  = JSON.parse(r.fabrics         || '[]');
    const costs = JSON.parse(r.costs           || '[]');
    const exts  = JSON.parse(r.external_costs  || '[]');

    let changed = false;
    const newFabs  = fabs.map(f  => { if (!f.date)  { changed = true; return { ...f,  date: projectDate }; } return f;  });
    const newCosts = costs.map(c => { if (!c.date)  { changed = true; return { ...c,  date: projectDate }; } return c;  });
    const newExts  = exts.map(e  => { if (!e.date)  { changed = true; return { ...e,  date: projectDate }; } return e;  });

    if (changed) {
      db.prepare('UPDATE project_products SET fabrics=?, costs=?, external_costs=? WHERE id=?')
        .run(JSON.stringify(newFabs), JSON.stringify(newCosts), JSON.stringify(newExts), r.id);
    }
  }
} catch (e) {
  console.error('[DB] fabric/cost date backfill error:', e.message);
}

// ── Backfill completed_at for projects already marked completed ────────────
// Best guess for pre-existing data: use updated_at, since that's the closest
// signal we have to "when this was last touched while completed".
try {
  db.exec(`UPDATE projects SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL`);
} catch (e) {
  console.error('[DB] completed_at backfill error:', e.message);
}

// ── Fix: make project_vendor_payments.project_vendor_id nullable ───────────
// Shipping payments have no project_vendor row, so the FK constraint breaks.
// We recreate the table if the column is still NOT NULL.
try {
  const colInfo = db.prepare("PRAGMA table_info(project_vendor_payments)").all();
  const pvpIdCol = colInfo.find(c => c.name === 'project_vendor_id');
  if (pvpIdCol && pvpIdCol.notnull === 1) {
    db.transaction(() => {
      db.exec(`CREATE TABLE project_vendor_payments_v2 (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_vendor_id INTEGER REFERENCES project_vendors(id) ON DELETE CASCADE,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        amount            REAL NOT NULL,
        method            TEXT DEFAULT 'cash',
        reference         TEXT DEFAULT '',
        notes             TEXT DEFAULT '',
        paid_at           TEXT DEFAULT (datetime('now')),
        created_at        TEXT DEFAULT (datetime('now')),
        receipt_url       TEXT DEFAULT '',
        shipping_id       INTEGER REFERENCES project_shipping(id) ON DELETE SET NULL
      )`);
      // Copy existing rows; shipping_id defaults to NULL for old rows
      db.exec(`INSERT INTO project_vendor_payments_v2
        (id, project_vendor_id, project_id, amount, method, reference, notes, paid_at, created_at, receipt_url)
        SELECT id, project_vendor_id, project_id, amount, method, reference, notes, paid_at, created_at,
               COALESCE(receipt_url,'')
        FROM project_vendor_payments`);
      db.exec(`DROP TABLE project_vendor_payments`);
      db.exec(`ALTER TABLE project_vendor_payments_v2 RENAME TO project_vendor_payments`);
    })();
    console.log('[DB] project_vendor_payments recreated with nullable project_vendor_id');
  }
} catch (e) {
  console.error('[DB] Migration error (project_vendor_payments):', e.message);
}

// ── Seed cost_breakdown_items if empty ─────────────────────────────────────
const DEFAULT_COST_ITEMS = [
  { key: 'fabric',       label: 'Fabric' },
  { key: 'cutting',      label: 'Cutting' },
  { key: 'printing',     label: 'Printing' },
  { key: 'embroidery',   label: 'Embroidery' },
  { key: 'acid_wash',    label: 'Acid Wash' },
  { key: 'rhinestone',   label: 'Rhinestone' },
  { key: 'sublimation',  label: 'Sublimation' },
  { key: 'cards_labels', label: 'Cards & Labels' },
  { key: 'stitching',    label: 'Stitching' },
  { key: 'packing',      label: 'Packing' },
  { key: 'overhead',     label: 'Overhead' },
  { key: 'other',        label: 'Other Expenses' },
];

// ── Seed default settings ──────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  base_currency:        'PKR',
  pkr_to_usd:           '0.00358',
  default_bank_details: 'Bank Name: \nAccount Title: \nAccount Number: \nIBAN: \nSwift Code: \nBranch: ',
  default_terms:        'Production will take 3-4 weeks after order confirmation.\nDelivery will take 5-7 working days after production.\nThis quotation is valid for 15-20 days from the date of issue.\nPayment Terms: 50% advance payment required to start production, remaining 50% before shipment.\nAll prices are in the stated currency and subject to change without prior notice.',
  company_name:         '',
  company_logo:         '',
  company_address:      '',
  company_city:         '',
  company_country:      '',
  company_phone:        '',
  company_email:        '',
  company_website:      '',
};

export function seedSettings() {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => insert.run(k, v));
}

seedSettings();

export function seedCostItems() {
  const count = db.prepare('SELECT COUNT(*) as n FROM cost_breakdown_items').get().n;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO cost_breakdown_items (key, label, enabled, sort_order) VALUES (?, ?, 1, ?)');
    DEFAULT_COST_ITEMS.forEach((item, i) => insert.run(item.key, item.label, i));
  }
}

export { DEFAULT_COST_ITEMS };

seedCostItems();

// ── Seed default currencies ────────────────────────────────────────────────
const DEFAULT_CURRENCIES = [
  { code: 'USD', name: 'US Dollar',        symbol: '$',  rate_to_usd: 1,       is_default: 1 },
  { code: 'PKR', name: 'Pakistani Rupee',  symbol: '₨', rate_to_usd: 0.00358, is_default: 0 },
  { code: 'EUR', name: 'Euro',             symbol: '€',  rate_to_usd: 1.08,    is_default: 0 },
  { code: 'GBP', name: 'British Pound',    symbol: '£',  rate_to_usd: 1.27,    is_default: 0 },
  { code: 'AED', name: 'UAE Dirham',       symbol: 'د.إ',rate_to_usd: 0.272,   is_default: 0 },
];

export function seedCurrencies() {
  const count = db.prepare('SELECT COUNT(*) as n FROM currencies').get().n;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO currencies (code, name, symbol, rate_to_usd, is_default) VALUES (?, ?, ?, ?, ?)'
    );
    DEFAULT_CURRENCIES.forEach(c => insert.run(c.code, c.name, c.symbol, c.rate_to_usd, c.is_default));
  }
}

seedCurrencies();

// ── Seed companies from existing single-company settings ───────────────────
export function seedCompanies() {
  const count = db.prepare('SELECT COUNT(*) as n FROM companies').get().n;
  if (count > 0) return;
  // Migrate any data the user already saved in the old single-company settings
  const sMap = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(({ key, value }) => { sMap[key] = value; });
  const name = sMap.company_name || '';
  if (name) {
    db.prepare(`
      INSERT INTO companies (name, logo, address, city, country, phone, email, website, tax_number, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 1)
    `).run(name, sMap.company_logo || '', sMap.company_address || '', sMap.company_city || '',
           sMap.company_country || '', sMap.company_phone || '', sMap.company_email || '', sMap.company_website || '');
  }
}
seedCompanies();

// ── Seed monthly_opening_balances from the old single opening-balance setting ──
export function seedMonthlyOpeningBalance() {
  const count = db.prepare('SELECT COUNT(*) as n FROM monthly_opening_balances').get().n;
  if (count > 0) return;
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('opening_balance','opening_balance_date')").all();
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const amount = parseFloat(map.opening_balance) || 0;
  const date   = map.opening_balance_date;
  if (amount > 0 && date) {
    db.prepare('INSERT OR IGNORE INTO monthly_opening_balances (month, amount) VALUES (?, ?)').run(date.slice(0, 7), amount);
  }
}
seedMonthlyOpeningBalance();

// ── Restore-damage repair ──────────────────────────────────────────────────
// A backup restore that didn't re-seed AUTOINCREMENT counters leaves
// sqlite_sequence behind the real MAX(id). The next new row (a project,
// invoice, …) then reuses an id that orphaned child rows still reference, so
// unrelated products / line items appear under it. Fix both on every boot:
//   1. bump every sequence up to MAX(id) so new ids never collide
//   2. delete project child rows whose parent project no longer exists
try {
  const seqTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%AUTOINCREMENT%'"
  ).all().map(r => r.name);
  for (const t of seqTables) {
    const m = db.prepare(`SELECT COALESCE(MAX(id),0) AS v FROM "${t}"`).get().v || 0;
    const cur = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(t)?.seq ?? -1;
    if (cur < m) {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(t);
      db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)").run(t, m);
    }
  }
} catch (e) { console.error('[DB] sequence repair:', e.message); }

try {
  for (const child of ['project_products','project_stages','project_boxes','project_vendors','project_shipping','project_vendor_payments','project_workers']) {
    const n = db.prepare(`DELETE FROM "${child}" WHERE project_id NOT IN (SELECT id FROM projects)`).run().changes;
    if (n > 0) console.log(`[DB] removed ${n} orphaned ${child} row(s)`);
  }
} catch (e) { console.error('[DB] orphan cleanup:', e.message); }

// A freight vendor's lump-sum payment used to be spread over its shipments only;
// whatever was left was parked as an overpayment on the newest shipment even when
// the same vendor still had unpaid project-vendor lines (e.g. a "Full Shipping"
// line on another project). That made one project look massively overpaid and the
// other unpaid. Move such parked surplus onto the vendor's unpaid lines — oldest
// line first, newest payment first. Vendor totals, payment dates and batches are
// unchanged; only the project the money is attributed to changes. Idempotent.
export function repairVendorSurplus() {
  const billed = pv => {
    let tasks = [];
    try { tasks = JSON.parse(pv.tasks || '[]'); } catch {}
    const t = (Array.isArray(tasks) ? tasks : []).reduce((s, x) =>
      s + (x.type === 'per_piece' ? (parseFloat(x.agreed) || 0) * (parseFloat(x.qty) || 0) : (parseFloat(x.agreed) || 0)), 0);
    return t > 0 ? t : (parseFloat(pv.invoice_amount) || 0);
  };
  let moved = 0;
  db.transaction(() => {
    const overpaid = db.prepare(`
      SELECT id, vendor_id, amount, paid_amount FROM project_shipping
      WHERE vendor_id IS NOT NULL AND COALESCE(paid_amount,0) > COALESCE(amount,0) + 0.005
      ORDER BY shipping_date DESC, id DESC
    `).all();
    for (const ship of overpaid) {
      const lines = db.prepare(`
        SELECT pv.id, pv.project_id, pv.tasks, pv.invoice_amount,
          COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE project_vendor_id = pv.id), 0) as paid
        FROM project_vendors pv WHERE pv.vendor_id = ? ORDER BY pv.created_at ASC, pv.id ASC
      `).all(ship.vendor_id).map(pv => ({ ...pv, due: billed(pv) - pv.paid })).filter(pv => pv.due > 0.005);
      if (!lines.length) continue;

      let excess = (parseFloat(ship.paid_amount) || 0) - (parseFloat(ship.amount) || 0);
      let shipMoved = 0;
      const pays = db.prepare('SELECT * FROM project_vendor_payments WHERE shipping_id = ? ORDER BY paid_at DESC, id DESC').all(ship.id);
      for (const p of pays) {
        let left = parseFloat(p.amount) || 0;           // still on the shipment
        let take = Math.min(left, excess);               // surplus portion of this payment
        let batchId = p.batch_id;
        while (take > 0.005 && lines.length) {
          const pv = lines[0];
          const mv = Math.min(take, pv.due);
          if (mv >= left - 0.005) {
            // Whole remaining payment moves — re-point the row
            db.prepare('UPDATE project_vendor_payments SET project_vendor_id = ?, project_id = ?, shipping_id = NULL WHERE id = ?')
              .run(pv.id, pv.project_id, p.id);
          } else {
            // Split: keep the rest on the shipment, same batch so history shows one transaction
            if (!batchId) {
              batchId = randomUUID();
              db.prepare('UPDATE project_vendor_payments SET batch_id = ? WHERE id = ?').run(batchId, p.id);
            }
            db.prepare('UPDATE project_vendor_payments SET amount = amount - ? WHERE id = ?').run(mv, p.id);
            db.prepare(`
              INSERT INTO project_vendor_payments (project_vendor_id, project_id, amount, method, reference, notes, paid_at, created_at, receipt_url, batch_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(pv.id, pv.project_id, mv, p.method, p.reference || '', p.notes || '', p.paid_at, p.created_at, p.receipt_url || '', batchId);
          }
          left -= mv; take -= mv; excess -= mv; shipMoved += mv;
          pv.due -= mv;
          if (pv.due <= 0.005) lines.shift();
        }
        if (excess <= 0.005 || !lines.length) break;
      }
      if (shipMoved > 0) {
        db.prepare('UPDATE project_shipping SET paid_amount = paid_amount - ?, paid = CASE WHEN paid_amount - ? >= amount THEN 1 ELSE 0 END WHERE id = ?')
          .run(shipMoved, shipMoved, ship.id);
        moved += shipMoved;
      }
    }
  })();
  if (moved > 0) console.log(`[DB] re-applied ₨${Math.round(moved).toLocaleString()} of parked shipping surplus to unpaid vendor lines`);
  return moved;
}
try { repairVendorSurplus(); } catch (e) { console.error('[DB] vendor surplus repair:', e.message); }

// ── One-screen costing: move project costs into Expenses ─────────────────────
// Projects used to carry their own cost records (fabric lines, process costs,
// vendor & shipping payments, workers, extra costs). All spending is now entered
// once, on the Expenses screen, optionally charged to a project. This converts
// every amount those old records show as PAID into an expense linked to its
// project — same amount, and the same date the Ledger already used for it — so
// cash totals don't move. Unpaid balances are not carried over. Runs once
// (settings flag; every row also gets a `source` key); the old tables are left
// untouched as history.
export function migrateProjectCostsToExpenses() {
  if (db.prepare("SELECT value FROM settings WHERE key = 'project_costs_in_expenses'").get()) return 0;

  const day   = d => String(d || '').replace(' ', 'T').slice(0, 10) || null;
  const num   = v => parseFloat(v) || 0;
  const parse = s => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const method = m => (m === 'bank_transfer' ? 'bank transfer' : (m || 'cash'));
  const category = (name, color) => {
    const row = db.prepare('SELECT id FROM expense_categories WHERE LOWER(TRIM(name)) = LOWER(?)').get(name);
    return row ? row.id : db.prepare('INSERT INTO expense_categories (name, color, icon) VALUES (?, ?, ?)').run(name, color, '').lastInsertRowid;
  };

  let moved = 0, total = 0;
  db.transaction(() => {
    const FABRIC = category('Fabric Expanses', '#6366f1');
    const PROD   = category('Production',      '#8b5cf6');
    const EXTRA  = category('Project Extras',  '#f97316');
    const projectIds = new Set(db.prepare('SELECT id FROM projects').all().map(r => r.id));
    const seen = db.prepare('SELECT 1 FROM expenses WHERE source = ?');
    const ins  = db.prepare(`
      INSERT INTO expenses (title, category, expense_category_id, amount, paid_by, expense_date, notes,
                            payment_method, receipt_url, recurring, recurring_period, project_id, paid_to, source)
      VALUES (?, '', ?, ?, '', ?, ?, ?, '', 0, 'monthly', ?, ?, ?)`);
    const add = ({ title, cat, amount, date, notes = '', payMethod = 'cash', project, paidTo = '', source }) => {
      if (!(amount > 0) || seen.get(source)) return;
      ins.run(String(title || 'Project cost').slice(0, 200), cat, amount, date, notes, payMethod,
              projectIds.has(project) ? project : null, paidTo || '', source);
      moved++; total += amount;
    };
    // Shipping payments land on their shipment (project Shipping tab), not in Expenses
    const seenShip = db.prepare('SELECT 1 FROM shipping_costs WHERE source = ?');
    const insShip  = db.prepare(`INSERT INTO shipping_costs (shipment_id, project_id, amount, cost_date, payment_method, notes, source)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const addShip = ({ shipment, project, amount, date, notes = '', payMethod = 'cash', source }) => {
      if (!(amount > 0) || !shipment || seenShip.get(source)) return;
      insShip.run(shipment, projectIds.has(project) ? project : null, amount, date, payMethod, notes, source);
      moved++; total += amount;
    };

    for (const p of db.prepare('SELECT id, created_at, updated_at, fabrics, extra_costs FROM projects').all()) {
      const created = day(p.created_at);
      for (const pp of db.prepare('SELECT * FROM project_products WHERE project_id = ?').all(p.id)) {
        const qty  = num(pp.total_quantity);
        const fabs = parse(pp.fabrics);
        fabs.forEach((f, i) => add({ project: p.id, cat: FABRIC, title: f.name || 'Fabric', amount: num(f.amount_paid),
          date: day(f.date) || created, source: `pp${pp.id}.fabric.${i}`,
          notes: `${f.qty || 0} ${f.unit || ''} × ₨${f.rate || 0} · ${pp.product_name}` }));
        if (!fabs.length) add({ project: p.id, cat: FABRIC, title: pp.fabric_material || 'Fabric', amount: num(pp.fabric_amount_paid),
          date: created, source: `pp${pp.id}.fabric`, notes: pp.product_name });
        parse(pp.costs).forEach((c, i) => add({ project: p.id, cat: PROD, title: `${c.label || c.key || 'Process'} — ${pp.product_name}`,
          amount: num(c.amount_paid), date: day(c.date) || created, source: `pp${pp.id}.cost.${c.key ?? i}`,
          notes: `₨${c.cost_per_piece || 0}/pc × ${qty} pcs` }));
        parse(pp.external_costs).forEach((e, i) => add({ project: p.id, cat: PROD, title: e.label || 'External cost',
          amount: num(e.amount_paid), date: day(e.date) || created, source: `pp${pp.id}.ext.${e.id ?? i}`, notes: pp.product_name }));
      }
      parse(p.fabrics).forEach((f, i) => add({ project: p.id, cat: FABRIC, title: f.name || 'Fabric', amount: num(f.amount_paid),
        date: day(f.date) || created, source: `p${p.id}.fabric.${f.id ?? i}`,
        notes: `${f.qty || 0} ${f.unit || ''} × ₨${f.rate || 0}` }));
      parse(p.extra_costs).forEach((c, i) => add({ project: p.id, cat: EXTRA, title: c.label || 'Extra cost', amount: num(c.amount),
        date: day(c.date) || day(p.updated_at) || created, source: `p${p.id}.extra.${c.id ?? i}`, notes: c.notes || '' }));
    }

    // Vendor & shipping payments (one expense per payment, same date and method)
    for (const x of db.prepare(`
      SELECT pvp.*, pv.vendor_name, pv.service_description, pv.project_id AS line_project,
             ps.carrier, ps.tracking_number, ps.project_id AS ship_project, v.name AS ship_vendor
      FROM project_vendor_payments pvp
      LEFT JOIN project_vendors  pv ON pv.id = pvp.project_vendor_id
      LEFT JOIN project_shipping ps ON ps.id = pvp.shipping_id
      LEFT JOIN vendors          v  ON v.id  = ps.vendor_id`).all()) {
      const project = x.project_id || x.line_project || x.ship_project;
      const notes = [x.reference, x.notes].filter(s => s && String(s).trim()).join(' · ');
      if (x.shipping_id) {
        addShip({ shipment: x.shipping_id, project: x.ship_project || project, amount: num(x.amount), date: day(x.paid_at),
          payMethod: method(x.method), source: `pvp${x.id}`, notes });
      } else if (x.vendor_name) {
        add({ project, cat: PROD, title: x.service_description ? `${x.vendor_name} — ${x.service_description}` : x.vendor_name,
          paidTo: x.vendor_name, amount: num(x.amount), date: day(x.paid_at), payMethod: method(x.method), source: `pvp${x.id}`, notes });
      } else {
        add({ project, cat: PROD, title: 'Vendor payment', amount: num(x.amount), date: day(x.paid_at), payMethod: method(x.method),
          source: `pvp${x.id}`, notes: ['Its vendor line had been deleted', notes].filter(Boolean).join(' · ') });
      }
    }

    // Contract workers' paid amounts
    for (const w of db.prepare('SELECT * FROM project_workers WHERE paid_amount > 0').all()) {
      add({ project: w.project_id, cat: PROD, title: w.task_description ? `${w.worker_name} — ${w.task_description}` : w.worker_name,
        paidTo: w.worker_name, amount: num(w.paid_amount), date: day(w.created_at), source: `pw${w.id}`, notes: w.notes || '' });
    }

    // Shipping marked paid without matching payment rows (older data)
    for (const s of db.prepare(`
      SELECT ps.*, v.name AS vendor_name,
             ps.paid_amount - COALESCE((SELECT SUM(amount) FROM project_vendor_payments WHERE shipping_id = ps.id), 0) AS unrecorded
      FROM project_shipping ps LEFT JOIN vendors v ON v.id = ps.vendor_id`).all()) {
      addShip({ shipment: s.id, project: s.project_id, amount: num(s.unrecorded),
        date: day(s.shipping_date) || day(s.created_at), source: `ps${s.id}` });
    }

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('project_costs_in_expenses', ?)")
      .run(JSON.stringify({ at: new Date().toISOString(), expenses: moved, total }));
  })();
  console.log(`[DB] moved ${moved} project cost record(s) (₨${Math.round(total).toLocaleString()}) into Expenses / shipping costs`);
  return moved;
}
try { migrateProjectCostsToExpenses(); } catch (e) { console.error('[DB] project costs → expenses:', e.message); }

// The first version of the conversion put old shipping payments into Expenses.
// Shipping costs now live on the shipments themselves: move each of those
// expenses onto the shipment it paid for (same amount, date and method).
// Runs once (settings flag); totals are unchanged.
export function moveShippingExpensesToShipments() {
  if (db.prepare("SELECT value FROM settings WHERE key = 'shipping_costs_from_expenses'").get()) return 0;
  let moved = 0, total = 0;
  db.transaction(() => {
    const shipOfPayment = db.prepare('SELECT shipping_id FROM project_vendor_payments WHERE id = ?');
    const shipment      = db.prepare('SELECT id, project_id FROM project_shipping WHERE id = ?');
    const ins = db.prepare(`INSERT INTO shipping_costs (shipment_id, project_id, amount, cost_date, payment_method, notes, source)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const del = db.prepare('DELETE FROM expenses WHERE id = ?');
    for (const e of db.prepare("SELECT * FROM expenses WHERE source LIKE 'pvp%' OR source LIKE 'ps%'").all()) {
      const m = /^(pvp|ps)(\d+)$/.exec(e.source || '');
      if (!m) continue;
      const shipId = m[1] === 'ps' ? +m[2] : shipOfPayment.get(+m[2])?.shipping_id;
      const ship = shipId ? shipment.get(shipId) : null;
      if (!ship) continue; // a vendor (non-shipping) payment — stays an expense
      const notes = String(e.notes || '').replace(/^Tracking [^·]*(· )?/, '').trim();
      ins.run(ship.id, ship.project_id, e.amount, e.expense_date, e.payment_method || 'cash', notes, e.source);
      del.run(e.id);
      moved++; total += parseFloat(e.amount) || 0;
    }
    // The first conversion created a "Shipping" expense category for these;
    // shipping isn't entered as an expense any more, so drop it if now empty.
    const cat = db.prepare("SELECT id FROM expense_categories WHERE LOWER(TRIM(name)) = 'shipping'").get();
    if (cat && !db.prepare('SELECT 1 FROM expenses WHERE expense_category_id = ?').get(cat.id)) {
      db.prepare('DELETE FROM expense_categories WHERE id = ?').run(cat.id);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('shipping_costs_from_expenses', ?)")
      .run(JSON.stringify({ at: new Date().toISOString(), moved, total }));
  })();
  if (moved) console.log(`[DB] moved ${moved} shipping payment(s) (₨${Math.round(total).toLocaleString()}) from Expenses onto their shipments`);
  return moved;
}
try { moveShippingExpensesToShipments(); } catch (e) { console.error('[DB] shipping expenses → shipments:', e.message); }

// ── Shipping agents: build the list once from the agents already used ──────
// Creates a profile for every agent name on existing shipments (copying contact
// details from the old freight-vendor record when there is one) and links those
// shipments to it. Runs once (settings flag); also after restoring an older backup.
export function seedShippingAgents() {
  if (db.prepare("SELECT value FROM settings WHERE key = 'shipping_agents_seeded'").get()) return 0;
  let created = 0;
  db.transaction(() => {
    const findAgent = db.prepare('SELECT id FROM shipping_agents WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))');
    const insAgent  = db.prepare(`INSERT INTO shipping_agents (name, contact_name, phone, email, address, city, country)
                                  VALUES (?, ?, ?, ?, ?, ?, ?)`);
    let vendorById = new Map();
    try {
      vendorById = new Map(db.prepare("SELECT * FROM vendors").all().map(v => [v.id, v]));
    } catch { /* vendors table not present */ }

    const used = db.prepare(`
      SELECT DISTINCT TRIM(carrier) AS name, vendor_id FROM project_shipping
      WHERE TRIM(COALESCE(carrier, '')) != ''
    `).all();
    const freight = [...vendorById.values()].filter(v => v.type === 'freight' || v.type === 'shipping')
      .map(v => ({ name: (v.name || '').trim(), vendor_id: v.id }));

    for (const { name, vendor_id } of [...used, ...freight]) {
      if (!name || findAgent.get(name)) continue;
      const v = vendorById.get(vendor_id) || [...vendorById.values()].find(x => (x.name || '').trim().toLowerCase() === name.toLowerCase()) || {};
      insAgent.run(name, v.contact_name || '', v.phone || '', v.email || '', v.address || '', v.city || '', v.country || '');
      created++;
    }
    // Link existing shipments to their agent by name
    db.prepare(`
      UPDATE project_shipping SET agent_id = (
        SELECT sa.id FROM shipping_agents sa WHERE LOWER(TRIM(sa.name)) = LOWER(TRIM(project_shipping.carrier))
      ) WHERE agent_id IS NULL AND TRIM(COALESCE(carrier, '')) != ''
    `).run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('shipping_agents_seeded', ?)").run(new Date().toISOString());
  })();
  if (created) console.log(`[DB] created ${created} shipping agent profile(s) from existing shipments`);
  return created;
}
try { seedShippingAgents(); } catch (e) { console.error('[DB] shipping agents seed:', e.message); }

// The Inventory and Loans modules were removed. Drop their tables — but only
// after writing a JSON copy of every row next to the database file, so the data
// can still be recovered. If the copy can't be written, nothing is dropped.
try {
  const REMOVED = ['inventory_transactions', 'inventory_items', 'inventory', 'loan_repayments', 'capital_loans'];
  const present = REMOVED.filter(t => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t));
  if (present.length) {
    const copy = {};
    for (const t of present) copy[t] = db.prepare(`SELECT * FROM "${t}"`).all();
    const file = join(dirname(DB_PATH), `removed-modules-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, JSON.stringify({ removed_at: new Date().toISOString(), tables: copy }, null, 1));
    for (const t of present) db.exec(`DROP TABLE IF EXISTS "${t}"`);
    console.log(`[DB] removed modules: dropped ${present.join(', ')} — data copy saved to ${file}`);
  }
} catch (e) { console.error('[DB] removed-module cleanup:', e.message); }

// Collapse duplicate project_stages rows (same project + stage_key) left by an
// id collision, keeping the earliest.
try {
  const n = db.prepare(`
    DELETE FROM project_stages
    WHERE id NOT IN (SELECT MIN(id) FROM project_stages GROUP BY project_id, stage_key)
  `).run().changes;
  if (n > 0) console.log(`[DB] removed ${n} duplicate project_stages row(s)`);
} catch (e) { console.error('[DB] stage dedup:', e.message); }

// Migrate projects that haven't started production yet to the new 3-stage
// pipeline (Cutting & Decoration / Stitching / Press & Pack). Only touches
// projects where every stage is still 'pending' — nothing in progress is lost.
try {
  const CUT_DEC_TASKS = JSON.stringify([
    { id: 1, label: 'Cutting',                 enabled: true,  done: false },
    { id: 2, label: 'Sublimation',             enabled: false, done: false },
    { id: 3, label: 'Embroidery',              enabled: false, done: false },
    { id: 4, label: 'Screen Print / Stickers', enabled: false, done: false },
    { id: 5, label: 'Acid Wash',               enabled: false, done: false },
  ]);
  const untouched = db.prepare(`
    SELECT p.id FROM projects p
    WHERE (SELECT COUNT(*) FROM project_stages s WHERE s.project_id = p.id AND s.status != 'pending') = 0
      AND (SELECT COUNT(*) FROM project_stages s WHERE s.project_id = p.id) > 0
      AND (SELECT COUNT(*) FROM project_stages s WHERE s.project_id = p.id AND s.stage_key = 'cutting_decoration') = 0
  `).all();
  const del = db.prepare('DELETE FROM project_stages WHERE project_id = ?');
  const ins = db.prepare('INSERT INTO project_stages (project_id, stage_key, stage_name, enabled, status, sort_order, tasks) VALUES (?, ?, ?, 1, ?, ?, ?)');
  for (const { id } of untouched) {
    del.run(id);
    ins.run(id, 'cutting_decoration', 'Cutting & Decoration', 'pending', 1, CUT_DEC_TASKS);
    ins.run(id, 'stitching',          'Stitching',            'pending', 2, '[]');
    ins.run(id, 'press_pack',         'Press & Pack',         'pending', 3, '[]');
  }
  if (untouched.length > 0) console.log(`[DB] migrated ${untouched.length} project(s) to the 3-stage pipeline`);
} catch (e) { console.error('[DB] stage migration:', e.message); }

// Any client whose `name` ended up blank (older quick-add flows, imports) breaks
// the "Bill To" line on invoices — backfill it from the best available field.
try {
  const n = db.prepare(`
    UPDATE clients SET name = CASE
      WHEN TRIM(COALESCE(display_name,'')) != '' THEN TRIM(display_name)
      WHEN TRIM(COALESCE(name_primary,'')) != '' THEN TRIM(name_primary)
      WHEN TRIM(COALESCE(company,''))      != '' THEN TRIM(company)
      ELSE 'Unnamed Client' END
    WHERE TRIM(COALESCE(name,'')) = ''
  `).run().changes;
  if (n > 0) console.log(`[DB] backfilled name on ${n} client(s)`);
} catch (e) { console.error('[DB] client name backfill:', e.message); }

// ── Seed rate_to_pkr from existing rate_to_usd data ───────────────────────
export function seedRateToPkr() {
  // Only run if any currency still has rate_to_pkr = 0
  const needsSeed = db.prepare('SELECT COUNT(*) as n FROM currencies WHERE rate_to_pkr = 0 OR rate_to_pkr IS NULL').get().n;
  if (!needsSeed) return;

  const sMap = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(({ key, value }) => { sMap[key] = value; });
  const pkrToUsd = parseFloat(sMap.pkr_to_usd) || 0.00358;  // how many USD per 1 PKR

  // PKR itself is always 1
  db.prepare("UPDATE currencies SET rate_to_pkr = 1 WHERE code = 'PKR'").run();

  // Every other currency: rate_to_pkr = rate_to_usd / pkrToUsd
  const others = db.prepare("SELECT id, code, rate_to_usd FROM currencies WHERE code != 'PKR'").all();
  const upd = db.prepare('UPDATE currencies SET rate_to_pkr = ? WHERE id = ?');
  for (const c of others) {
    const r = parseFloat(c.rate_to_usd) || 1;
    upd.run(Math.round((r / pkrToUsd) * 100) / 100, c.id);
  }
}

seedRateToPkr();

// Safety: PKR is the fixed conversion pivot — its rate must always be exactly 1.
try { db.prepare("UPDATE currencies SET rate_to_pkr = 1 WHERE code = 'PKR' AND rate_to_pkr != 1").run(); } catch {}

// ── Seed default document templates ────────────────────────────────────────
export function seedDocumentTemplates() {
  // 5 ready-to-use templates per document type. Idempotent: only inserts a
  // (type, name) pair that doesn't exist yet, so user edits are never clobbered.
  const cfg = (primaryColor, extra = {}) => JSON.stringify({
    primaryColor, showBankDetails: true, showTerms: true, showWatermark: false, watermarkText: '', footerText: '', ...extra,
  });
  const PRESETS = [
    { name: 'Classic',  layout: 'classic', config: cfg('#4f46e5') },
    { name: 'Modern',   layout: 'modern',  config: cfg('#0f172a') },
    { name: 'Minimal',  layout: 'minimal', config: cfg('#000000') },
    { name: 'Elegant',  layout: 'elegant', config: cfg('#7c3aed') },
    { name: 'Bold',     layout: 'bold',    config: cfg('#ef4444') },
  ];
  const exists = db.prepare('SELECT id FROM document_templates WHERE type = ? AND name = ?');
  const ins    = db.prepare("INSERT INTO document_templates (name, type, layout, is_default, config) VALUES (?, ?, ?, ?, ?)");
  for (const type of ['quotation', 'invoice', 'voucher']) {
    const hasDefault = db.prepare('SELECT COUNT(*) as n FROM document_templates WHERE type = ? AND is_default = 1').get(type).n > 0;
    PRESETS.forEach((p, i) => {
      if (exists.get(type, p.name)) return;
      ins.run(p.name, type, p.layout, (!hasDefault && i === 0) ? 1 : 0, p.config);
    });
  }
}
seedDocumentTemplates();

// ── Seed default users ─────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';

export function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    );
    const DEFAULT_USERS = [
      { name: 'Super Admin',       username: 'admin',     email: 'admin@apparel.com',     password: 'admin123',     role: 'super_admin' },
      { name: 'Sales Manager',     username: 'sales',     email: 'sales@apparel.com',     password: 'sales123',     role: 'sales'       },
    ];
    for (const u of DEFAULT_USERS) {
      const hash = bcrypt.hashSync(u.password, 10);
      ins.run(u.name, u.username, u.email, hash, u.role);
    }
  }
}
seedUsers();

// Confirm the on-disk file actually exists and has content after all the
// startup writes (schema + seeds). If this logs 0 / missing, saves are failing.
try {
  const { statSync } = await import('fs');
  console.log(`[DB] on-disk file after init: ${existsSync(DB_PATH) ? statSync(DB_PATH).size + ' bytes' : 'MISSING'}`);
} catch {}

export default db;
