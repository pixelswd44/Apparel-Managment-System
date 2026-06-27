-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  shipping_address TEXT,
  shipping_city VARCHAR(100),
  shipping_country VARCHAR(100),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotation Templates
CREATE TABLE IF NOT EXISTS quotation_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotations
CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,
  number VARCHAR(50) UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  status VARCHAR(20) DEFAULT 'draft',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  number VARCHAR(50) UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  quotation_id INTEGER REFERENCES quotations(id),
  status VARCHAR(20) DEFAULT 'unpaid',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id),
  client_id INTEGER REFERENCES clients(id),
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(50),
  reference VARCHAR(255),
  notes TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  supplier VARCHAR(255),
  description TEXT,
  amount NUMERIC(12,2),
  category VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  purchase_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  category VARCHAR(100),
  unit VARCHAR(50),
  quantity NUMERIC(12,2) DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  reorder_level NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  amount NUMERIC(12,2),
  paid_by VARCHAR(100),
  expense_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  salary NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  joined_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  period VARCHAR(20),
  base_salary NUMERIC(12,2),
  bonus NUMERIC(12,2) DEFAULT 0,
  deductions NUMERIC(12,2) DEFAULT 0,
  net_pay NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
