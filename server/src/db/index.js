import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../apparel.db');

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
    writeFileSync(this._path, Buffer.from(this._db.export()));
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

  CREATE TABLE IF NOT EXISTS inventory (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    sku           TEXT,
    category      TEXT,
    unit          TEXT,
    quantity      REAL DEFAULT 0,
    unit_cost     REAL DEFAULT 0,
    reorder_level REAL DEFAULT 0,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS inventory_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    category     TEXT DEFAULT 'fabric',
    unit         TEXT DEFAULT 'Yards',
    qty_total    REAL DEFAULT 0,
    qty_used     REAL DEFAULT 0,
    rate         REAL DEFAULT 0,
    notes        TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventory_transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id      INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,   -- 'in' | 'out' | 'adjustment'
    qty          REAL NOT NULL,
    reference    TEXT DEFAULT '', -- project name / note
    notes        TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now'))
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
  // Inventory price tracking per stock-in transaction
  `ALTER TABLE inventory_transactions ADD COLUMN unit_price REAL DEFAULT 0`,
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
  // Capital tracking: investments and loans
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
  `CREATE TABLE IF NOT EXISTS capital_loans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lender_name   TEXT    NOT NULL,
    amount        REAL    NOT NULL DEFAULT 0,
    date          TEXT    NOT NULL,
    interest_rate REAL    DEFAULT 0,
    due_date      TEXT    DEFAULT '',
    paid_amount   REAL    DEFAULT 0,
    notes         TEXT    DEFAULT '',
    status        TEXT    DEFAULT 'active',
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  )`,
  `ALTER TABLE capital_loans ADD COLUMN direction TEXT DEFAULT 'borrowed'`,
  `CREATE TABLE IF NOT EXISTS loan_repayments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id    INTEGER NOT NULL REFERENCES capital_loans(id) ON DELETE CASCADE,
    amount     REAL    NOT NULL DEFAULT 0,
    date       TEXT    NOT NULL,
    notes      TEXT    DEFAULT '',
    created_at TEXT    DEFAULT (datetime('now'))
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

// ── Seed default document templates ────────────────────────────────────────
export function seedDocumentTemplates() {
  const count = db.prepare('SELECT COUNT(*) as n FROM document_templates').get().n;
  if (count === 0) {
    const ins = db.prepare(
      "INSERT INTO document_templates (name, type, layout, is_default, config) VALUES (?, ?, ?, 1, ?)"
    );
    const defaultConfig = JSON.stringify({ primaryColor: '#4f46e5', showBankDetails: true, showTerms: true, showWatermark: false, watermarkText: '', footerText: '' });
    ins.run('Default', 'quotation', 'classic', defaultConfig);
    ins.run('Default', 'invoice',   'classic', defaultConfig);
    ins.run('Default', 'voucher',   'classic', defaultConfig);
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
      { name: 'Inventory Manager', username: 'inventory', email: 'inventory@apparel.com', password: 'inventory123', role: 'inventory'   },
    ];
    for (const u of DEFAULT_USERS) {
      const hash = bcrypt.hashSync(u.password, 10);
      ins.run(u.name, u.username, u.email, hash, u.role);
    }
  }
}
seedUsers();

export default db;
